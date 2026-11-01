export const MOTION = Object.freeze({ duration: 200, exit: 140, easing: "cubic-bezier(0.2, 0, 0, 1)" });

// 一次插入中的消息必须和同一份基线比较，不能依赖 DOM 的遍历顺序。
export class MessageBaseline {
    chat = null;
    maximum = null;
    update(chat, ids, added) {
        const numeric = ids.map(id => /^\d+$/.test(id || "") ? BigInt(id) : null).filter(id => id !== null);
        const max = numeric.reduce((a, b) => a === null || b > a ? b : a, this.chat === chat ? this.maximum : null);
        const previous = this.chat === chat ? this.maximum : null;
        this.chat = chat;
        this.maximum = max;
        if (previous === null) return [];
        return [...new Set(added)].filter(id => /^\d+$/.test(id || "") && BigInt(id) > previous);
    }
}

export class MotionDriver {
    active = new Map();
    constructor({ reduced = () => false, presentation = () => null } = {}) {
        this.reduced = reduced;
        this.presentation = presentation;
    }
    play(element, frames, options = {}) {
        const old = this.active.get(element);
        // 先读当前呈现值，再取消；快速反向操作从当前画面继续。
        const current = old ? this.presentation(element) : null;
        if (old) { old.onfinish = null; old.oncancel = null; old.cancel(); this.active.delete(element); }
        if (this.reduced() || !element?.animate) return null;
        const keyframes = frames.map(frame => ({ ...frame }));
        if (current) for (const key of Object.keys(keyframes[0])) if (current[key] !== undefined) keyframes[0][key] = current[key];
        const animation = element.animate(keyframes, { duration: MOTION.duration, easing: MOTION.easing, ...options });
        this.active.set(element, animation);
        const clear = () => { if (this.active.get(element) === animation) this.active.delete(element); };
        animation.onfinish = clear;
        animation.oncancel = clear;
        return animation;
    }
    cancelAll() {
        for (const animation of this.active.values()) { animation.onfinish = null; animation.oncancel = null; animation.cancel(); }
        this.active.clear();
    }
}
