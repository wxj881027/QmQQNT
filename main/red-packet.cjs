const { allowed, walletKind, OncePerMessage, KeyedQueue } = require("./automation-core.cjs");
const { textElement } = require("./llm.cjs");
const { createVoice } = require("./voice.cjs");
const { success } = require("./native-result.cjs");

function installRedPackets(runtime) {
    const seen = new OncePerMessage(), queue = new KeyedQueue(), controllers = new Map();
    runtime.onConfig(({ previous, next, accountChanged }) => { if (accountChanged || previous.redPacket !== next.redPacket) for (const controller of controllers.values()) controller.abort(); });
    runtime.onMessages(async (messages, windowId) => {
        for (const message of messages) {
            const config = runtime.config.value.redPacket, account = runtime.uid;
            if (!allowed(config, message) || Math.abs(Date.now() / 1000 - Number(message.msgTime)) > 120) continue;
            if (config.ignoreOwn && message.senderUid === account) continue;
            for (const element of message.elements || []) {
                const wallet = element.walletElement;
                if (!wallet?.billNo || !seen.accept(`${account}:${wallet.billNo}`)) continue;
                const kind = walletKind(wallet);
                if (kind === "unsupported") { runtime.broadcast("status", { feature: "redPacket", error: "收到未识别的红包类型，已跳过" }); continue; }
                if ((kind === "text" && !config.textPassword) || (kind === "voice" && !config.voicePassword)) continue;
                const profile = runtime.profile(windowId);
                if (!profile?.uin) { runtime.broadcast("status", { feature: "redPacket", error: "当前窗口没有提供本账号身份信息，未领取" }); continue; }
                const key = `${account}:${message.chatType}:${message.peerUid}`;
                await queue.run(key, async () => {
                    if (runtime.uid !== account || runtime.config.value.redPacket !== config || !allowed(config, message)) return;
                    const controller = new AbortController(); controllers.set(key, controller);
                    const timer = setTimeout(() => controller.abort(), 30000);
                    const valid = () => runtime.uid === account && runtime.config.value.redPacket === config && allowed(config, message) && !controller.signal.aborted;
                    try {
                        const prompt = String(wallet.receiver?.title || "").trim();
                        if (kind !== "ordinary") {
                            if (!prompt || prompt.length > 128) throw new Error("红包口令无效");
                            const reply = kind === "voice" ? await createVoice(runtime, windowId, prompt, controller.signal) : textElement(prompt);
                            if (!valid()) return;
                            const sent = await runtime.sendElements(windowId, message, [reply]);
                            if (!success(sent)) throw new Error("QQ 未确认口令发送成功，未领取红包");
                        }
                        if (!valid()) return;
                        const result = await runtime.broker.request(windowId, "nodeIKernelMsgService/grabRedBag", [{ grabRedBagReq: {
                            recvUin: Number(message.chatType) === 1 ? profile.uin : String(message.peerUid), recvType: Number(message.chatType),
                            peerUid: String(message.peerUid), name: profile.nickName || "", pcBody: wallet.pcBody,
                            wishing: prompt, msgSeq: String(message.msgSeq), index: wallet.stringIndex
                        } }, { timeout: 5000 }]);
                        if (!result?.grabRedBagRsp?.recvdOrder) throw new Error("QQ 未返回领取结果");
                        runtime.broadcast("status", { feature: "redPacket", message: "红包处理完成", amount: result.grabRedBagRsp.recvdOrder.amount });
                    } catch (error) { runtime.broadcast("status", { feature: "redPacket", error: error.message }); }
                    finally { clearTimeout(timer); controllers.delete(key); }
                }).catch(error => runtime.broadcast("status", { feature: "redPacket", error: error.message }));
            }
        }
    });
}
module.exports = { installRedPackets };
