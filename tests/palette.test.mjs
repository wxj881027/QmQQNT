import test from "node:test";
import assert from "node:assert/strict";
import { sourceFromPixels, bubblePalette, contrastRatio, latestTask } from "../renderer/palette.mjs";
const pixels = colors => new Uint8ClampedArray(colors.flatMap(([color, count]) => Array.from({ length: count }, () => [...color, 255]).flat()));
test("少量鲜艳像素不覆盖壁纸主色", () => {
    assert.equal(sourceFromPixels(pixels([[[148, 168, 112], 99], [[255, 0, 170], 1]])), "#94a870");
});
test("相近色相的不同明度共同参与占比", () => {
    assert.equal(sourceFromPixels(pixels([[[160, 180, 120], 40], [[100, 120, 60], 40], [[220, 30, 30], 20]])), "#82965a");
});
test("中性壁纸保留中性色", () => { assert.equal(sourceFromPixels(pixels([[[180, 180, 180], 100]])), "#b4b4b4"); });
test("全透明壁纸回退默认色", () => { assert.equal(sourceFromPixels(new Uint8ClampedArray([255, 0, 0, 0])), "#1d9bf0"); });
test("亮暗气泡均保持正文可读", () => {
    for (const color of ["#000000", "#ffffff", "#ff0000", "#94a870", "#153071"]) for (const dark of [false, true]) {
        const palette = bubblePalette(color, dark);
        assert.ok(contrastRatio(palette.self, palette.selfText) >= 4.5);
        assert.ok(contrastRatio(palette.other, palette.otherText) >= 4.5);
    }
});
test("旧的异步取色不能覆盖新选择", async () => {
    const run = latestTask(); let finishOld; const output = [];
    const old = run(() => new Promise(resolve => { finishOld = resolve; }), result => output.push(result));
    await run(async () => "new", result => output.push(result)); finishOld("old");
    assert.equal(await old, false); assert.deepEqual(output, ["new"]);
});
test("返回先前已选图片也能取消尚未完成的中间取色", async () => {
    const run=latestTask(),output=[];let finishB;
    await run(async()=>"A",value=>output.push(value));
    const b=run(()=>new Promise(resolve=>{finishB=resolve;}),value=>output.push(value));
    await run(async()=>"A",value=>output.push(value)); finishB("B");await b;
    assert.deepEqual(output,["A","A"]);
});
