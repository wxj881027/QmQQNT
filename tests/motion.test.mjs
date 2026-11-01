import test from "node:test";
import assert from "node:assert/strict";
import { MessageBaseline, MotionDriver } from "../renderer/motion-core.mjs";
test("历史与虚拟列表滚动不作为新消息入场", () => {
    const state = new MessageBaseline();
    assert.deepEqual(state.update("a", ["10", "20"], ["10", "20"]), []);
    assert.deepEqual(state.update("a", ["1", "2", "10"], ["1", "2"]), []);
});
test("同批新消息不依赖 DOM 顺序且不会重复播放", () => {
    const state = new MessageBaseline(); state.update("a", ["20"], []);
    assert.deepEqual(state.update("a", ["22", "21", "20"], ["22", "21", "21"]), ["22", "21"]);
});
test("同名会话按独立 ID 建立基线", () => {
    const state = new MessageBaseline(); state.update("peer-a", ["20"], []);
    assert.deepEqual(state.update("peer-b", ["100"], ["100"]), []);
});
test("消息 ID 保留 64 位精度", () => {
    const state = new MessageBaseline(); state.update("a", ["9007199254740992"], []);
    assert.deepEqual(state.update("a", ["9007199254740993"], ["9007199254740993"]), ["9007199254740993"]);
});
test("中断从当前呈现值继续，旧回调不能清除新动画", () => {
    const calls = [];
    const target = { animate(frames) { const animation = { cancel() {} }; calls.push({ frames, animation }); return animation; } };
    const driver = new MotionDriver({ presentation: () => ({ opacity: "0.6", translate: "0px 3px" }) });
    driver.play(target, [{ opacity: 0 }, { opacity: 1 }]); const completeOld = calls[0].animation.onfinish;
    driver.play(target, [{ opacity: 0, translate: "0px 8px" }, { opacity: 1, translate: "0px 0px" }]); completeOld();
    assert.equal(calls[1].frames[0].opacity, "0.6"); assert.equal(calls[1].frames[0].translate, "0px 3px");
    assert.equal(driver.active.get(target), calls[1].animation);
});
test("减少动态效果开启后取消旧动画，不创建新动画", () => {
    let reduced = false, created = 0, cancelled = 0;
    const target = { animate() { created++; return { cancel() { cancelled++; } }; } };
    const driver = new MotionDriver({ reduced: () => reduced });
    driver.play(target, [{ opacity: 0 }, { opacity: 1 }]); reduced = true; driver.play(target, [{ opacity: 0 }, { opacity: 1 }]);
    assert.equal(created, 1); assert.equal(cancelled, 1); assert.equal(driver.active.size, 0);
});
