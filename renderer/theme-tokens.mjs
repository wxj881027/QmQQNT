// 只维护 QQ 语义颜色变量，不读每个叶子节点的计算样式。
export function enforceTokens(style, bindings) {
    let changed = 0;
    for (const [name, value] of bindings) {
        if (style.getPropertyValue(name).trim() === value && style.getPropertyPriority(name) === "important") continue;
        style.setProperty(name, value, "important"); changed++;
    }
    return changed;
}
export function installThemeTokens(css) {
    const sheet = new CSSStyleSheet(); sheet.replaceSync(css);
    const rule = [...sheet.cssRules].find(rule => rule.style && rule.selectorText?.includes("data-liuli-theme"));
    if (!rule) return () => {};
    const bindings = Array.from(rule.style).filter(name => name.startsWith("--")).map(name => [name, rule.style.getPropertyValue(name).trim()]);
    const update = () => enforceTokens(document.body.style, bindings);
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, attributeFilter: ["style", "q-theme", "is-base-theme", "is-simple-theme"] });
    return () => observer.disconnect();
}
