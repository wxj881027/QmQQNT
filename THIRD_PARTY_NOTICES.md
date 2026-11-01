# 第三方来源

QmQQNT 基于 [LilycleHeart/qqnt-liuli-theme](https://github.com/LilycleHeart/qqnt-liuli-theme)，基线提交 `af43b61cae619e31c28958b63d5ae4de71551786`。保留原主题作者署名。

## 随插件分发的代码

| 文件 | 来源和版本 | 许可 |
| --- | --- | --- |
| `renderer/vendor/reply-at-control.mjs` | [MeiYongAI/QQNT-Toolbox](https://github.com/MeiYongAI/QQNT-Toolbox) `636e4a6cc7d57d6828de554b12032847cd10f6e3` 的 `src/reply-at-control.js`，添加来源注释，其他实现保持原样 | AGPL-3.0-only，见 `licenses/AGPL-3.0.txt` |
| `assets/vendor/markdown-it.mjs` | npm `markdown-it@15.0.3` 的浏览器 ESM 构建 | MIT，见 `assets/vendor/licenses/markdown-it.txt` |
| `assets/vendor/highlight.mjs`、GitHub 明暗高亮样式 | npm `@highlightjs/cdn-assets@11.12.0` | BSD-3-Clause，见 `assets/vendor/licenses/highlight.txt` |
| `assets/vendor/purify.mjs` | npm `dompurify@3.4.17` | 随原包保留许可，见 `assets/vendor/licenses/dompurify.txt` |
| `main/vendor/silk/` | npm `silk-wasm@3.3.4` 的预构建 JS/WASM | MIT，见 `main/vendor/silk/LICENSE` |
| `assets/mcu.js` | 原主题附带 Material Color Utilities | 保留文件中的原版权声明 |

新增整合代码及 AGPL 衍生部分按 AGPL-3.0-only 分发；其他第三方文件保留各自的许可和版权声明。

## 仅参考接口与行为

- [xiyuesaves/lite-tools](https://github.com/xiyuesaves/lite-tools)，`dev/v5`，提交 `540a8c45e59d15f8bea016a8d62ca25991618eca`：QQ 消息属性、时间、原生编辑器与侧栏入口。
- [WJZ-P/LiteLoaderQQNT-Grab-RedBag](https://github.com/WJZ-P/LiteLoaderQQNT-Grab-RedBag)，提交 `b100bd0f0271e58b83115a25b38f18dcad7e9b73`：普通与文字口令红包的 IPC 参数形状；没有整体复制其实现。
- [LilycleHeart/qqnt-enhance](https://github.com/LilycleHeart/qqnt-enhance)：防撤回、复读与 QQ IPC 载荷形状；没有复制其实现。
- [TelegramMessenger/telegram-macos](https://github.com/TelegramMessenger/telegram-macos)：短时缓出、可中断过渡与气泡分组的交互方向；没有复制 Swift 实现或 Telegram 资源。
