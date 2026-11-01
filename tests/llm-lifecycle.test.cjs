const test = require("node:test");
const assert = require("node:assert/strict");
const { installLlm } = require("../main/llm.cjs");

function setup(t) {
    const handlers = new Map(), signals = [];
    let changed;
    const runtime = {
        uid: "account",
        config: { value: { llm: { endpoint: "https://example.test/v1", model: "test", mode: "draft" } }, secret: () => "" },
        store: { find: () => ({ msgId: "1", chatType: 2, peerUid: "group", elements: [{ textElement: { content: "你好" } }] }) },
        handle: (name, callback) => handlers.set(name, callback), onConfig: callback => { changed = callback; }, onMessages() {},
        broadcast() {}, sendElements() { throw new Error("草稿不能自动发送"); }
    };
    t.mock.method(globalThis, "fetch", (_url, options) => new Promise((_resolve, reject) => {
        signals.push(options.signal);
        options.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
    }));
    installLlm(runtime);
    t.after(() => changed({ previous: runtime.config.value, next: runtime.config.value, accountChanged: true }));
    return { handlers, signals, runtime, changed: value => changed(value) };
}

test("关闭草稿取消当前请求，其他窗口不能取消它", { timeout: 1000 }, async t => {
    const { handlers, signals } = setup(t);
    const request = handlers.get("draft")({ sender: { id: 1 } }, {}, "draft-a");
    const cancelled = assert.rejects(request, /cancelled/);
    handlers.get("cancelDraft")({ sender: { id: 2 } }, "draft-a");
    assert.equal(signals[0].aborted, false);
    handlers.get("cancelDraft")({ sender: { id: 1 } }, "draft-a");
    await cancelled;
});

test("切换账号取消尚未完成的草稿", { timeout: 1000 }, async t => {
    const { handlers, signals, runtime, changed } = setup(t);
    const request = handlers.get("draft")({ sender: { id: 1 } }, {}, "draft-a");
    const cancelled = assert.rejects(request, /cancelled/);
    changed({ previous: runtime.config.value, next: runtime.config.value, accountChanged: true });
    assert.equal(signals[0].aborted, true); await cancelled;
});

test("重复请求标识替换旧草稿，旧清理回调不会删掉新请求", { timeout: 1000 }, async t => {
    const { handlers, signals } = setup(t), event = { sender: { id: 1 } };
    const first = handlers.get("draft")(event, {}, "same");
    const cancelledFirst = assert.rejects(first, /cancelled/);
    const second = handlers.get("draft")(event, {}, "same");
    const cancelledSecond = assert.rejects(second, /cancelled/);
    await cancelledFirst;
    handlers.get("cancelDraft")(event, "same");
    assert.equal(signals[1].aborted, true); await cancelledSecond;
});
