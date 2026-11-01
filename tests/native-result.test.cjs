const test=require("node:test");
const assert=require("node:assert/strict");
const {success}=require("../main/native-result.cjs");
test("明确失败的回包不能被消息 ID 覆盖成成功",()=>{
    assert.equal(success({result:1,msgId:"123"}),false); assert.equal(success({result:0,errMsg:""}),true);
});
test("超时和未知回包不作为确认成功",()=>{
    assert.equal(success({pending:true}),false); assert.equal(success({msgId:"0"}),false); assert.equal(success(undefined),false);
});
test("兼容带 payload 的确认回包",()=>{assert.equal(success({payload:{result:0}}),true);});
