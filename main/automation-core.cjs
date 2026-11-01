const { peerKey } = require("./message-store.cjs");

function allowed(config, message) { return config.enabled === true && Array.isArray(config.allowlist) && config.allowlist.includes(peerKey(message)); }
function walletKind(wallet) {
    const description = [wallet.receiver?.subTitle, wallet.receiver?.notice, wallet.receiver?.content, wallet.sender?.subTitle, wallet.name].filter(Boolean).join(" ");
    if (/语音红包|voice red.?packet/i.test(description)) return "voice";
    if (Number(wallet.redChannel) === 32 || Number(wallet.msgType) === 6) return "text";
    if ([2, 3].includes(Number(wallet.msgType))) return "ordinary";
    return "unsupported";
}
class OncePerMessage {
    constructor(limit = 5000) { this.limit = limit; this.seen = new Set(); }
    accept(key) {
        if (this.seen.has(key)) return false;
        this.seen.add(key); if (this.seen.size > this.limit) this.seen.delete(this.seen.values().next().value);
        return true;
    }
}
// 相同会话串行，独立会话互不阻塞；有限队列避免一次突发无限积压。
class KeyedQueue {
    constructor(limit = 32) { this.limit = limit; this.queues = new Map(); }
    run(key, task) {
        const state = this.queues.get(key) || { tail: Promise.resolve(), count: 0 };
        if (state.count >= this.limit) return Promise.reject(new Error("该会话自动化队列已满，已跳过新任务"));
        state.count++; this.queues.set(key, state);
        const result = state.tail.then(task, task);
        state.tail = result.catch(() => {});
        const finish = () => { state.count--; if (!state.count && this.queues.get(key) === state) this.queues.delete(key); };
        result.then(finish, finish);
        return result;
    }
}
module.exports = { allowed, walletKind, OncePerMessage, KeyedQueue };
