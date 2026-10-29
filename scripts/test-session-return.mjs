import assert from "node:assert/strict";
import ts from "typescript";
import {readFile} from "node:fs/promises";
const result = ts.transpileModule(await readFile("lib/session-return.ts","utf8"), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}});
const {safeReturnPath} = await import(`data:text/javascript;base64,${Buffer.from(result.outputText).toString("base64")}`);
assert.equal(safeReturnPath("/admin/publish?preview=1#clean-batch"),"/admin/publish?preview=1#clean-batch");
assert.equal(safeReturnPath("/property/123"),"/property/123");
for (const input of [null,"https://evil.test","//evil.test","/\\evil.test","/\tevil.test","/sign-in","/forgot-password","/reset-password"]) assert.equal(safeReturnPath(input),"/today");
console.log("Session return routes stay local and preserve the intended workflow");
