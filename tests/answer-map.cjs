const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");
const box = {exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("lib/answer-map.ts","utf8"), {
  compilerOptions:{module:ts.ModuleKind.CommonJS}
}).outputText, box);
const parse=box.exports.parseAnswerMap;
assert.equal(parse('{"suburb":" Riverhead "}').suburb,"Riverhead");
for(const value of [{suburb:""},{suburb:12},{suburb:"<script>"},{suburb:"x".repeat(101)}]) assert.equal(parse(JSON.stringify(value)),null);
assert.equal(parse("not json"),null);
assert.equal(parse("x".repeat(2001)),null);
console.log("Answer map parser: 7 checks passed");
