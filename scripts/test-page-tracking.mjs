import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source=await fs.readFile('components/usePageTracking.ts','utf8');
const compiled=ts.transpileModule(source.replace(/^import .*;\n/gm,''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const handlers={},calls=[],effects=[];
const sandbox={exports:{},usePathname:()=>'/properties',useRef:v=>({current:v}),useEffect:fn=>effects.push(fn),getToken:()=> 'existing-session',Date,JSON,
 api:(...args)=>{calls.push(args);return Promise.resolve();},
 window:{addEventListener:(k,v)=>handlers[k]=v,removeEventListener:()=>{}},
 document:{visibilityState:'hidden',addEventListener:(k,v)=>handlers[k]=v,removeEventListener:()=>{}}};
vm.runInNewContext(compiled,sandbox);sandbox.exports.default();effects[0]();handlers.pagehide();
assert.equal(calls.length,1);assert.equal(calls[0][0],'/api/activity/page');
assert.equal(calls[0][1].keepalive,true);assert.equal(calls[0][2].background,true);
assert.equal(JSON.parse(calls[0][1].body).path,'/properties');
console.log('PASS: page exit uses authenticated API with keepalive and background failure handling.');
