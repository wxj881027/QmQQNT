const test = require("node:test");
const assert = require("node:assert/strict");
const { allowed, walletKind, OncePerMessage, KeyedQueue } = require("../main/automation-core.cjs");
const { normalize } = require("../main/feature-config.cjs");
const { generate } = require("../main/llm.cjs");
test("自动化需要同时启用且命中明确白名单", () => {
    const message = { chatType: 2, peerUid: "group-a" };
    assert.equal(allowed({ enabled: false, allowlist: ["2:group-a"] }, message), false);
    assert.equal(allowed({ enabled: true, allowlist: [] }, message), false);
    assert.equal(allowed({ enabled: true, allowlist: ["2:group-a"] }, message), true);
});
test("新配置默认草稿且红包自动化关闭", () => {
    const config = normalize(); assert.equal(config.llm.mode, "draft"); assert.equal(config.llm.enabled, false); assert.equal(config.redPacket.enabled, false);
});
test("错误的持久化布尔值不能意外启用语音发送", () => {
    const config = normalize({ redPacket: { voicePassword: "true", enabled: "true" } });
    assert.equal(config.redPacket.voicePassword, false); assert.equal(config.redPacket.enabled, false);
});
test("普通、文字、语音与未知红包明确区分", () => {
    assert.equal(walletKind({ msgType: 2 }), "ordinary"); assert.equal(walletKind({ redChannel: 32 }), "text");
    assert.equal(walletKind({ receiver: { subTitle: "语音红包" } }), "voice"); assert.equal(walletKind({ msgType: 999 }), "unsupported");
});
test("同一红包在多个窗口重复下发也只处理一次", () => {
    const seen = new OncePerMessage(); assert.equal(seen.accept("account:bill"), true); assert.equal(seen.accept("account:bill"), false); assert.equal(seen.accept("other:bill"), true);
});
test("同一会话的后续红包排队，不在上一个处理中丢失", async () => {
    const queue=new KeyedQueue(),events=[];let finish;
    const first=queue.run("peer",()=>new Promise(resolve=>{events.push("first");finish=resolve;}));
    const second=queue.run("peer",()=>{events.push("second");});
    await Promise.resolve(); assert.deepEqual(events,["first"]); finish(); await Promise.all([first,second]); assert.deepEqual(events,["first","second"]);
});
test("会话队列上限明确拒绝新任务，已有任务失败不堵住后续", async () => {
    const queue=new KeyedQueue(2);let finish;
    const first=queue.run("peer",()=>new Promise(resolve=>{finish=resolve;}));
    const second=queue.run("peer",()=>{throw new Error("failed");});
    const rejected=assert.rejects(second,/failed/); await assert.rejects(queue.run("peer",()=>{}),/队列已满/);
    await Promise.resolve();finish();await first;await rejected;
    assert.equal(await queue.run("peer",()=>"next"),"next");
});
test("模型返回草稿，接口不携带消息里的非文字数据", async () => {
    let sent;
    const result = await generate({ endpoint: "https://example.test/v1", model: "model", prompt: "简洁回复" }, "secret", { elements: [{ textElement: { content: "你好" } }, { picElement: { filePath: "private-file" } }] }, {
        fetcher: async (url, options) => { sent = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ choices: [{ message: { content: "你好呀" } }] }) }; }
    });
    assert.equal(result, "你好呀"); assert.equal(sent.url, "https://example.test/v1/chat/completions");
    assert.equal(sent.body.messages[1].content, "你好"); assert.equal(JSON.stringify(sent).includes("private-file"), false);
});
test("模型空响应不生成空消息", async () => {
    await assert.rejects(generate({ endpoint: "https://example.test/v1", model: "m" }, "", { elements: [{ textElement: { content: "hello" } }] }, { fetcher: async () => ({ ok: true, json: async () => ({ choices: [] }) }) }), /没有返回/);
});
