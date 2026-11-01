const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const DEFAULTS = Object.freeze({
    markdown: true, linkify: true, typographer: true, repeat: true, plusOne: true,
    antiRecall: true, removeReplyAt: true, replaceMiniApps: true, sideBack: true,
    showTime: true, showMetadata: true, dualShortcuts: true, fontSize: 14,
    llm: { enabled: false, mode: "draft", endpoint: "", model: "", prompt: "请根据收到的消息写一条简洁、自然的中文回复。只输出回复内容。", allowlist: [], cooldownSeconds: 30, encryptedKey: "" },
    redPacket: { enabled: false, allowlist: [], textPassword: false, voicePassword: false, ignoreOwn: true,
        ttsEndpoint: "", ttsModel: "", ttsVoice: "", encryptedKey: "" }
});
const copy = value => JSON.parse(JSON.stringify(value));
function normalize(raw = {}) {
    raw = raw && typeof raw === "object" ? raw : {};
    const config = copy(DEFAULTS);
    for (const key of Object.keys(DEFAULTS)) if (raw[key] !== undefined) config[key] = raw[key];
    for (const name of ["llm", "redPacket"]) {
        config[name] = { ...copy(DEFAULTS[name]) };
        for (const key of Object.keys(DEFAULTS[name])) if (raw[name]?.[key] !== undefined) config[name][key] = raw[name][key];
        for (const key of Object.keys(DEFAULTS[name])) if (typeof DEFAULTS[name][key] === "boolean") config[name][key] = config[name][key] === true;
    }
    for (const key of Object.keys(DEFAULTS)) if (typeof DEFAULTS[key] === "boolean") config[key] = typeof raw[key] === "boolean" ? raw[key] : DEFAULTS[key];
    config.fontSize = Math.max(10, Math.min(28, Number(config.fontSize) || 14));
    config.llm.mode = config.llm.mode === "auto" ? "auto" : "draft";
    for (const section of [config.llm, config.redPacket]) {
        section.allowlist = Array.isArray(section.allowlist) ? [...new Set(section.allowlist.map(String).filter(value => /^(1|2):[^\s:]{1,128}$/.test(value)))].slice(0,200) : [];
        section.enabled = section.enabled === true;
    }
    config.llm.cooldownSeconds = Math.max(5, Math.min(3600, Number(config.llm.cooldownSeconds) || 30));
    return config;
}
class FeatureConfig {
    constructor(root, safeStorage) { this.root = root; this.safeStorage = safeStorage; this.account = ""; this.value = normalize(); this.sessionKeys = {}; }
    useAccount(uid) {
        this.account = String(uid || ""); this.sessionKeys = {};
        this.file = path.join(this.root, "accounts", createHash("sha256").update(this.account || "signed-out").digest("hex"), "features.json");
        let raw = {}; try { raw = JSON.parse(fs.readFileSync(this.file, "utf8")); } catch {}
        this.value = normalize(raw); return this.publicValue();
    }
    secret(section) {
        if (this.sessionKeys[section]) return this.sessionKeys[section];
        const encrypted = this.value[section]?.encryptedKey;
        if (!encrypted || !this.safeStorage?.isEncryptionAvailable()) return "";
        try { return this.safeStorage.decryptString(Buffer.from(encrypted, "base64")); } catch { return ""; }
    }
    update(patch) {
        const value = normalize({ ...this.value, ...patch,
            llm: { ...this.value.llm, ...patch.llm }, redPacket: { ...this.value.redPacket, ...patch.redPacket } });
        const keysChanged = new Set(), nextSessionKeys = { ...this.sessionKeys };
        for (const section of ["llm", "redPacket"]) {
            // 页面不能传入密文覆盖密钥；空输入表示保留，清除需显式标记。
            value[section].encryptedKey = this.value[section].encryptedKey;
            const input = patch[section];
            if (input?.clearKey) { keysChanged.add(section); value[section].encryptedKey = ""; delete nextSessionKeys[section]; }
            if (typeof input?.apiKey === "string" && input.apiKey.trim()) {
                keysChanged.add(section); const key = input.apiKey.trim(); nextSessionKeys[section] = key;
                if (this.safeStorage?.isEncryptionAvailable()) value[section].encryptedKey = this.safeStorage.encryptString(key).toString("base64");
                else value[section].encryptedKey = "";
            }
            delete value[section].apiKey; delete value[section].clearKey;
        }
        for (const section of ["llm", "redPacket"]) if (!keysChanged.has(section) && JSON.stringify(value[section]) === JSON.stringify(this.value[section])) value[section] = this.value[section];
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const temporary = this.file + ".tmp"; fs.writeFileSync(temporary, JSON.stringify(value, null, 2)); fs.renameSync(temporary, this.file);
        this.value = value; this.sessionKeys = nextSessionKeys;
        return this.publicValue();
    }
    publicValue() {
        const config = copy(this.value);
        for (const section of ["llm", "redPacket"]) { delete config[section].encryptedKey; config[section].keyConfigured = Boolean(this.secret(section)); }
        config.account = this.account;
        config.persistentSecrets = Boolean(this.safeStorage?.isEncryptionAvailable());
        return config;
    }
}
module.exports = { FeatureConfig, normalize, DEFAULTS };
