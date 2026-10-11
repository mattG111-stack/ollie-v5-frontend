import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const file=new URL('../.staged-pagination-test.mjs',import.meta.url);
let source=await readFile(new URL('../components/StagedReviewGrid.tsx',import.meta.url),'utf8');
source=source.replace(/^import .*;$/gm,'');
source=`let fixture=[],cursor=0;
export function configure(values){fixture=values;cursor=0;}
const useState=v=>{const i=cursor++;return [i in fixture?fixture[i]:v,()=>{}];};
const useEffect=()=>{};const useMemo=f=>f();
const api=()=>{throw Error('Unexpected request');};
const fmtArea=String,fmtDayDate=String,fmtMoney=String,fmtNumber=String,fmtPct=String;
`+source;
await writeFile(file,ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText);
try{
 const {default:Grid,configure}=await import(file.href);
 const rows=Array.from({length:125},(_,i)=>({id:i+1,address:`Synthetic ${i+1}`,margin_dollars:i+1}));
 const render=page=>{configure(['all','margin_dollars',-1,{rows,counts:{},batch_id:1},false,0,page,null,null]);return renderToStaticMarkup(React.createElement(Grid));};
 const first=render(0),last=render(2);
 assert.equal((first.match(/>Enrich<\/button>/g)||[]).length,50);
 assert.match(first,/Synthetic 125/);assert.doesNotMatch(first,/Synthetic 75</);
 assert.match(first,/1.*50.*125.*listings/);
 assert.equal((last.match(/>Enrich<\/button>/g)||[]).length,25);
 assert.match(last,/Synthetic 1</);assert.doesNotMatch(last,/Synthetic 125/);
 assert.equal(rows.length,125);
 console.log('PASS: staged grid renders 50 sorted rows per page; final page retains remaining rows without changing source data.');
}finally{await unlink(file);}
