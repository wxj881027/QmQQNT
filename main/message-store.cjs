const { serialize, deserialize } = require("node:v8");
const clone = value => deserialize(serialize(value));
const keyOf = msg => `${Number(msg.chatType)}:${String(msg.peerUid)}:${String(msg.msgId)}`;
const peerKey = msg => `${Number(msg.chatType)}:${String(msg.peerUid)}`;

function revokeOf(msg) { return msg?.elements?.find(element => element.grayTipElement?.revokeElement)?.grayTipElement.revokeElement; }
function textOf(msg) { return (msg.elements || []).filter(element => element.textElement?.atType === 0 || element.textElement?.atType === undefined).map(element => element.textElement?.content || "").join("").trim(); }

// 撤回缓存、会话统计和序号各自保存，不能把序号冒充消息数量。
class MessageStore {
    constructor({ capacity = 2000, recalled = [], stats = [], observed = [] } = {}) {
        this.capacity = capacity; this.live = new Map(); this.recalled = new Map(Array.isArray(recalled) ? recalled.filter(item => Array.isArray(item) && item.length === 2) : []); this.stats = new Map(Array.isArray(stats) ? stats.filter(item => Array.isArray(item) && item.length === 2) : []); this.observed = new Set(Array.isArray(observed) ? observed.slice(-20000) : []);
    }
    hasObserved(msg) { return this.observed.has(keyOf(msg)); }
    remember(msg, live = false) {
        if (!msg?.msgId || !msg.peerUid || !Array.isArray(msg.elements)) return;
        const key = keyOf(msg);
        if (!revokeOf(msg)) {
            this.live.delete(key); this.live.set(key, clone(msg));
            while (this.live.size > this.capacity) this.live.delete(this.live.keys().next().value);
        }
        const peer = peerKey(msg);
        let stats = this.stats.get(peer);
        if (!stats || typeof stats !== "object" || !Number.isFinite(stats.observed)) stats = { observed: 0, startedAt: Date.now(), lastSequence: null };
        if (!/^\d+$/.test(String(stats.lastSequence))) stats.lastSequence = null;
        if (live && !this.observed.has(key)) {
            this.observed.add(key); stats.observed++;
            while (this.observed.size > 20000) this.observed.delete(this.observed.values().next().value);
        }
        if (/^\d+$/.test(String(msg.msgSeq))) {
            const seq = String(msg.msgSeq);
            if (stats.lastSequence === null || BigInt(seq) > BigInt(stats.lastSequence)) stats.lastSequence = seq;
        }
        this.stats.set(peer, stats);
    }
    restore(msg, enabled) {
        const revoke = revokeOf(msg);
        if (!enabled || !revoke) return msg;
        // 保留自己撤回自己的正常路径，包括 QQ 的重新编辑入口。
        if (revoke.isSelfOperate && (!revoke.origMsgSenderUid || !revoke.operatorUid || revoke.origMsgSenderUid === revoke.operatorUid)) return msg;
        const key = keyOf(msg), original = this.live.get(key) || this.recalled.get(key)?.message;
        if (!original || revokeOf(original)) return msg;
        this.recalled.set(key, { message: clone(original), operator: String(revoke.operatorMemRemark || revoke.operatorRemark || revoke.operatorNick || "对方"), time: Date.now() });
        while (this.recalled.size > this.capacity) this.recalled.delete(this.recalled.keys().next().value);
        return clone(original);
    }
    find(reference) { return this.live.get(keyOf(reference)) || this.recalled.get(keyOf(reference))?.message; }
    metadata(reference) {
        const msg = this.find(reference), recall = this.recalled.get(keyOf(reference));
        return { msgId: String(reference.msgId), recalled: recall ? { operator: recall.operator, time: recall.time } : null,
            sequence: msg?.msgSeq === undefined ? null : String(msg.msgSeq), sentAt: msg?.msgTime || null,
            peer: this.stats.get(peerKey(reference)) || null };
    }
    snapshot() { return { recalled: [...this.recalled], stats: [...this.stats], observed: [...this.observed] }; }
}

function findMessageLists(value, depth = 0, output = [], visited = new Set()) {
    if (!value || typeof value !== "object" || depth > 5 || visited.has(value)) return output;
    visited.add(value);
    if (Array.isArray(value)) { for (const child of value) findMessageLists(child, depth + 1, output, visited); return output; }
    if (Array.isArray(value.msgList)) output.push(value.msgList);
    if (value.msgRecord?.msgId) output.push({ 0: value.msgRecord, length: 1, owner: value });
    for (const key of ["payload", "result", "data"]) findMessageLists(value[key], depth + 1, output, visited);
    return output;
}

module.exports = { MessageStore, keyOf, peerKey, textOf, revokeOf, findMessageLists };
