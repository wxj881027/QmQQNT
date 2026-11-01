const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { endpoint } = require("./llm.cjs");

function pcmAudio(buffer) {
    if (buffer.subarray(0, 4).toString() !== "RIFF") return { data: buffer, sampleRate: 24000 };
    let fmt, data;
    for (let offset = 12; offset + 8 <= buffer.length;) {
        const name = buffer.subarray(offset, offset + 4).toString(), size = buffer.readUInt32LE(offset + 4), start = offset + 8;
        if (size > buffer.length - start) throw new Error("TTS 音频数据不完整");
        if (name === "fmt ") {
            if (size < 16) throw new Error("TTS WAV 格式头不完整");
            fmt = { format: buffer.readUInt16LE(start), channels: buffer.readUInt16LE(start + 2), sampleRate: buffer.readUInt32LE(start + 4), bits: buffer.readUInt16LE(start + 14) };
        }
        if (name === "data") data = buffer.subarray(start, start + size);
        offset = start + size + (size % 2);
    }
    if (!fmt || !data || fmt.format !== 1 || fmt.channels !== 1 || fmt.bits !== 16 || ![8000, 12000, 16000, 24000, 48000].includes(fmt.sampleRate)) throw new Error("TTS 需返回单声道 16 位 PCM，或兼容的 WAV");
    return { data, sampleRate: fmt.sampleRate };
}
function waveform(pcm) {
    const samples = Math.floor(pcm.length / 2), result = [];
    for (let bin = 0; bin < 32; bin++) {
        const first = Math.floor(bin * samples / 32), last = Math.floor((bin + 1) * samples / 32);
        let sum = 0;
        for (let sample = first; sample < last; sample++) sum += (pcm.readInt16LE(sample * 2) / 32768) ** 2;
        result.push(Math.min(31, Math.round(Math.sqrt(sum / Math.max(1, last - first)) * 31)));
    }
    return result;
}
function nativePath(value, depth = 0) {
    if (depth > 4 || !value) return null;
    if (typeof value === "string") return path.isAbsolute(value) ? value : null;
    if (typeof value !== "object") return null;
    for (const key of ["filePath", "path", "file_path", "result", "data", "payload"]) { const found = nativePath(value[key], depth + 1); if (found) return found; }
    return null;
}
async function createVoice(runtime, windowId, text, signal, { fetcher = fetch } = {}) {
    const config = runtime.config.value.redPacket;
    if (!config.ttsEndpoint || !config.ttsModel || !config.ttsVoice) throw new Error("请先填写 TTS 接口、模型与音色");
    const apiKey = runtime.config.secret("redPacket");
    const response = await fetcher(endpoint(config.ttsEndpoint, "audio/speech"), {
        method: "POST", signal, headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: "Bearer " + apiKey } : {}) },
        body: JSON.stringify({ model: config.ttsModel, voice: config.ttsVoice, input: text, response_format: "pcm" })
    });
    if (!response.ok) throw new Error(`TTS 接口返回 ${response.status}`);
    if ((response.headers?.get("content-type") || "").includes("json")) throw new Error("TTS 返回了错误信息而非音频");
    const reader = response.body.getReader(); const chunks = []; let length = 0;
    try {
        while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 4 * 1024 * 1024) { await reader.cancel(); throw new Error("TTS 音频过大"); } chunks.push(Buffer.from(value)); }
    } finally { reader.releaseLock(); }
    const audio = pcmAudio(Buffer.concat(chunks)), duration = audio.data.length / (audio.sampleRate * 2);
    if (!audio.data.length || audio.data.length % 2 || duration > 30) throw new Error("TTS 音频长度无效或超过 30 秒");
    const silk = await require("./vendor/silk/lib/index.cjs").encode(audio.data, audio.sampleRate);
    if (signal.aborted) throw new Error("语音任务已取消");
    const bytes = Buffer.from(silk.data), hash = createHash("md5").update(bytes).digest("hex"), fileName = hash + ".amr";
    const result = await runtime.broker.request(windowId, "nodeIKernelMsgService/getRichMediaFilePathForGuild", [{ path_info: { md5HexStr: hash, fileName, elementType: 2, elementSubType: 0, thumbSize: 0, needCreate: true, downloadType: 1, file_uuid: "" } }]);
    if (signal.aborted) throw new Error("语音任务已取消");
    const filePath = nativePath(result);
    if (!filePath) throw new Error("QQ 没有返回语音缓存路径");
    await fs.mkdir(path.dirname(filePath), { recursive: true }); await fs.writeFile(filePath, bytes);
    return { elementType: 4, elementId: "", pttElement: {
        fileName, filePath, md5HexStr: hash, fileSize: String(bytes.length), duration: Math.max(1, Math.ceil(duration)),
        formatType: 1, voiceType: 1, voiceChangeType: 0, canConvert2Text: true, waveAmplitudes: waveform(audio.data),
        fileUuid: "", fileSubId: "", playState: 1, autoConvertText: 0, storeID: 0, otherBusinessInfo: { aiVoiceType: 0 }
    } };
}
module.exports = { createVoice, pcmAudio, waveform, nativePath };
