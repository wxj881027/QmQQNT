import test from "node:test";
import assert from "node:assert/strict";
import { cropBounds, wallpaperGeometry } from "../renderer/wallpaper.mjs";
test("填充模式覆盖窗口并保持图片比例", () => {
    for (const [width, height] of [[1920, 1080], [800, 1400]]) for (const [vw, vh] of [[1400, 900], [700, 1200]]) {
        const g = wallpaperGeometry(width, height, vw, vh, null);
        assert.ok(g.width >= vw - 0.001 && g.height >= vh - 0.001);
        assert.ok(Math.abs(g.width / g.height - width / height) < 0.0001);
        assert.ok(g.left <= 0 && g.left + g.width >= vw - 0.001);
        assert.ok(g.top <= 0 && g.top + g.height >= vh - 0.001);
    }
});
test("越界选区被限制在图片内，绘制仍不会露底", () => {
    const area = { x: 0.9, y: -1, w: 0.5, h: 0.4 }; const crop = cropBounds(1000, 800, area);
    assert.ok(crop.x >= 0 && crop.x + crop.width <= 1000);
    const g = wallpaperGeometry(1000, 800, 1400, 900, area);
    assert.ok(g.left <= 0 && g.left + g.width >= 1400); assert.ok(g.top <= 0 && g.top + g.height >= 900);
});
test("包含模式完整展示图片", () => {
    const g = wallpaperGeometry(1000, 500, 1000, 1000, null, "contain");
    assert.equal(g.width, 1000); assert.equal(g.height, 500); assert.equal(g.top, 250);
});
