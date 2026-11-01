import { applyShortcuts } from "./shortcuts.mjs";
import { createMarkdown } from "./markdown.mjs";
import { currentEditor, recordOf, referenceOf, vueValue } from "./feature-helpers.mjs";
import { installReplyAtInsertGuard, installCkeditorReplyAtGuard } from "./vendor/reply-at-control.mjs";

const api = () => window.qm_api;
let activePeerKey = "";
let config = {}, markdown, started = false, contextRecord = null, frame = 0, metadataTimer = 0;
const rows = new WeakMap();
const formatTime = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const formatFull = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "long" });

export const featureConfig = () => config;
export function refreshFeatureUi() { applyShortcuts(config, report); }
function notify(text) {
    let element = document.getElementById("qm-status");
    if (!element) { element = document.createElement("div"); element.id = "qm-status"; element.setAttribute("role", "status"); document.body.append(element); }
    element.textContent = text; element.dataset.visible = "1";
    clearTimeout(element.timer); element.timer = setTimeout(() => { element.dataset.visible = "0"; }, 3500);
}
function report(error) { notify(error?.message || String(error)); }
function closeNativeMenu(element) {
    const menu = element.closest(".q-context-menu");
    if (!menu) return;
    if (menu.matches(":popover-open")) { menu.hidePopover(); return; }
    // 交给 QQ 的外部点击处理关闭菜单，不直接删除 Vue 管理的节点。
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
}
function button(text, action, className = "qm-action") {
    const element = document.createElement("button"); element.type = "button"; element.className = className; element.textContent = text;
    element.addEventListener("click", async event => {
        event.preventDefault(); event.stopPropagation(); element.disabled = true; closeNativeMenu(element);
        try { await action(event); } catch (error) { report(error); } finally { element.disabled = false; }
    });
    return element;
}
function panel(title) {
    const previous = document.getElementById("qm-dialog");
    if (previous) { previous.id = ""; previous.close(); }
    const dialog = document.createElement("dialog"); dialog.id = "qm-dialog"; dialog.className = "qm-dialog";
    const nativeClose = dialog.close.bind(dialog);
    let closing = false;
    dialog.close = result => {
        if (closing) return;
        closing = true;
        dialog.qmBeforeClose?.();
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) { dialog.dataset.qmClosing = "1"; nativeClose(result); return; }
        const opacity = getComputedStyle(dialog).opacity;
        const backdrop = getComputedStyle(dialog, "::backdrop").opacity;
        dialog.getAnimations().forEach(animation => animation.cancel());
        dialog.style.setProperty("--qm-backdrop-from", backdrop);
        dialog.dataset.qmClosing = "1";
        const animation = dialog.animate([{ opacity }, { opacity: 0 }], { duration: 140, easing: "ease-out", fill: "forwards" });
        const fallback = setTimeout(() => nativeClose(result), 180);
        animation.onfinish = () => { clearTimeout(fallback); nativeClose(result); };
    };
    dialog.addEventListener("cancel", event => { event.preventDefault(); dialog.close(); });
    const heading = document.createElement("h2"); heading.textContent = title;
    const close = button("关闭", () => dialog.close());
    dialog.append(heading, close); document.body.append(dialog); dialog.addEventListener("close", () => dialog.remove(), { once: true }); dialog.showModal();
    return dialog;
}
async function showDraft(record) {
    const peer = `${record.chatType}:${record.peerUid}`;
    const dialog = panel("代回复草稿");
    const token = crypto.randomUUID();
    dialog.qmBeforeClose = () => { api().cancelDraft(token).catch(() => {}); };
    const field = document.createElement("textarea"); field.value = "正在生成…"; field.disabled = true; dialog.append(field);
    let result;
    try { result = await api().draft(referenceOf(record), token); }
    catch (error) { if (!dialog.isConnected || dialog.dataset.qmClosing) return; field.value = error.message; throw error; }
    if (!dialog.isConnected || dialog.dataset.qmClosing) return;
    field.disabled = false; field.value = result.text;
    dialog.append(button("放入输入框", () => {
        const current = currentPeer();
        if (!current || `${current.chatType}:${current.peerUid}` !== peer) throw new Error("会话已切换，请返回原会话后再放入草稿");
        const editor = currentEditor();
        if (!editor?.view?.state?.tr?.insertText) throw new Error("当前输入框尚未就绪");
        editor.view.focus(); editor.view.dispatch(editor.view.state.tr.insertText(field.value)); dialog.close();
    }));
}
async function showMetadata(record) {
    const data = await api().metadata(referenceOf(record));
    const dialog = panel("消息信息"), list = document.createElement("dl");
    const values = [["消息 ID", record.msgId], ["消息序号", data.sequence || record.msgSeq || "未知"],
        ["发送者", record.senderUid || record.senderUin || "未知"], ["发送时间", record.msgTime ? formatFull.format(new Date(Number(record.msgTime) * 1000)) : "未知"],
        ["本地已观察消息数", data.peer?.observed ?? "尚未统计"], ["最新群消息序号", data.peer?.lastSequence || "未知"],
        ["统计起点", data.peer?.startedAt ? formatFull.format(new Date(data.peer.startedAt)) : "未知"]];
    if (data.recalled) values.push(["撤回状态", `已撤回 · ${data.recalled.operator}`]);
    for (const [name, value] of values) { const term = document.createElement("dt"), text = document.createElement("dd"); term.textContent = name; text.textContent = String(value); list.append(term, text); }
    const note = document.createElement("p"); note.textContent = "QQ 未提供可核实的历史总量时，显示本地统计与最新序号；序号不等于消息总数。";
    dialog.append(list, note);
}
function applyConfig(value) {
    if (config.account !== value.account) { activePeerKey = ""; window.dispatchEvent(new CustomEvent("qm-account", { detail: value.account })); }
    config = value;
    document.body.style.setProperty("--qm-font-size", `${value.fontSize || 14}px`);
    document.body.style.setProperty("--ll-menu-font-size", `${value.fontSize || 14}px`);
    schedule(); sendProfile(); refreshFeatureUi();
}
function sendProfile() {
    const app = document.querySelector("#app");
    const profile = app?.__vue_app__?.config?.globalProperties?.$store?.state?.common_Auth?.authData;
    if (profile?.uin) api()?.setProfile({ uid: profile.uid, uin: profile.uin, nickName: profile.nickName }).catch(() => {});
}
export function currentPeer() {
    for (const node of document.querySelectorAll(".chat-msg-area .message")) { const record = recordOf(node); if (record) return record; }
    return null;
}
export function featuresPass() {
    if (!started) return;
    const peer = currentPeer();
    if (peer) { const key = `${peer.chatType}:${peer.peerUid}`; if (key !== activePeerKey) { activePeerKey = key; api().activePeer({ chatType: peer.chatType, peerUid: peer.peerUid, peerName: peer.peerName }).catch(() => {}); } }
    const editor = currentEditor();
    if (editor) installReplyAtInsertGuard(editor, () => config.removeReplyAt === true);
    const ckeditor = document.querySelector(".ck.ck-content.ck-editor__editable")?.ckeditorInstance;
    if (ckeditor) installCkeditorReplyAtGuard(ckeditor, () => config.removeReplyAt === true);
    for (const message of document.querySelectorAll(".chat-msg-area .message")) {
        if (message.closest(".viewport-list__measure, [data-liuli-ghost]")) continue;
        const record = recordOf(message); if (!record?.msgId) continue;
        const wrapper = message.querySelector(".message-content__wrapper"); if (!wrapper) continue;
        let state = rows.get(message);
        const key = `${record.chatType}:${record.peerUid}:${record.msgId}`;
        if (!state || state.key !== key || !state.actions.isConnected) {
            if (state) { state.actions.remove(); state.time.remove(); state.recall.remove(); }
            const actions = document.createElement("span"); actions.className = "qm-message-actions";
            const repeat = button("+1", () => api().repeat(referenceOf(record)), "qm-repeat"); repeat.title = "原样复读这条消息";
            actions.append(repeat); wrapper.append(actions);
            const time = document.createElement("time"); time.className = "qm-message-time";
            const bubble = wrapper.querySelector(".msg-content-container") || wrapper; bubble.append(time);
            const recall = document.createElement("span"); recall.className = "qm-recalled"; wrapper.append(recall);
            state = { key, actions, repeat, time, recall }; rows.set(message, state);
        }
        state.actions.hidden = !config.plusOne;
        state.time.hidden = !config.showTime || !record.msgTime;
        if (record.msgTime) {
            const date = new Date(Number(record.msgTime) * 1000);
            if (Number.isFinite(date.getTime())) { const text = formatTime.format(date); if (state.time.textContent !== text) state.time.textContent = text; state.time.dateTime = date.toISOString(); state.time.title = formatFull.format(date); }
        }
    }
    markdown?.pass();
}
function refreshMetadata() {
    if (metadataTimer) return;
    metadataTimer = setTimeout(async () => {
        metadataTimer = 0;
        const messages = [...document.querySelectorAll(".chat-msg-area .message")].filter(node => !node.closest(".viewport-list__measure, [data-liuli-ghost]"));
        const references = messages.map(recordOf).filter(Boolean).slice(0, 100).map(referenceOf);
        try {
            const values = await api().metadataMany(references);
            for (const message of messages) { const state = rows.get(message); if (!state) continue; const data = values.find(value => `${value.chatType}:${value.peerUid}:${value.msgId}` === state.key); const text = data?.recalled ? `已撤回 · ${data.recalled.operator}` : ""; if (state.recall.textContent !== text) state.recall.textContent = text; state.recall.hidden = !text; }
        } catch {}
    }, 150);
}
function schedule() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; featuresPass(); refreshMetadata(); }); }
function fillMenu(menu) {
    const key = contextRecord ? `${contextRecord.chatType}:${contextRecord.peerUid}:${contextRecord.msgId}:${config.repeat}:${config.showMetadata}` : "";
    if (menu.dataset.qmRecord === key) return;
    menu.querySelectorAll(".qm-menu-action").forEach(node => node.remove());
    menu.dataset.qmRecord = key;
    if (!contextRecord) return;
    const record = contextRecord;
    if (config.repeat) menu.append(button("复读", () => api().repeat(referenceOf(record)), "q-context-menu-item qm-menu-action"));
    if (config.showMetadata) menu.append(button("消息信息", () => showMetadata(record), "q-context-menu-item qm-menu-action"));
    menu.append(button("生成代回复草稿", () => showDraft(record), "q-context-menu-item qm-menu-action"));
}
export async function initFeatures() {
    if (started || !api()) return;
    const ready = await api().ready(); if (!ready) return;
    applyConfig(ready.config); started = true;
    try { markdown = await createMarkdown(featureConfig); } catch (error) { report(error); }
    api().onConfigChanged(applyConfig); api().onMetadataChanged(refreshMetadata);
    api().onStatus(status => notify(status.error || status.message));
    document.addEventListener("contextmenu", event => {
        contextRecord = recordOf(event.target);
        queueMicrotask(() => document.querySelectorAll(".q-context-menu.aio-right-click-menu").forEach(fillMenu));
    }, true);
    const observer = new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (node.matches(".q-context-menu.aio-right-click-menu")) fillMenu(node);
            node.querySelectorAll(".q-context-menu.aio-right-click-menu").forEach(fillMenu);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const back = event => {
        if (event.button !== 3 || !config.sideBack) return;
        const action = vueValue(document.querySelector(".recent-contact .list-toggler"), ["proxy.goBackMainList", "ctx.goBackMainList"])
            || vueValue(document.querySelector(".recent-contact-list--wrapper"), ["proxy.goBackMainList", "ctx.goBackMainList"]);
        if (typeof action !== "function") return;
        event.preventDefault(); event.stopPropagation(); action();
    };
    document.addEventListener("mouseup", back, true);
    window.addEventListener("pagehide", () => { observer.disconnect(); markdown?.dispose(); document.removeEventListener("mouseup", back, true); cancelAnimationFrame(frame); clearTimeout(metadataTimer); }, { once: true });
    featuresPass(); refreshMetadata(); sendProfile();
}
