function success(result) {
    let value = result;
    for (let depth = 0; depth < 4 && value && typeof value === "object"; depth++) {
        const code = value.result ?? value.retCode ?? value.code;
        if (typeof code === "number" || typeof code === "string") return String(code) === "0";
        if (value.error || value.errMsg) return false;
        if (/^[1-9]\d*$/.test(String(value.msgId || ""))) return true;
        value = value.payload || value.data || (typeof value.result === "object" ? value.result : null);
    }
    return false;
}
module.exports = { success };
