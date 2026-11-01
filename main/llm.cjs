const { success } = require("./native-result.cjs");
const { textOf, peerKey } = require("./message-store.cjs");
const { allowed, OncePerMessage } = require("./automation-core.cjs");
const textElement = text => ({ elementType: 1, elementId: "", textElement: { content: text, atType: 0, atUid: "", atNtUid: "", atTinyId: "" } });

function endpoint(base, suffix) {
    const url = new URL(String(base).replace(/\/+$/, "") + "/" + suffix);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("模型接口地址无效");
    return url.href;
}
async function generate(config, apiKey, message, { fetcher = fetch, signal } = {}) {
    if (!config.endpoint || !config.model) throw new Error("请先填写模型接口地址和模型名");
    const content = textOf(message);
    if (!content) throw new Error("这条消息没有可用于代回复的文字");
    const response = await fetcher(endpoint(config.endpoint, "chat/completions"), {
        method: "POST", signal: signal || AbortSignal.timeout(30000),
        headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: "Bearer " + apiKey } : {}) },
        body: JSON.stringify({ model: config.model, stream: false, messages: [{ role: "system", content: String(config.prompt || "请简洁回复。") }, { role: "user", content: content.slice(0, 16000) }], max_tokens: 600 })
    });
    if (!response.ok) throw new Error(`模型接口返回 ${response.status}`);
    const result = await response.json();
    const text = result.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error("模型没有返回回复文字");
    return text.trim().slice(0, 4000);
}
function installLlm(runtime) {
    const seen = new OncePerMessage(), active = new Map(), drafts = new Map(), lastSent = new Map();
    runtime.onConfig(({ previous, next, accountChanged }) => {
        if (accountChanged || previous.llm !== next.llm) {
            for (const controller of active.values()) controller.abort();
            for (const controller of drafts.values()) controller.abort();
        }
    });
    runtime.handle("cancelDraft", (event, token) => {
        drafts.get(`${event.sender.id}:${token}`)?.abort();
        return true;
    });
    runtime.handle("draft", async (event, reference, token) => {
        const message = runtime.store.find(reference || {});
        if (!message) throw new Error("消息已不在本地缓存中");
        if (typeof token !== "string" || !/^[\w-]{1,64}$/.test(token)) throw new Error("草稿请求标识无效");
        const account = runtime.uid;
        const key = `${event.sender.id}:${token}`, controller = new AbortController();
        drafts.get(key)?.abort(); drafts.set(key, controller);
        const timer = setTimeout(() => controller.abort(), 30000);
        try {
            const text = await generate(runtime.config.value.llm, runtime.config.secret("llm"), message, { signal: controller.signal });
            if (runtime.uid !== account) throw new Error("账号已切换，已丢弃旧账号草稿");
            return { text, peer: peerKey(message) };
        } finally { clearTimeout(timer); if (drafts.get(key) === controller) drafts.delete(key); }
    });
    runtime.onMessages(async (messages, windowId) => {
        for (const message of messages) {
            const config = runtime.config.value.llm, account = runtime.uid, peer = peerKey(message);
            if (config.mode !== "auto" || !allowed(config, message) || message.senderUid === account || !textOf(message)) continue;
            if (Math.abs(Date.now() / 1000 - Number(message.msgTime)) > 120) continue;
            if (!seen.accept(`${account}:${peer}:${message.msgId}`)) continue;
            const taskKey = `${account}:${peer}`;
            if (active.has(taskKey) || Date.now() - (lastSent.get(taskKey) || 0) < config.cooldownSeconds * 1000) continue;
            const controller = new AbortController(); active.set(taskKey, controller);
            const timer = setTimeout(() => controller.abort(), 30000);
            try {
                const text = await generate(config, runtime.config.secret("llm"), message, { signal: controller.signal });
                if (runtime.uid !== account || runtime.config.value.llm !== config || !allowed(runtime.config.value.llm, message)) continue;
                // 在发起发送前记录冷却，结果未知时也不能自动补发。
                lastSent.set(taskKey, Date.now());
                const result = await runtime.sendElements(windowId, message, [textElement(text)]);
                if (!success(result)) throw new Error("QQ 未确认代回复发送成功");
            } catch (error) { runtime.broadcast("status", { feature: "llm", error: error.message }); }
            finally { clearTimeout(timer); if (active.get(taskKey) === controller) active.delete(taskKey); }
        }
    });
}
module.exports = { installLlm, generate, endpoint, textElement };
