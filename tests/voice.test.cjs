const test = require("node:test");
const assert = require("node:assert/strict");
const { pcmAudio, waveform } = require("../main/voice.cjs");
test("PCM 音频不改动原始样本", () => {
    const bytes = Buffer.alloc(4800); const result = pcmAudio(bytes); assert.equal(result.data, bytes); assert.equal(result.sampleRate, 24000);
});
test("WAV 声道或位深不兼容时终止，不发送错误音频", () => {
    const bytes = Buffer.alloc(44); bytes.write("RIFF",0); bytes.write("WAVE",8); bytes.write("fmt ",12); bytes.writeUInt32LE(16,16); bytes.writeUInt16LE(1,20); bytes.writeUInt16LE(2,22); bytes.writeUInt32LE(24000,24); bytes.writeUInt16LE(16,34); bytes.write("data",36);
    assert.throws(() => pcmAudio(bytes), /单声道/);
});
test("波形来自真实音频，静音不会伪装成大振幅", () => {
    assert.ok(waveform(Buffer.alloc(6400)).every(value => value === 0));
    const sound = Buffer.alloc(6400); for (let i = 0; i < sound.length; i += 2) sound.writeInt16LE(20000,i);
    assert.ok(waveform(sound).every(value => value > 0));
});
