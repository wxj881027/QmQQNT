export function cropBounds(width, height, area) {
    const finite = (v, fallback) => Number.isFinite(v) ? v : fallback;
    const x = Math.max(0, Math.min(0.99, finite(area?.x, 0)));
    const y = Math.max(0, Math.min(0.99, finite(area?.y, 0)));
    return { x: x * width, y: y * height,
        width: Math.max(0.01, Math.min(1 - x, finite(area?.w, 1))) * width,
        height: Math.max(0.01, Math.min(1 - y, finite(area?.h, 1))) * height };
}

// 使用同一个窗口坐标系，切换会话或开关右栏不能改变壁纸的缩放基准。
export function wallpaperGeometry(width, height, viewWidth, viewHeight, area, fit = "cover") {
    if (![width, height, viewWidth, viewHeight].every(v => Number.isFinite(v) && v > 0)) return { size: "cover", position: "center" };
    if (fit === "stretch") return { size: "100% 100%", position: "center" };
    const crop = cropBounds(width, height, area);
    const scale = fit === "contain" ? Math.min(viewWidth / width, viewHeight / height) : Math.max(viewWidth / crop.width, viewHeight / crop.height);
    const renderedWidth = width * scale, renderedHeight = height * scale;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const left = fit === "contain" ? (viewWidth - renderedWidth) / 2 : clamp(viewWidth / 2 - (crop.x + crop.width / 2) * scale, viewWidth - renderedWidth, 0);
    const top = fit === "contain" ? (viewHeight - renderedHeight) / 2 : clamp(viewHeight / 2 - (crop.y + crop.height / 2) * scale, viewHeight - renderedHeight, 0);
    const percent = (offset, difference) => Math.abs(difference) < 0.0001 ? 50 : offset / difference * 100;
    return { size: `${renderedWidth / viewWidth * 100}% ${renderedHeight / viewHeight * 100}%`,
        position: `${percent(left, viewWidth - renderedWidth)}% ${percent(top, viewHeight - renderedHeight)}%`,
        width: renderedWidth, height: renderedHeight, left, top };
}

export function createWallpaper({ geometry = wallpaperGeometry, decode = async src => {
    const image = new Image(); image.src = src; await image.decode(); return image;
} } = {}) {
    let revision = 0, currentKey = null, pendingKey = null, pending = null, timer = 0;
    let layers = [];
    function position(layer) {
        if (!layer.image) return;
        const g = geometry(layer.image.naturalWidth, layer.image.naturalHeight, innerWidth, innerHeight, layer.state.area, layer.state.fit);
        layer.element.style.backgroundSize = g.size;
        layer.element.style.backgroundPosition = g.position;
    }
    const resize = () => { for (const layer of layers) position(layer); };
    window.addEventListener("resize", resize);
    async function update(state) {
        const key = JSON.stringify([state?.src || null, state?.area || null, state?.fit || "cover"]);
        if (key === pendingKey) return pending;
        if (key === currentKey && !pendingKey) return;
        const request = ++revision;
        pendingKey = key;
        pending = (async () => {
            let image = null;
            if (state?.src) { try { image = await decode(state.src); } catch { return; } }
            if (request !== revision) return;
            const element = document.createElement("div");
            element.className = "liuli-wallpaper-layer";
            element.setAttribute("aria-hidden", "true");
            const layer = { element, image, state: { ...state } };
            if (image) { element.style.backgroundImage = `url(${JSON.stringify(state.src)})`; position(layer); }
            else element.style.backgroundColor = "var(--ll-app-bg)";
            document.body.appendChild(element);
            layers.push(layer);
            // 保留最底层直到新图完全可见，快速连续选择也不会露出空白。
            if (layers.length > 8) { layers[1].element.remove(); layers.splice(1, 1); }
            const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
            if (!layers.slice(0, -1).length || reduced) element.style.opacity = "1";
            else {
                const animation = element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out", fill: "backwards" });
                animation.onfinish = () => { element.style.opacity = "1"; };
            }
            currentKey = key;
            clearTimeout(timer);
            timer = setTimeout(() => {
                if (request !== revision) return;
                for (const old of layers) if (old !== layer) old.element.remove();
                layers = [layer];
            }, reduced ? 0 : 220);
        })();
        try { await pending; } finally { if (request === revision) { pendingKey = null; pending = null; } }
    }
    return { update, dispose() { ++revision; clearTimeout(timer); window.removeEventListener("resize", resize); for (const layer of layers) layer.element.remove(); layers = []; } };
}
