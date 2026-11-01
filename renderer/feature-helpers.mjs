export function parseFontSize(value) {
    const match = /^\s*(\d{1,2}(?:\.\d+)?)\s*(?:px)?\s*$/i.exec(String(value));
    if (!match) return null;
    const size = Number(match[1]); return size >= 10 && size <= 28 ? size : null;
}
export function recordOf(element) {
    const message = element?.closest?.(".message") || element?.querySelector?.(".message");
    for (const instance of message?.__VUE__ || []) if (instance.props?.msgRecord) return instance.props.msgRecord;
    return null;
}
export function referenceOf(record) { return { msgId: String(record.msgId), chatType: Number(record.chatType), peerUid: String(record.peerUid) }; }
export function vueValue(element, paths) {
    const instances = [...(element?.__VUE__ || []), element?.__vueParentComponent].filter(Boolean);
    for (const instance of instances) for (const path of paths) {
        let value = instance;
        for (const part of path.split(".")) value = value?.[part];
        if (value !== undefined && value !== null) return value;
    }
    return null;
}
export function currentEditor() {
    for (const instance of document.querySelector(".qq-msg-editor")?.__VUE__ || []) {
        const getter = instance.proxy?.getEditor;
        const result = typeof getter === "function" ? getter.call(instance.proxy) : getter;
        const editor = result?.editor || result?.value?.editor || result;
        if (editor?.view && editor?.commonPlugin) return editor;
    }
    return null;
}
