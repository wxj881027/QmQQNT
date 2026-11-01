// 颜色按占比投票，少量高饱和像素不能抢走整张壁纸的主色。
export function sourceFromPixels(pixels, fallback = "#1d9bf0") {
    const groups = new Map();
    for (let i = 0; i + 3 < pixels.length; i += 4) {
        const [r, g, b, alpha] = pixels.subarray(i, i + 4);
        if (alpha < 128) continue;
        const hi = Math.max(r, g, b), lo = Math.min(r, g, b), delta = hi - lo;
        const saturation = hi ? delta / hi : 0;
        let hue = 0;
        if (delta) {
            hue = hi === r ? (g - b) / delta : hi === g ? 2 + (b - r) / delta : 4 + (r - g) / delta;
            hue = (hue * 60 + 360) % 360;
        }
        // 中性色也参与投票，灰白壁纸不强行染成蓝色。
        const key = saturation < 0.16 ? "neutral" : Math.round(hue / 30) % 12;
        const weight = alpha / 255;
        const bin = groups.get(key) || { r: 0, g: 0, b: 0, weight: 0 };
        bin.r += r * weight; bin.g += g * weight; bin.b += b * weight; bin.weight += weight;
        groups.set(key, bin);
    }
    const winner = [...groups.values()].sort((a, b) => b.weight - a.weight)[0];
    if (!winner) return fallback;
    return "#" + [winner.r, winner.g, winner.b].map(v => Math.round(v / winner.weight).toString(16).padStart(2, "0")).join("");
}

export function mixColors(a, b, amount) {
    const weight = Math.max(0, Math.min(1, amount));
    return "#" + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - weight) + parseInt(b.slice(i, i + 2), 16) * weight).toString(16).padStart(2, "0")).join("");
}

function luminance(hex) {
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

export function contrastRatio(a, b) {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function readableText(background) {
    return contrastRatio(background, "#17212b") >= contrastRatio(background, "#ffffff") ? "#17212b" : "#ffffff";
}

export function bubblePalette(source, dark) {
    const self = mixColors(dark ? "#25313c" : "#f5f8fa", source, dark ? 0.32 : 0.22);
    const other = mixColors(dark ? "#202b36" : "#ffffff", source, 0.06);
    return { self, selfText: readableText(self), other, otherText: readableText(other) };
}

// 仅最新请求可提交；换图、换明暗时旧解码结果不能覆盖新选择。
export function latestTask() {
    let revision = 0;
    return async (prepare, commit) => {
        const current = ++revision;
        const result = await prepare();
        if (current !== revision) return false;
        commit(result);
        return true;
    };
}
