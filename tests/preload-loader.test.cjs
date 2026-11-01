const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function sandboxPreload(readyState) {
    const exposed = new Map(), calls = [], channels = new Set(), events = new Map();
    const root = path.resolve(__dirname, "../preload");
    const electron = {
        contextBridge: {
            exposeInMainWorld(name, api) { exposed.set(name, api); },
            executeInMainWorld() { return false; }
        },
        ipcRenderer: {
            invoke(name) {
                calls.push(name);
                assert.equal(name, "QmQQNT.ready");
                return Promise.resolve({ windowId: 42, config: {} });
            },
            on(name) { channels.add(name); },
            removeListener(name) { channels.delete(name); },
            send() { throw new Error("启动不应发出原生业务请求"); }
        }
    };
    const context = vm.createContext({
        document: { readyState, addEventListener(name, handler) { events.set(name, handler); } },
        window: { addEventListener() {} },
        crypto: { randomUUID: () => "test-request" },
        setTimeout, clearTimeout
    });
    function load(filename) {
        const absolute = path.resolve(filename);
        // 对应 LiteLoader 1.4.1 沙箱预加载器支持的 JavaScript 扩展名。
        if (path.extname(absolute) !== ".js") throw new Error("不支持此模块扩展名");
        assert.equal(path.dirname(absolute), root);
        const module = { exports: {} };
        const evaluate = new vm.Script(`(function(require, module, exports) {\n${fs.readFileSync(absolute, "utf8")}\n})`, { filename: absolute }).runInContext(context);
        evaluate(id => id === "electron" ? electron : load(path.resolve(path.dirname(absolute), id)), module, module.exports);
        return module.exports;
    }
    load(path.join(root, "index.js"));
    return { exposed, calls, channels, events };
}

test("仅支持 js 的沙箱加载器能暴露完整插件接口", async () => {
    const state = sandboxPreload("complete");
    assert.ok(state.exposed.has("liuli_api"));
    const ready = await state.exposed.get("qm_api").ready();
    assert.equal(ready.windowId, 42);
    assert.ok(state.channels.has("RM_IPCFROM_MAIN42"));
    assert.deepEqual(state.calls, ["QmQQNT.ready"]);
});

test("文档就绪前不注册原生窗口请求通道", async () => {
    const state = sandboxPreload("loading");
    assert.deepEqual(state.calls, []);
    state.events.get("DOMContentLoaded")();
    assert.equal((await state.exposed.get("qm_api").ready()).windowId, 42);
    assert.deepEqual(state.calls, ["QmQQNT.ready"]);
});
