import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import ts from 'typescript';
const temp=new URL('../.session-race-api-test.mjs',import.meta.url);
let source=await readFile(new URL('../lib/api.ts',import.meta.url),'utf8');
source=source.replace(/import[^;]+;/g,'');
await writeFile(temp,ts.transpileModule('const APP_VERSION="synthetic";\n'+source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText);
const original={window:globalThis.window,localStorage:globalThis.localStorage,fetch:globalThis.fetch};
try {
  const saved=new Map();
  const storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
  globalThis.localStorage=storage;
  globalThis.window={location:{pathname:'/ask',href:'/ask'},sessionStorage:{getItem:()=>null}};
  const {api,setToken,getToken}=await import(temp.href);
  for(const [changed,background] of [[true,false],[false,false],[false,true]]) {
    saved.clear();setToken('old-synthetic-token');window.location.href='/ask';
    let finish;
    globalThis.fetch=async(url,opts)=>{
      assert.equal(opts.headers.get('Authorization'),'Bearer old-synthetic-token');
      return new Promise(resolve=>{finish=resolve;});
    };
    const request=api('/api/assistant/ask',{}, {background});
    if(changed)setToken('new-synthetic-token');
    finish(new Response(JSON.stringify({detail:'Could not validate credentials'}),{status:401,headers:{'Content-Type':'application/json'}}));
    await assert.rejects(request,e=>e.status===401);
    assert.equal(getToken(),changed?'new-synthetic-token':background?'old-synthetic-token':null);
    assert.equal(window.location.href,!changed&&!background?'/sign-in':'/ask');
  }
  console.log('PASS: stale 401 preserves a new session; current-session 401 still clears and redirects; background failures do not redirect.');
} finally {
  for(const [key,value] of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
  await unlink(temp);
}
