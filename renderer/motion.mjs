import { MOTION, MessageBaseline, MotionDriver } from "./motion-core.mjs";

const POPUPS = ".qm-dialog, .q-context-menu:not(.is-pure), .q-context-sub-menu__container, .q-menu, .q-dialog-main, .q-popup__main, .q-float-card, .aio .side-panel, .expression-panel .sticker-panel";
const MESSAGES = ".chat-msg-area";
const UI = ".container-sidebar, .recent-contact, .group-box, .group-member, .chat-input-area, .side-panel";

function nodesWithin(root, selector) {
    if (root.nodeType !== 1) return [];
    return [...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)];
}

export function installMotion({ prepareMessages, refreshUi, syncInput }) {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const driver = new MotionDriver({ reduced: () => reduced.matches || document.hidden, presentation: element => {
        const style = getComputedStyle(element);
        return { opacity: style.opacity, translate: style.translate };
    } });
    const baseline = new MessageBaseline();
    const snapshots = new Map();
    const ghosts = new Set();
    let frame = 0, uiDirty = true, selected = null, input = null;
    let inputObserver = new ResizeObserver(() => schedule());

    function chatKey(added) {
        const candidates = added.length ? added : [...document.querySelectorAll(".chat-msg-area .message")];
        for (const node of candidates) {
            const message = node.matches(".message") ? node : node.querySelector(".message");
            const record = message?.__VUE__?.[0]?.props?.msgRecord;
            if (record?.peerUid) return `${record.chatType}:${record.peerUid}`;
        }
        return document.querySelector(".recent-contact-item--selected[data-contact-id]")?.getAttribute("data-contact-id") || location.hash;
    }
    function updateMessages(added = []) {
        prepareMessages();
        const items = [...document.querySelectorAll(".chat-msg-area .ml-item[id]")];
        const chat = chatKey(added), previous = baseline.chat;
        const newIds = new Set(baseline.update(chat, items.map(n => n.id), added.map(n => n.id)));
        if (previous !== null && previous !== chat) {
            const area = document.querySelector(MESSAGES);
            if (area) { retire(area); driver.play(area, [{ opacity: 0, translate: "10px 0" }, { opacity: 1, translate: "0px 0px" }]); }
        }
        for (const item of added) {
            if (!newIds.has(item.id) || !item.isConnected || item.closest(".viewport-list__measure")) continue;
            const content = item.querySelector(".message-content__wrapper");
            if (content) driver.play(content, [{ opacity: 0, translate: "0px 8px" }, { opacity: 1, translate: "0px 0px" }]);
        }
    }
    function snapshot(element) {
        if (reduced.matches || !element.isConnected) return;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (!rect.width || !rect.height || style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return;
        const copy = element.cloneNode(true);
        // 副本只负责退场，不保留可操作控件和重复 ID。
        for (const node of [copy, ...copy.querySelectorAll("[id], [autofocus]")]) { node.removeAttribute("id"); node.removeAttribute("autofocus"); }
        copy.inert = true;
        copy.setAttribute("aria-hidden", "true");
        copy.dataset.liuliGhost = "1";
        copy.dataset.entryOpacity = style.opacity;
        const originalHosts = element.querySelectorAll(".qm-markdown");
        const copiedHosts = copy.querySelectorAll(".qm-markdown");
        originalHosts.forEach((host,index) => {
            if (!host.shadowRoot || !copiedHosts[index]) return;
            const shadow = copiedHosts[index].attachShadow({ mode: "open" });
            shadow.innerHTML = host.shadowRoot.innerHTML;
            shadow.adoptedStyleSheets = host.shadowRoot.adoptedStyleSheets;
        });
        copy.style.cssText += `;position:fixed!important;inset:auto!important;left:${rect.left}px!important;top:${rect.top}px!important;width:${rect.width}px!important;height:${rect.height}px!important;margin:0!important;pointer-events:none!important;z-index:2147483000!important;animation:none!important;transition:none!important;transform:none!important;translate:none;`;
        for (const property of ["background-color", "color", "border-radius", "box-shadow", "font"]) copy.style.setProperty(property, style.getPropertyValue(property), "important");
        if (snapshots.size >= 16 && !snapshots.has(element)) snapshots.delete(snapshots.keys().next().value);
        snapshots.set(element, copy);
    }
    function retire(element) {
        const copy = snapshots.get(element);
        snapshots.delete(element);
        if (element.dataset.qmClosing) return;
        if (!copy || reduced.matches || document.hidden) return;
        if (ghosts.size >= 2) { const oldest = ghosts.values().next().value; oldest.remove(); ghosts.delete(oldest); }
        document.body.appendChild(copy);
        ghosts.add(copy);
        const animation = driver.play(copy, [{ opacity: Number(copy.dataset.entryOpacity) || 1 }, { opacity: 0 }], { duration: MOTION.exit });
        if (!animation) { copy.remove(); ghosts.delete(copy); return; }
        const cleanup = animation.onfinish;
        animation.onfinish = () => { cleanup(); copy.remove(); ghosts.delete(copy); };
    }
    function rememberPopups() {
        document.querySelectorAll(POPUPS).forEach(el => { if (!el.closest("[data-liuli-ghost]")) snapshot(el); });
    }
    function schedule() {
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            if (uiDirty) { uiDirty = false; refreshUi(); }
            const area = document.querySelector(".chat-input-area");
            if (area !== input) {
                inputObserver.disconnect(); input = area;
                if (area) { inputObserver.observe(area); const box = area.querySelector(".msg-input"); if (box) inputObserver.observe(box); }
            }
            syncInput();
        });
    }
    const observer = new MutationObserver(records => {
        let messages = false;
        const added = new Set();
        for (const record of records) {
            const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
            if (target?.closest("[data-liuli-ghost], #liuli-input-overlay")) continue;
            if (target?.closest(MESSAGES)) messages = true;
            if (record.type === "attributes") {
                if (target?.matches(".recent-contact-item--selected")) {
                    const id = target.getAttribute("data-contact-id");
                    if (selected !== id) selected = id;
                }
                continue;
            }
            for (const node of record.addedNodes) {
                if (node.nodeType !== 1 || node.closest("[data-liuli-ghost], #liuli-input-overlay")) continue;
                for (const item of nodesWithin(node, ".ml-item[id]")) { if (item.closest(MESSAGES)) { added.add(item); messages = true; } }
                if (node.matches(MESSAGES) || node.querySelector(MESSAGES)) messages = true;
                if (node.matches(UI) || node.querySelector(UI)) uiDirty = true;
                for (const popup of nodesWithin(node, POPUPS)) {
                    // 原生定位用 transform；这里只动透明度，不改变子菜单的 fixed 参照。
                    driver.play(popup, [{ opacity: 0 }, { opacity: 1 }]);
                    snapshot(popup);
                }
            }
            for (const node of record.removedNodes) for (const popup of nodesWithin(node, POPUPS)) { if (!popup.isConnected) retire(popup); }
            if (!target?.closest(MESSAGES) && target?.closest(UI)) uiDirty = true;
        }
        // 修饰在绘制前完成，不等 1.5 秒后再修改气泡结构。
        if (messages) updateMessages([...added]);
        if (uiDirty || messages) schedule();
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class", "data-contact-id"] });
    const beforeInteraction = event => {
        rememberPopups();
        if (event.type === "pointerdown" && event.target.closest?.(".recent-contact-item")) {
            const area = document.querySelector(MESSAGES);
            if (area && area.querySelectorAll("*").length < 1500) snapshot(area);
        }
    };
    document.addEventListener("pointerdown", beforeInteraction, true);
    document.addEventListener("keydown", beforeInteraction, true);
    window.addEventListener("resize", schedule);
    const clear = () => {
        driver.cancelAll(); snapshots.clear();
        for (const ghost of ghosts) ghost.remove();
        ghosts.clear();
    };
    reduced.addEventListener("change", clear);
    document.addEventListener("visibilitychange", () => { if (document.hidden) clear(); });
    window.addEventListener("pagehide", () => {
        clear(); observer.disconnect(); inputObserver.disconnect(); cancelAnimationFrame(frame);
        document.removeEventListener("pointerdown", beforeInteraction, true);
        document.removeEventListener("keydown", beforeInteraction, true);
        window.removeEventListener("resize", schedule);
    }, { once: true });
    updateMessages(); schedule();
}
