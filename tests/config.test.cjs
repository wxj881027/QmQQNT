const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { FeatureConfig } = require("../main/feature-config.cjs");
function temporary(t) { const directory=fs.mkdtempSync(path.join(os.tmpdir(),"qmqq-config-")); t.after(()=>fs.rmSync(directory,{recursive:true,force:true})); return directory; }
test("账号配置隔离，UI 不返回明文或密文密钥", t => {
    const encryption={isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from(value).reverse(),decryptString:value=>Buffer.from(value).reverse().toString()};
    const config=new FeatureConfig(temporary(t),encryption); config.useAccount("account-a");
    const visible=config.update({llm:{apiKey:"private-test-key",model:"a"}});
    assert.equal(visible.llm.keyConfigured,true); assert.equal("apiKey" in visible.llm,false); assert.equal("encryptedKey" in visible.llm,false);
    assert.equal(fs.readFileSync(config.file,"utf8").includes("private-test-key"),false);
    config.useAccount("account-b"); assert.equal(config.secret("llm"),"");
    config.useAccount("account-a"); assert.equal(config.secret("llm"),"private-test-key"); assert.equal(config.value.llm.model,"a");
});
test("无法加密时只在当前会话持有密钥", t => {
    const config=new FeatureConfig(temporary(t),{isEncryptionAvailable:()=>false}); config.useAccount("a");
    config.update({llm:{apiKey:"session-only-key"}}); assert.equal(config.secret("llm"),"session-only-key");
    const reloaded=new FeatureConfig(config.root,{isEncryptionAvailable:()=>false}); reloaded.useAccount("a"); assert.equal(reloaded.secret("llm"),"");
    assert.equal(fs.readFileSync(config.file,"utf8").includes("session-only-key"),false);
});
test("修改字号不使正在处理的模型配置失效", t => {
    const config=new FeatureConfig(temporary(t),{isEncryptionAvailable:()=>false}); config.useAccount("a");
    const llm=config.value.llm; config.update({fontSize:16}); assert.equal(config.value.llm,llm);
    config.update({llm:{mode:"auto"}}); assert.notEqual(config.value.llm,llm);
});
test("保存失败时不激活新的自动化配置", t => {
    const root=temporary(t),config=new FeatureConfig(root,{isEncryptionAvailable:()=>false}); config.useAccount("a");
    fs.writeFileSync(path.join(root,"accounts"),"blocking-file");
    assert.throws(()=>config.update({redPacket:{enabled:true}})); assert.equal(config.value.redPacket.enabled,false);
});
