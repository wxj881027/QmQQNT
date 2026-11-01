const test = require("node:test");
const assert = require("node:assert/strict");
const { NativeBroker } = require("../main/native-broker.cjs");
function setup() { const sent = [], timers = new Map(); let next = 0; return { sent, timers, broker: new NativeBroker({ send: (window, request) => sent.push({ window, request }), setTimer: fn => { timers.set(++next, fn); return next; }, clearTimer: id => timers.delete(id) }) }; }
test("其他窗口不能完成原生请求", async () => {
    const { sent, broker } = setup(), result = broker.request(1, "command", []);
    assert.equal(broker.complete(2, sent[0].request.id, "wrong"), false);
    assert.equal(broker.complete(1, sent[0].request.id, "right"), true); assert.equal(await result, "right");
});
test("请求超时只发送一次，迟到回调不会重复完成", async () => {
    const { sent, broker, timers } = setup(), result = broker.request(1, "command", []);
    const rejected = assert.rejects(result, /结果未知/); [...timers.values()][0](); await rejected;
    assert.equal(sent.length, 1); assert.equal(broker.complete(1, sent[0].request.id, "late"), false);
});
test("关闭窗口取消其所有请求", async () => {
    const { broker, timers } = setup(), result = broker.request(1, "command", []);
    const rejected = assert.rejects(result, /窗口已关闭/); broker.disconnect(1); await rejected;
    assert.equal(timers.size, 0); assert.equal(broker.pending.size, 0);
});
