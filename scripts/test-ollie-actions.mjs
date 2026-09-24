import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const temp = new URL('../.ollie-actions-test.mjs', import.meta.url);
await writeFile(temp, ts.transpileModule(await readFile(new URL('../components/OllieActions.tsx', import.meta.url), 'utf8'), {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText);
try {
 const {default: Actions, searchBrief, followUps, starters} = await import(temp.href);
 const prefs={state:'current',goals:['underpriced'],suburbs:['Glen Eden'],districts:['Waitakere City'],min_price:500000,max_price:800000,min_beds:3};
 const q=starters(prefs)[0].question;
 for(const expected of ['Glen Eden','Waitakere City','500000','800000','minimum_bedrooms":3']) assert.ok(q.includes(expected));
 assert.match(searchBrief(null), /Ask me for my budget/);
 assert.match(searchBrief({...prefs,state:'due'}), /Confirm these preferences/);
 const f=followUps('[A](/property/12) [B](/property/34) [Again](/property/12)');
 assert.ok(f.every(a=>a.question.includes('IDs 12, 34')));
 assert.equal(f.filter(a=>a.title==='Compare these properties').length,1);
 assert.ok(!followUps('[A](/property/12)').some(a=>a.title==='Compare these properties'));
 assert.ok(!followUps('No matching properties').some(a=>a.title==='Compare these properties'));
 let submitted=false;
 const html=renderToStaticMarkup(React.createElement(Actions,{prefs,disabled:true,onAsk:()=>{submitted=true}}));
 assert.equal(submitted,false);
 assert.equal((html.match(/disabled=""/g)||[]).length,3);
 assert.match(html,/normal allowance/);
 console.log('PASS: saved filters, missing/due preferences, exact property follow-ups, duplicate links, empty results, disabled controls and no automatic submission.');
} finally {await unlink(temp);}
