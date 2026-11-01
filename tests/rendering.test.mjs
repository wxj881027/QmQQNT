import test from "node:test";
import assert from "node:assert/strict";
import { groupRuns } from "../renderer/grouping.mjs";
import { parseFontSize } from "../renderer/feature-helpers.mjs";
import { createParser } from "../renderer/markdown.mjs";
test("相同昵称但不同发送者不合并", () => { assert.deepEqual(groupRuns([{ sender: "uid-a", self: false }, { sender: "uid-b", self: false }]), ["single", "single"]); });
test("连续消息只在组末显示尾角", () => { assert.deepEqual(groupRuns([1,2,3].map(time => ({ sender: "uid", self: false, time }))), ["first", "mid", "last"]); });
test("跨日期或长时间间隔不合并", () => {
    assert.deepEqual(groupRuns([{ sender: "uid", day: "a", time: 1 }, { sender: "uid", day: "b", time: 2 }]), ["single", "single"]);
    assert.deepEqual(groupRuns([{ sender: "uid", time: 1 }, { sender: "uid", time: 500 }]), ["single", "single"]);
});
test("字号接受带 px 的直接输入，拒绝无效或越界值", () => {
    assert.equal(parseFontSize("16px"),16); assert.equal(parseFontSize("14.5 px"),14.5);
    for (const input of ["auto","8px","50px","14em",""]) assert.equal(parseFontSize(input),null);
});
test("链接自动识别与排版替换可以分别关闭", () => {
    const enabled=createParser({linkify:true,typographer:true}), disabled=createParser({linkify:false,typographer:false});
    assert.match(enabled.render('https://example.test "hello"'),/<a href="https:\/\/example.test/); assert.match(enabled.render('"hello"'),/“hello”/);
    assert.doesNotMatch(disabled.render('https://example.test'),/<a /); assert.match(disabled.render('"hello"'),/&quot;hello&quot;/);
});
test("代码块语法高亮不会把代码中的 Markdown 当成排版指令", () => {
    const html=createParser().render('```js\nconst value = "hello";\n```');
    assert.match(html,/hljs-keyword/); assert.doesNotMatch(html,/“hello”/);
});
test("HTML 与危险链接不作为可执行内容渲染", () => {
    const html=createParser().render('<script>alert(1)</script>\n[x](javascript:alert(1))');
    assert.doesNotMatch(html,/<script|href="javascript:/); assert.match(html,/&lt;script&gt;/);
});
