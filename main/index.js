// QmQQNT：主题与消息功能共用一个生命周期。
const fs = require("node:fs");
const path = require("node:path");
const { ipcMain, shell, app } = require("electron");
const { createRuntime } = require("./runtime.cjs");
const { installLlm } = require("./llm.cjs");
const { installRedPackets } = require("./red-packet.cjs");
const root = path.join(LiteLoader.path.data, "qm-qqnt");
fs.mkdirSync(root, { recursive: true });
const previous = path.join(LiteLoader.path.data, "liuli-dsh-theme", "config.json");
if (!fs.existsSync(path.join(root, "config.json")) && fs.existsSync(previous)) fs.copyFileSync(previous, path.join(root, "config.json"));
const runtime = createRuntime(root);
installLlm(runtime);
installRedPackets(runtime);
ipcMain.handle("LiteLoader.liuli.selfUid", () => runtime.uid);
ipcMain.handle("LiteLoader.liuli.openExternal", async (_event, value) => {
    let url; try { url = new URL(String(value)); } catch { return false; }
    if (!["http:", "https:"].includes(url.protocol)) return false;
    await shell.openExternal(url.href); return true;
});
app.on("before-quit", runtime.flush);
module.exports = {
    onLogin(uid) { runtime.onLogin(uid); },
    onBrowserWindowCreated(window) { runtime.hookWindow(window); }
};
