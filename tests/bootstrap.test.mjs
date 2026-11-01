import test from "node:test";
import assert from "node:assert/strict";
import { pluginModuleUrl } from "../renderer/index.js";

test("Windows 插件路径能在 local 协议下继续解析相邻模块", () => {
    const entry = pluginModuleUrl(String.raw`D:\Tencent\QQNT\LiteLoaderQQNT\plugins\qm-qqnt`);
    assert.equal(new URL("./palette.mjs", entry).href,
        "local:///D:/Tencent/QQNT/LiteLoaderQQNT/plugins/qm-qqnt/renderer/palette.mjs");
    assert.equal(new URL("../assets/vendor/purify.mjs", entry).href,
        "local:///D:/Tencent/QQNT/LiteLoaderQQNT/plugins/qm-qqnt/assets/vendor/purify.mjs");
});

test("带空格和中文的路径保留目录层级", () => {
    const entry = pluginModuleUrl(String.raw`C:\用户目录\QQ NT\plugins\qm-qqnt` + "\\");
    assert.equal(decodeURIComponent(new URL("./features.mjs", entry).pathname),
        "/C:/用户目录/QQ NT/plugins/qm-qqnt/renderer/features.mjs");
});

test("Unix 插件路径仍使用文件绝对路径", () => {
    const entry = pluginModuleUrl("/home/user/QQ/plugins/qm-qqnt/");
    assert.equal(new URL("./wallpaper.mjs", entry).href,
        "local:///home/user/QQ/plugins/qm-qqnt/renderer/wallpaper.mjs");
});
