import MarkdownIt from "../assets/vendor/markdown-it.mjs";
import highlight from "../assets/vendor/highlight.mjs";
import purify from "../assets/vendor/purify.mjs";

export function createParser({ linkify = true, typographer = true } = {}) {
    const parser = new MarkdownIt({ html: false, linkify, typographer, breaks: true,
        highlight(code, language) {
            if (language && highlight.getLanguage(language)) {
                try { return highlight.highlight(code, { language, ignoreIllegals: true }).value; } catch {}
            }
            return "";
        }
    });
    // 聊天文字不自动加载第三方图片；QQ 原有图片元素不受影响。
    parser.disable("image");
    return parser;
}

export async function createMarkdown(getConfig) {
    const base = new URL("../assets/vendor/", import.meta.url);
    const [light, dark] = await Promise.all(["github-light.css", "github-dark.css"].map(file => fetch(new URL(file, base)).then(response => {
        if (!response.ok) throw new Error("代码高亮样式加载失败"); return response.text();
    })));
    const sheets = [light, dark].map(css => { const sheet = new CSSStyleSheet(); sheet.replaceSync(css); return sheet; });
    const common = new CSSStyleSheet();
    common.replaceSync(`:host{display:block;color:inherit;font:inherit;white-space:normal;overflow-wrap:anywhere;max-width:100%;min-width:0}p{margin:0 0 .4em}p:last-child{margin-bottom:0}pre{max-width:100%;overflow:auto;margin:.4em 0;border-radius:8px;padding:10px;background:color-mix(in srgb,currentColor 6%,transparent)}code{font-family:Consolas,monospace;font-size:.92em}a{color:inherit;text-decoration:underline}blockquote{margin:.4em 0;padding-left:10px;border-left:3px solid currentColor}table{border-collapse:collapse}td,th{border:1px solid color-mix(in srgb,currentColor 20%,transparent);padding:4px 8px}h1,h2,h3{font-size:1.15em;margin:.5em 0}ul,ol{padding-left:1.4em;margin:.3em 0}`);
    const rendered = new Map();
    let parserKey = "", parser;
    function pass(root = document.body) {
        const config = getConfig();
        const key = JSON.stringify([config.linkify, config.typographer]);
        if (key !== parserKey) { parser = createParser(config); parserKey = key; }
        const elements = root.matches?.(".text-element") ? [root] : [...root.querySelectorAll(".chat-msg-area .text-element")];
        for (const element of elements) {
            if (element.closest("[data-liuli-ghost]") || element.querySelector(".at-element, .at-text, img, video, [contenteditable]")) continue;
            let state = rendered.get(element);
            if (state && state.source.parentNode !== element) { rendered.delete(element); state = null; }
            if (!config.markdown) { if (state) { state.source.hidden = false; state.host.hidden = true; } continue; }
            if (!state) {
                const source = document.createElement("span"); source.className = "qm-markdown-source";
                while (element.firstChild) source.appendChild(element.firstChild);
                const host = document.createElement("span"); host.className = "qm-markdown";
                const shadow = host.attachShadow({ mode: "open" });
                state = { source, host, shadow, text: null, key: null };
                element.append(source, host); rendered.set(element, state);
            }
            const text = state.source.textContent || "";
            if (text.length > 100000) { state.source.hidden = false; state.host.hidden = true; continue; }
            if (state.text !== text || state.key !== key) {
                state.shadow.innerHTML = purify.sanitize(parser.render(text), { USE_PROFILES: { html: true }, FORBID_TAGS: ["style", "form", "input", "button", "textarea"], FORBID_ATTR: ["style", "id", "name"] });
                state.shadow.querySelectorAll("pre code").forEach(code => code.classList.add("hljs"));
                state.shadow.querySelectorAll("a").forEach(link => {
                    link.rel = "noopener noreferrer";
                    link.addEventListener("click", event => {
                        const href = link.getAttribute("href");
                        if (href && /^https?:/i.test(href)) { event.preventDefault(); event.stopPropagation(); window.liuli_api?.openExternal(href); }
                    });
                });
                state.text = text; state.key = key;
            }
            state.shadow.adoptedStyleSheets = [common, sheets[document.body.dataset.liuliDark === "1" ? 1 : 0]];
            state.source.hidden = true; state.host.hidden = false;
        }
        for (const [element] of rendered) if (!element.isConnected) rendered.delete(element);
    }
    const observer = new MutationObserver(() => pass());
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-liuli-dark"] });
    return { pass, dispose() { observer.disconnect(); rendered.clear(); } };
}
