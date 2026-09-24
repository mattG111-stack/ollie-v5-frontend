import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const temp=new URL('../.evidence-recovery-test.mjs',import.meta.url);
let source=await readFile(new URL('../components/OllieEvidence.tsx',import.meta.url),'utf8');
source=source.replace(/import[\s\S]*?from ["'][^"']+["'];/g,'');
source=`import React from 'react';
let fixture=[],cursor=0;
export function configure(values){fixture=values;cursor=0;}
const useState=v=>{const i=cursor++;return [i in fixture?fixture[i]:v,()=>{}];};
const useEffect=()=>{};const Link='a';
const api=()=>{throw Error('Unexpected request in render');};
`+source;
await writeFile(temp,ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText);
try {
  const {default:Evidence,configure}=await import(temp.href);
  const answer='[One](/property/1) [Two](/property/2)';
  const render=values=>{configure(values);return renderToStaticMarkup(React.createElement(Evidence,{answer}));};
  const failed=render([[{id:1},{id:2}],false,'01:30',0]);
  assert.match(failed,/0 of 2 linked records loaded/);
  assert.match(failed,/Retry property evidence/);
  assert.doesNotMatch(failed,/Loaded directly/);
  const property={address:'Synthetic Road',asking_price:600000,fair_value:700000};
  const partial=render([[{id:1,property},{id:2}],false,'01:30',0]);
  assert.match(partial,/1 of 2 linked records loaded/);
  assert.match(partial,/Retry property evidence/);
  assert.match(partial,/Property 2 could not be checked/);
  const success=render([[{id:1,property},{id:2,property}],false,'01:30',0]);
  assert.match(success,/2 of 2 linked records loaded/);
  assert.doesNotMatch(success,/Retry property evidence/);
  const loading=render([[],true,'',0]);
  assert.match(loading,/Loading property evidence/);
  assert.doesNotMatch(loading,/records loaded|Retry property evidence/);
  console.log('PASS: loading, total failure, partial evidence and successful checks report accurate status and expose retry only for failures.');
} finally {await unlink(temp);}
