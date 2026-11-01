// 只转换渲染副本；原始消息和 QQ 数据库存储保持原样。
function webCard(ark) {
    let data; try { data = JSON.parse(ark.bytesData); } catch { return ark; }
    if (data.app !== "com.tencent.miniapp_01" && !String(data.prompt || "").includes("QQ小程序")) return ark;
    const detail = data.meta?.detail_1;
    if (!detail?.qqdocurl) return ark;
    let url; try { url = new URL(String(detail.qqdocurl).replace(/\\/g, "")); } catch { return ark; }
    if (!["http:", "https:"].includes(url.protocol)) return ark;
    const title = String(detail.title || detail.desc || "网页分享");
    return { ...ark, bytesData: JSON.stringify({ app: "com.tencent.structmsg", config: data.config || {}, desc: "网页分享", meta: { news: {
        jumpUrl: url.href, title, desc: String(detail.desc || ""), preview: String(detail.preview || ""), tag: title, appid: String(detail.appid || "")
    } }, prompt: `[分享]${title}`, ver: "0.0.0.1", view: "news" }) };
}
function decorateMessage(message, config) {
    let result = message;
    if (config.replaceMiniApps) {
        const elements = (message.elements || []).map(element => element.arkElement ? { ...element, arkElement: webCard(element.arkElement) } : element);
        result = { ...result, elements };
    }
    // 沿用 QQ 消息属性里的气泡描述字段，不影响消息内容或发送参数。
    const info = result.msgAttrs?.get?.(0)?.vasMsgInfo;
    if (info?.bubbleInfo) {
        result = structuredClone(result);
        result.msgAttrs.get(0).vasMsgInfo.bubbleInfo = { bubbleId: 0, bubbleDiyTextId: null, subBubbleId: null, canConvertToText: null };
    }
    return result;
}
module.exports = { webCard, decorateMessage };
