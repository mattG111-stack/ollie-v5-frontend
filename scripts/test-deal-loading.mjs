import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile('components/DealFinder.tsx','utf8');
const body=source.slice(source.indexOf('    let cancelled = false;'),source.indexOf('  }, [qs, retry]);'));
const js=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
function run(){
 const state={},pending={};
 const names=['Loading','Error','Rows','Hero','Summary','Shown','ListTotal'];
 const api=path=>new Promise((resolve,reject)=>{pending[path.includes('/summary?')?'summary':'list']={resolve,reject};});
 const cleanup=new Function('api','qs','PAGE',...names.map(n=>'set'+n),js)(api,{},20,...names.map(n=>v=>{state[n]=v;}));
 return {state,pending,cleanup};
}
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
const a=run();a.pending.list.resolve({rows:[{id:2}],total:42});await flush();
assert.equal(a.state.Loading,false);assert.equal(a.state.Hero.id,2);assert.equal(a.state.ListTotal,42);assert.equal(a.state.Summary,null);
a.pending.summary.reject(new Error('unavailable'));await flush();assert.equal(a.state.Error,null);assert.equal(a.state.Rows.length,1);
const b=run();b.pending.summary.resolve({total:42});await flush();assert.equal(b.state.Loading,true);b.pending.list.reject(new Error('offline'));await flush();assert.match(b.state.Error,/could not load/);assert.equal(b.state.Loading,false);
const c=run();c.cleanup();c.pending.list.resolve({rows:[{id:9}],total:1});c.pending.summary.resolve({total:1});await flush();assert.deepEqual(c.state.Rows,[]);assert.equal(c.state.Summary,null);
console.log('PASS: list does not wait for summary; failures isolated; stale responses ignored');
