// 复用 QQ 自己的点击入口；邮箱缺少原生按钮时使用网页邮箱。
let pending = null;
const label = element => element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent.trim();
function nativeItem(root, name) {
    return [...root.querySelectorAll("[aria-label], [title], .q-context-menu-item__text")].find(element => !element.closest(".qm-shortcuts") && label(element) === name);
}
function favoriteEntry(root) {
    const sidebar = document.querySelector(".sidebar__lower");
    const pinned = sidebar && nativeItem(sidebar, "收藏"); if (pinned) return pinned;
    for (const menu of root.querySelectorAll(".q-context-menu, .q-menu, .func-menu")) {
        // 消息菜单里的“收藏”是保存消息，不能当成打开收藏夹。
        if (!menu.textContent.includes("设置") || !menu.textContent.includes("聊天记录")) continue;
        const entry = nativeItem(menu, "收藏"); if (entry) return entry;
    }
    return null;
}
async function openFavorites(sidebar) {
    const entry = favoriteEntry(document); if (entry) { entry.click(); return; }
    if (pending) return pending;
    const more = nativeItem(sidebar, "更多");
    if (!more) throw new Error("QQ 的更多菜单尚未就绪");
    pending = new Promise((resolve, reject) => {
        document.body.dataset.qmResolvingShortcut = "1";
        const finish = error => {
            observer.disconnect(); clearTimeout(timer); delete document.body.dataset.qmResolvingShortcut;
            if (error) reject(error); else resolve();
        };
        const observer = new MutationObserver(() => {
            const target = favoriteEntry(document);
            if (target) { target.click(); finish(); }
        });
        const timer = setTimeout(() => finish(new Error("QQ 更多菜单未提供收藏入口，请先手动打开一次收藏")), 1500);
        observer.observe(document.body, { childList: true, subtree: true });
        try { more.click(); const target = favoriteEntry(document); if (target) { target.click(); finish(); } } catch (error) { finish(error); }
    });
    try { await pending; } finally { pending = null; }
}
export function applyShortcuts(config, onError = () => {}) {
    const sidebar = document.querySelector(".sidebar__lower"); if (!sidebar) return;
    sidebar.querySelectorAll("[data-qm-native-shortcut]").forEach(element => { if (!config.dualShortcuts) delete element.dataset.qmNativeShortcut; });
    let host = sidebar.querySelector(".qm-shortcuts");
    if (!config.dualShortcuts) { host?.remove(); return; }
    for (const element of sidebar.querySelectorAll(".func-menu__item_wrap")) {
        if (nativeItem(element, "收藏") || nativeItem(element, "邮箱")) element.dataset.qmNativeShortcut = "1";
    }
    if (host) return;
    host = document.createElement("div"); host.className = "qm-shortcuts";
    for (const [name, icon, action] of [["邮箱", "M3 5h18v14H3z M3 5l9 7 9-7", () => {
        const native = nativeItem(sidebar, "邮箱"); return native ? native.click() : window.liuli_api.openExternal("https://mail.qq.com/");
    }], ["收藏", "m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z", () => openFavorites(sidebar)]]) {
        const button = document.createElement("button"); button.type = "button"; button.title = name; button.setAttribute("aria-label", name);
        button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}"/></svg>`;
        button.addEventListener("click", async () => { button.disabled = true; try { await action(); } catch (error) { onError(error); } finally { button.disabled = false; } }); host.append(button);
    }
    sidebar.prepend(host);
}
