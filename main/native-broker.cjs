const { randomUUID } = require("node:crypto");

// 每个请求绑定真实窗口和回调 ID，超时只报告结果未知，绝不自动重发。
class NativeBroker {
    constructor({ send, timeout = 8000, setTimer = setTimeout, clearTimer = clearTimeout }) {
        Object.assign(this, { send, timeout, setTimer, clearTimer });
        this.pending = new Map();
    }
    request(windowId, command, payload) {
        return new Promise((resolve, reject) => {
            const id = randomUUID();
            const timer = this.setTimer(() => {
                this.pending.delete(id);
                reject(new Error("QQ 原生请求超时，结果未知；请先检查会话，避免重复发送"));
            }, this.timeout);
            this.pending.set(id, { windowId, timer, resolve, reject });
            try { this.send(windowId, { id, command, payload }); }
            catch (error) { this.clearTimer(timer); this.pending.delete(id); reject(error); }
        });
    }
    complete(windowId, id, result, error) {
        const request = this.pending.get(id);
        if (!request || request.windowId !== windowId) return false;
        this.clearTimer(request.timer); this.pending.delete(id);
        if (error) request.reject(new Error(String(error))); else request.resolve(result);
        return true;
    }
    disconnect(windowId) {
        for (const [id, request] of this.pending) if (request.windowId === windowId) {
            this.clearTimer(request.timer); this.pending.delete(id); request.reject(new Error("QQ 窗口已关闭"));
        }
    }
}
module.exports = { NativeBroker };
