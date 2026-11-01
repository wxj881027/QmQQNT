const test = require("node:test");
const assert = require("node:assert/strict");
const { webCard, decorateMessage } = require("../main/cards.cjs");
test("小程序分享变为可打开的网页卡片", () => {
    const result = webCard({ bytesData: JSON.stringify({ app: "com.tencent.miniapp_01", meta: { detail_1: { qqdocurl: "https://example.test/page", title: "页面" } } }) });
    const data = JSON.parse(result.bytesData); assert.equal(data.app, "com.tencent.structmsg"); assert.equal(data.meta.news.jumpUrl, "https://example.test/page");
});
test("损坏卡片和无网页链接的卡片原样保留", () => {
    for (const card of [{ bytesData: "{" }, { bytesData: JSON.stringify({ app: "com.tencent.miniapp_01", meta: {} }) }, { bytesData: JSON.stringify({ app: "com.tencent.miniapp_01", meta: { detail_1: { qqdocurl: "javascript:alert(1)" } } }) }]) assert.equal(webCard(card), card);
});
test("去除原生气泡装饰不改变原始缓存对象", () => {
    const original = { elements: [], msgAttrs: new Map([[0, { vasMsgInfo: { bubbleInfo: { bubbleId: 5 } } }]]) };
    const visible = decorateMessage(original, {}); assert.equal(visible.msgAttrs.get(0).vasMsgInfo.bubbleInfo.bubbleId, 0); assert.equal(original.msgAttrs.get(0).vasMsgInfo.bubbleInfo.bubbleId, 5);
});
