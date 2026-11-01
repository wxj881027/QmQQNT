const { ipcMain, webContents, safeStorage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { serialize, deserialize } = require("node:v8");
const { createHash } = require("node:crypto");
const { NativeBroker } = require("./native-broker.cjs");
const { FeatureConfig } = require("./feature-config.cjs");
const { decorateMessage } = require("./cards.cjs");
const { MessageStore, findMessageLists, peerKey } = require("./message-store.cjs");

const PREFIX = "QmQQNT.";
const LIVE_EVENTS = new Set(["nodeIKernelMsgListener/onRecvMsg", "nodeIKernelMsgListener/onRecvActiveMsg"]);
const clone = value => deserialize(serialize(value));
const { success } = require("./native-result.cjs");
function trusted(wc) {
    if (!wc || wc.isDestroyed()) return false;
    try { const url = new URL(wc.getURL()); return url.protocol === "app:" || url.protocol === "file:" && /\/renderer\//i.test(decodeURIComponent(url.pathname)); } catch { return false; }
}

function createRuntime(root) {
    const config = new FeatureConfig(root, safeStorage);
    config.useAccount("");
    let activePeer = null;
    let uid = "", store = new MessageStore(), saveTimer = 0, metadataTimer = 0, cacheFile = null;
    const hooked = new WeakSet(), ready = new Set(), inflightRepeat = new Set();
    const broker = new NativeBroker({ send(windowId, request) {
        const wc = webContents.fromId(windowId);
        if (!ready.has(windowId) || !trusted(wc)) throw new Error("当前窗口尚未建立 QQ 原生请求通道");
        wc.send(PREFIX + "nativeRequest", request);
    } });
    const configurationListeners = new Set();
    const listeners = new Set(), profiles = new Map();
    function broadcast(event, payload) {
        for (const id of ready) { const wc = webContents.fromId(id); if (trusted(wc)) wc.send(PREFIX + event, payload); }
    }
    function flush() {
        clearTimeout(saveTimer); saveTimer = 0;
        if (!cacheFile) return;
        try {
            fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
            const temporary = cacheFile + ".tmp"; fs.writeFileSync(temporary, serialize(store.snapshot())); fs.renameSync(temporary, cacheFile);
        } catch { /* 持久化失败不影响 QQ 原生消息派发。 */ }
    }
    function scheduleSave() { if (!saveTimer) saveTimer = setTimeout(flush, 1000); }
    function handleMessages(meta, data, windowId) {
        const command = meta?.cmdName || data?.cmdName;
        const live = LIVE_EVENTS.has(command);
        const lists = findMessageLists(data);
        const fresh = [];
        for (const list of lists) for (let i = 0; i < list.length; i++) {
            const original = list[i];
            if (!original?.msgId || !original.peerUid) continue;
            const observed = store.hasObserved(original);
            const restored = store.restore(original, config.value.antiRecall);
            store.remember(restored, live);
            const visible = decorateMessage(clone(restored), config.value);
            if (list.owner) list.owner.msgRecord = visible; else list[i] = visible;
            if (live && !observed) fresh.push(clone(restored));
        }
        if (lists.length) { scheduleSave(); if (!metadataTimer) metadataTimer = setTimeout(() => { metadataTimer = 0; broadcast("metadataChanged", null); }, 100); }
        if (fresh.length && uid && ready.has(windowId)) for (const listener of listeners) {
            // 自动化异步处理副本，不能改变原生发送函数的同步返回语义。
            const receivedAccount = uid;
            queueMicrotask(() => { if (uid === receivedAccount) Promise.resolve(listener(fresh, windowId)).catch(() => {}); });
        }
    }
    function hookWindow(window) {
        const wc = window.webContents;
        if (hooked.has(wc)) return;
        hooked.add(wc);
        const original = wc.send;
        wc.send = function (channel, ...args) {
            if (typeof channel === "string" && channel.startsWith("RM_IPCFROM_MAIN")) {
                try { handleMessages(args[0], args[1], wc.id); } catch { /* 原生事件始终继续派发一次。 */ }
            }
            return original.call(this, channel, ...args);
        };
        wc.once("destroyed", () => { ready.delete(wc.id); profiles.delete(wc.id); broker.disconnect(wc.id); });
    }
    function requireSender(event) { if (!trusted(event.sender)) throw new Error("此窗口不能调用个人插件接口"); }
    function handle(name, fn) { ipcMain.handle(PREFIX + name, (event, ...args) => { requireSender(event); return fn(event, ...args); }); }
    handle("ready", event => { ready.add(event.sender.id); return { windowId: event.sender.id, uid, config: config.publicValue() }; });
    handle("profile", (event, profile) => {
        if (profile && /^\d{4,20}$/.test(String(profile.uin)) && (!profile.uid || String(profile.uid) === uid)) profiles.set(event.sender.id, { uin: String(profile.uin), nickName: String(profile.nickName || "").slice(0,128) });
        return true;
    });
    handle("getConfig", () => config.publicValue());
    handle("setConfig", (_event, patch) => { const previous = config.value; const result = config.update(patch || {}); for (const listener of configurationListeners) listener({ previous, next: config.value, accountChanged: false }); broadcast("configChanged", result); return result; });
    ipcMain.on(PREFIX + "nativeResult", (event, response) => {
        if (trusted(event.sender)) broker.complete(event.sender.id, response?.id, response?.result, response?.error);
    });
    handle("activePeer", (_event, peer) => {
        if (peer && [1,2].includes(Number(peer.chatType)) && typeof peer.peerUid === "string") activePeer = { chatType: Number(peer.chatType), peerUid: peer.peerUid, peerName: String(peer.peerName || "") };
        return activePeer;
    });
    handle("currentPeer", () => activePeer);
    handle("metadataMany", (_event, references) => Array.isArray(references) ? references.slice(0,100).map(reference => ({ ...reference, ...store.metadata(reference) })) : []);
    handle("metadata", (_event, reference) => store.metadata(reference || {}));
    handle("repeat", async (event, reference) => {
        if (!config.value.repeat && !config.value.plusOne) throw new Error("复读已关闭");
        const msg = store.find(reference || {});
        if (!msg) throw new Error("消息缓存不可用，请重新打开该会话");
        const key = `${peerKey(msg)}:${msg.msgId}`;
        if (inflightRepeat.has(key)) throw new Error("这条消息正在发送，请稍候");
        inflightRepeat.add(key);
        try {
            const contact = { chatType: Number(msg.chatType), peerUid: String(msg.peerUid), guildId: String(msg.guildId || "") };
            const result = await broker.request(event.sender.id, "nodeIKernelMsgService/forwardMsgWithComment", [{ msgIds: [String(msg.msgId)], srcContact: contact, dstContacts: [contact], commentElements: [], msgAttributeInfos: new Map() }, null]);
            if (!success(result)) throw new Error("QQ 未确认复读成功");
            return result;
        } finally { inflightRepeat.delete(key); }
    });
    function sendElements(windowId, peer, elements) {
        return broker.request(windowId, "nodeIKernelMsgService/sendMsg", [{ msgId: "0", peer: { chatType: Number(peer.chatType), peerUid: String(peer.peerUid), guildId: String(peer.guildId || "") }, msgElements: elements, msgAttributeInfos: new Map() }, null]);
    }
    return {
        config, broker, handle, broadcast, sendElements, profile: windowId => profiles.get(windowId),
        get uid() { return uid; }, get store() { return store; },
        onMessages(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        onConfig(listener) { configurationListeners.add(listener); return () => configurationListeners.delete(listener); },
        onLogin(nextUid) {
            if (!nextUid || String(nextUid) === uid) return;
            const previous = config.value;
            flush(); profiles.clear(); activePeer = null; uid = String(nextUid || ""); config.useAccount(uid);
            for (const id of ready) broker.disconnect(id);
            for (const listener of configurationListeners) listener({ previous, next: config.value, accountChanged: true });
            cacheFile = path.join(root, "accounts", createHash("sha256").update(uid).digest("hex"), "messages.bin");
            let state = {}; try { if (fs.statSync(cacheFile).size <= 32 * 1024 * 1024) state = deserialize(fs.readFileSync(cacheFile)); } catch {}
            store = new MessageStore(state); broadcast("configChanged", config.publicValue());
        },
        hookWindow, flush
    };
}
module.exports = { createRuntime, success };
