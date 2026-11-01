const test = require("node:test");
const assert = require("node:assert/strict");
const { MessageStore } = require("../main/message-store.cjs");
const message = (id, peer = "group-a") => ({ msgId: id, peerUid: peer, chatType: 2, msgTime: "100", msgSeq: id, elements: [{ elementType: 1, textElement: { content: "原文" } }], msgAttrs: new Map([[0, { test: true }]]) });
const recalled = (original, extra = {}) => ({ ...original, elements: [{ grayTipElement: { revokeElement: { operatorUid: "operator", origMsgSenderUid: "sender", ...extra } } }] });
test("别人撤回的消息恢复原文，保留 Map 属性", () => {
    const store = new MessageStore(), original = message("9007199254740993"); store.remember(original);
    const result = store.restore(recalled(original), true);
    assert.equal(result.elements[0].textElement.content, "原文"); assert.equal(result.msgAttrs.get(0).test, true);
    assert.ok(store.metadata(original).recalled);
});
test("原生消息对象随后被修改也不会破坏缓存", () => {
    const store = new MessageStore(), original = message("1"); store.remember(original); original.elements[0].textElement.content = "已变";
    assert.equal(store.find(original).elements[0].textElement.content, "原文");
});
test("不同会话的相同消息 ID 不会串缓存", () => {
    const store = new MessageStore(), a = message("1", "a"), b = message("1", "b"); b.elements[0].textElement.content = "另一条";
    store.remember(a); store.remember(b); assert.equal(store.restore(recalled(a), true).elements[0].textElement.content, "原文");
});
test("自己撤回自己保留原生行为，管理员撤回别人仍恢复", () => {
    const store = new MessageStore(), original = message("1"); store.remember(original);
    const own = recalled(original, { isSelfOperate: true, operatorUid: "me", origMsgSenderUid: "me" });
    assert.equal(store.restore(own, true), own);
    assert.equal(store.restore(recalled(original, { isSelfOperate: true }), true).elements[0].textElement.content, "原文");
});
test("没有原文或关闭防撤回时完整保留通知", () => {
    const store = new MessageStore(), notification = recalled(message("1"));
    assert.equal(store.restore(notification, true), notification); store.remember(message("1")); assert.equal(store.restore(notification, false), notification);
});
test("本地计数去重并在持久化恢复后继续去重，序号单独记录", () => {
    const store = new MessageStore(), original = message("1000"); store.remember(original, true); store.remember(original, true);
    const restored = new MessageStore(store.snapshot()); restored.remember(original, true);
    assert.equal(restored.metadata(original).peer.observed, 1); assert.equal(restored.metadata(original).peer.lastSequence, "1000");
});
