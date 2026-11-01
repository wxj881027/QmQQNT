import test from "node:test";
import assert from "node:assert/strict";
import { enforceTokens } from "../renderer/theme-tokens.mjs";
function declaration() {
    const values=new Map();return {values,getPropertyValue:name=>values.get(name)?.value||"",getPropertyPriority:name=>values.get(name)?.priority||"",setProperty:(name,value,priority="")=>values.set(name,{value,priority})};
}
test("自定义调色盘的同名内联变量由主题接管，不改其他设置",()=>{
    const style=declaration();style.setProperty("--brand_standard","red","important");style.setProperty("--user-font","font");
    assert.equal(enforceTokens(style,[["--brand_standard","var(--ll-brand)"]]),1);
    assert.equal(style.getPropertyValue("--brand_standard"),"var(--ll-brand)");assert.equal(style.getPropertyValue("--user-font"),"font");
    assert.equal(enforceTokens(style,[["--brand_standard","var(--ll-brand)"]]),0);
});
