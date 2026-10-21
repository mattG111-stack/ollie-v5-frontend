import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const file=new URL('../.collection-status-test.mjs',import.meta.url);
let source=await readFile(new URL('../components/DataConnection.tsx',import.meta.url),'utf8');
source=source.replace(/^import .*;$/gm,'');
source=`let fixture=[],cursor=0;
export function configure(values){fixture=values;cursor=0;}
const useState=v=>{const i=cursor++;return [i in fixture?fixture[i]:v,()=>{}];};
const useEffect=()=>{};
const api=()=>{throw Error('Unexpected request');};
`+source;
await writeFile(file,ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText);
try {
  const {default:Connection,configure}=await import(file.href);
  const status={enabled:false,message:'Portal collection is disabled in this build.',availability_enabled:false,portal_daily_enabled:false,
    latest_runs:[{id:1,kind:'sold',status:'running',observed:49,started_at:'2026-10-04T06:09:23Z',finished_at:null,failed_sources:2}]};
  configure([null,false,status,'']);
  const html=renderToStaticMarkup(React.createElement(Connection));
  assert.match(html,/Portal collection disabled/);
  assert.match(html,/Availability checks: disabled/);
  assert.match(html,/Automatic portal pass: disabled/);
  assert.match(html,/Unfinished historical run — current progress unverified/);
  assert.doesNotMatch(html,/waiting to retry|once a day on its own/);
  configure([null,false,{...status,enabled:true,availability_enabled:true,portal_daily_enabled:true,message:'Configured'},'']);
  assert.match(renderToStaticMarkup(React.createElement(Connection)),/Portal collection enabled/);
  const listings=await readFile(new URL('../components/NewListings.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(listings,/This runs once a day on its own/);
  assert.match(listings,/disabled=\{busy \|\| !collectionEnabled\}/);
  console.log('PASS: disabled collection is explicit, historical unfinished runs do not promise retries, and manual collection is gated on effective configuration.');
} finally {await unlink(file);}
