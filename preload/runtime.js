const { contextBridge, ipcRenderer } = require("electron");
const randomUUID = () => globalThis.crypto.randomUUID();
const PREFIX = "QmQQNT.";
const ALLOWED = new Set([
    "nodeIKernelMsgService/forwardMsgWithComment", "nodeIKernelMsgService/sendMsg",
    "nodeIKernelMsgService/grabRedBag", "nodeIKernelMsgService/getRichMediaFilePathForGuild"
]);
let windowId = null;
const pending = new Map();
const disposables = [];
function subscribe(name, callback) {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on(PREFIX + name, listener);
    const dispose = () => ipcRenderer.removeListener(PREFIX + name, listener);
    disposables.push(dispose); return dispose;
}
const documentReady = document.readyState === "loading" ? new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true })) : Promise.resolve();
const ready = documentReady.then(() => ipcRenderer.invoke(PREFIX + "ready")).then(value => {
    windowId = value.windowId;
    const channel = "RM_IPCFROM_MAIN" + windowId;
    const receive = (_event, meta, payload) => {
        const request = pending.get(meta?.callbackId);
        if (!request) return;
        clearTimeout(request.timer); pending.delete(meta.callbackId);
        ipcRenderer.send(PREFIX + "nativeResult", { id: request.id, result: payload });
    };
    ipcRenderer.on(channel, receive); disposables.push(() => ipcRenderer.removeListener(channel, receive));
    return value;
}).catch(() => null);
ipcRenderer.on(PREFIX + "nativeRequest", async (_event, request) => {
    if (!await ready || !ALLOWED.has(request.command)) {
        ipcRenderer.send(PREFIX + "nativeResult", { id: request.id, error: "不支持的 QQ 原生请求" }); return;
    }
    const callbackId = randomUUID();
    const timer = setTimeout(() => {
        pending.delete(callbackId);
        ipcRenderer.send(PREFIX + "nativeResult", { id: request.id, error: "QQ 请求超时，结果未知" });
    }, 7500);
    pending.set(callbackId, { id: request.id, timer });
    ipcRenderer.send("RM_IPCFROM_RENDERER" + windowId,
        { type: "request", callbackId, eventName: "ntApi", peerId: windowId },
        { cmdName: request.command, cmdType: "invoke", payload: request.payload });
});
const invoke = (name, ...args) => ipcRenderer.invoke(PREFIX + name, ...args);
const api = {
    ready: () => ready, getConfig: () => invoke("getConfig"), setConfig: patch => invoke("setConfig", patch),
    activePeer: peer => invoke("activePeer", peer), currentPeer: () => invoke("currentPeer"), metadataMany: references => invoke("metadataMany", references),
    repeat: reference => invoke("repeat", reference), metadata: reference => invoke("metadata", reference),
    draft: (reference, token) => invoke("draft", reference, token), cancelDraft: token => invoke("cancelDraft", token), setProfile: profile => invoke("profile", profile),
    onConfigChanged: callback => subscribe("configChanged", callback),
    onMetadataChanged: callback => subscribe("metadataChanged", callback),
    onStatus: callback => subscribe("status", callback)
};
try { contextBridge.exposeInMainWorld("qm_api", api); } catch { /* 同一页面重复 preload 不重复暴露。 */ }
window.addEventListener("pagehide", () => {
    for (const request of pending.values()) clearTimeout(request.timer);
    pending.clear(); for (const dispose of disposables) dispose();
}, { once: true });
