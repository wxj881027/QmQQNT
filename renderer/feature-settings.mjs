import { parseFontSize } from "./feature-helpers.mjs";

const toggles = [["markdown", "Markdown 渲染"], ["linkify", "自动识别链接（Linkify）"], ["typographer", "排版替换（Typographer）"], ["repeat", "右键复读"], ["plusOne", "消息旁的 +1"], ["antiRecall", "防撤回"], ["removeReplyAt", "移除引用自动附带的 @"], ["replaceMiniApps", "小程序卡片转换为网页卡片"], ["sideBack", "鼠标侧键返回主列表"], ["showTime", "显示消息发送时间"], ["showMetadata", "消息信息与本地统计"], ["dualShortcuts", "同时显示邮箱和收藏"]];
const make = (tag, text) => { const node = document.createElement(tag); if (text) node.textContent = text; return node; };
function row(host, label, control) { const item = make("label"); item.className = "qm-field"; item.append(make("span", label), control); host.append(item); }
function checkbox(value, update) { const input = make("input"); input.type = "checkbox"; input.checked = value; input.addEventListener("change", () => update(input.checked)); return input; }

export async function buildFeatureSettings(host) {
    const api = window.qm_api; if (!api) return;
    const config = await api.getConfig();
    const section = make("section"); section.className = "qm-feature-settings"; host.append(section);
    section.append(make("h2", "消息与交互"));
    const status = make("p"); status.className = "qm-settings-status";
    const save = async patch => { try { await api.setConfig(patch); status.textContent = "已保存"; } catch (error) { status.textContent = error.message; } };
    const font = make("input"); font.type = "text"; font.inputMode = "decimal"; font.value = `${config.fontSize}px`; font.setAttribute("aria-label", "字体大小，单位像素");
    font.addEventListener("change", () => {
        const size = parseFontSize(font.value);
        font.setCustomValidity(size === null ? "请输入 10px 到 28px" : "");
        if (size === null) { font.reportValidity(); return; } font.value = `${size}px`; save({ fontSize: size });
    });
    row(section, "字体大小", font);
    for (const [key, label] of toggles) row(section, label, checkbox(config[key], value => save({ [key]: value })));
    section.append(make("p", "代码高亮跟随当前明暗主题。消息信息会区分本地计数与群消息序号。"));

    function automation(name, title, fields) {
        const group = make("fieldset"), legend = make("legend", title); group.append(legend); section.append(group);
        const data = config[name], inputs = {};
        for (const [key, label, type = "text"] of fields) {
            if (type === "checkbox") { const input = checkbox(data[key], () => {}); inputs[key] = input; row(group, label, input); continue; }
            const input = make(type === "textarea" ? "textarea" : "input");
            if (input.tagName === "INPUT") input.type = type;
            input.value = key === "apiKey" ? "" : key === "allowlist" ? data.allowlist.join("\n") : String(data[key] || "");
            if (key === "apiKey") { input.autocomplete = "new-password"; input.placeholder = data.keyConfigured ? "已保存，留空保留" : "密钥"; }
            inputs[key] = input; row(group, label, input);
        }
        const addPeer = make("button", "将当前会话加入白名单"); addPeer.type = "button";
        addPeer.addEventListener("click", async () => {
            const peer = await api.currentPeer(); if (!peer) { status.textContent = "请先打开目标聊天，再打开设置"; return; }
            const values = new Set(inputs.allowlist.value.split(/[\s,，]+/).filter(Boolean)); values.add(`${peer.chatType}:${peer.peerUid}`); inputs.allowlist.value = [...values].join("\n");
        });
        group.append(addPeer);
        const button = make("button", "保存" + title); button.type = "button";
        button.addEventListener("click", () => {
            const patch = {};
            for (const [key, input] of Object.entries(inputs)) patch[key] = input.type === "checkbox" ? input.checked : key === "allowlist" ? input.value.split(/[\s,，]+/).filter(Boolean) : input.value;
            save({ [name]: patch });
            if (inputs.apiKey) inputs.apiKey.value = "";
        });
        group.append(button);
        const clearKey = make("button", "清除密钥"); clearKey.type = "button"; clearKey.addEventListener("click", () => { save({ [name]: { clearKey: true } }); inputs.apiKey.value = ""; inputs.apiKey.placeholder = "未保存"; }); group.append(clearKey);
        return inputs;
    }
    automation("llm", "LLM 代回复", [["enabled", "启用白名单自动回复", "checkbox"], ["endpoint", "模型服务基础地址"], ["model", "模型名"], ["apiKey", "API 密钥", "password"], ["prompt", "回复提示词", "textarea"], ["allowlist", "会话白名单（每行 1:好友 UID 或 2:群号）", "textarea"], ["cooldownSeconds", "每个会话的回复间隔（秒）", "number"]]);
    const mode = make("select"); for (const [value, label] of [["draft", "生成草稿，由我发送"], ["auto", "对白名单自动回复"]]) { const option = make("option", label); option.value = value; mode.append(option); }
    mode.value = config.llm.mode; mode.addEventListener("change", () => save({ llm: { mode: mode.value } })); row(section, "代回复方式", mode);
    automation("redPacket", "红包自动化", [["enabled", "启用白名单红包处理", "checkbox"], ["allowlist", "会话白名单", "textarea"], ["textPassword", "允许发送文字口令", "checkbox"], ["voicePassword", "允许合成并发送语音口令", "checkbox"], ["ignoreOwn", "跳过自己发出的红包", "checkbox"], ["ttsEndpoint", "TTS 服务基础地址"], ["ttsModel", "TTS 模型名"], ["ttsVoice", "音色"], ["apiKey", "TTS API 密钥", "password"]]);
    section.append(make("p", "自动回复与红包处理默认关闭，只有启用并加入白名单的会话会执行。TTS 接口需支持返回 PCM 或单声道 16 位 WAV。"));
    if (!config.persistentSecrets) section.append(make("p", "当前系统无法加密保存密钥，密钥仅在本次 QQ 会话内有效。"));
    section.append(status);
}
