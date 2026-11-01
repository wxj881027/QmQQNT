// 启动入口保持轻量：先向 LiteLoader 导出设置钩子，再异步加载界面模块。
const SLUG = "qm-qqnt";
let payload;
const views = new WeakSet();
const warnings = new Set();
let startupError = null;

export function pluginModuleUrl(pluginPath) {
    // local 不是浏览器的特殊协议，反斜杠不会被当作目录分隔符。
    const normalized = String(pluginPath).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    return new URL(`local:///${normalized}/renderer/theme.js`).href;
}

function loadTheme() {
    return payload ||= import(pluginModuleUrl(LiteLoader.plugins[SLUG].path.plugin));
}

function errorText(error) {
    return error?.message || String(error);
}

export async function onSettingWindowCreated(view) {
    if (views.has(view)) return;
    views.add(view);
    const status = document.createElement("p");
    status.style.cssText = "padding:16px;white-space:pre-wrap;overflow-wrap:anywhere;";
    status.textContent = "正在加载 QmQQNT 设置…";
    view.append(status);
    warnings.add(status);
    try {
        const theme = await loadTheme();
        await theme.onSettingWindowCreated(view);
        if (startupError) status.textContent = `QmQQNT 界面初始化失败：${errorText(startupError)}`;
        else status.hidden = true;
    } catch (error) {
        status.textContent = `QmQQNT 加载失败：${errorText(error)}\n修复文件后请重启 QQ。`;
        console.error("[qm-qqnt] settings load failed:", error);
    }
}

function installSettingsRecovery() {
    // LiteLoader 在导入插件之前已启动设置页触发器；页面先出现时补回错过的入口。
    let queued = false;
    const recover = () => {
        queued = false;
        if (!location.hash.startsWith("#/setting")) return;
        const nav = document.querySelector(".setting-tab .nav-bar.liteloader");
        const content = document.querySelector(".setting-main .q-scroll-view.liteloader");
        if (!nav || !content || nav.querySelector(`[data-slug="${SLUG}"]`)) return;
        const template = nav.querySelector(".nav-item");
        if (!template) return;
        const item = template.cloneNode(true);
        const view = document.createElement("div");
        view.className = `tab-view ${SLUG}`;
        item.classList.remove("nav-item-active");
        item.dataset.slug = SLUG;
        item.querySelector(".name").textContent = "QmQQNT";
        item.addEventListener("click", event => {
            if (!event.currentTarget.classList.contains("nav-item-active")) content.replaceChildren(view);
        });
        nav.append(item);
        void onSettingWindowCreated(view);
    };
    const schedule = () => {
        if (queued) return;
        queued = true;
        queueMicrotask(recover);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document, { childList: true, subtree: true });
    window.addEventListener("hashchange", schedule);
    window.addEventListener("pagehide", () => {
        observer.disconnect();
        window.removeEventListener("hashchange", schedule);
        warnings.clear();
    }, { once: true });
    schedule();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
    installSettingsRecovery();
    // 延后到当前模块注册完成，避免庞大依赖树拖延 LiteLoader 的钩子注册。
    setTimeout(() => {
        loadTheme().then(theme => theme.startTheme()).catch(error => {
            startupError = error;
            console.error("[qm-qqnt] startup failed:", error);
            for (const status of warnings) {
                status.hidden = false;
                status.textContent = `QmQQNT 界面初始化失败：${errorText(error)}`;
            }
        });
    }, 0);
}
