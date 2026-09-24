import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const tmp=new URL('../.ollie-decision-test.mjs',import.meta.url);
const src=await readFile(new URL('../components/OllieDecision.tsx',import.meta.url),'utf8');
await writeFile(tmp,ts.transpileModule(src,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText);
try {
 const {default:Decision,decisionFacts,investigationQuestion}=await import(tmp.href);
 const rows=[
  {id:1,property:{address:'1 Synthetic Road',asking_price:569000,fair_value:607456,land_area_m2:79,floor_area_m2:111,comps_used:16}},
  {id:2,property:{address:'2 Synthetic Road',asking_price:625000,fair_value:650845,land_area_m2:79,floor_area_m2:87,comps_used:16}},
  {id:3,property:{address:'3 Synthetic Road',asking_price:629000,fair_value:723162,land_area_m2:450,floor_area_m2:85,comps_used:16}}
 ];
 const facts=decisionFacts(rows);
 assert.deepEqual(facts[0].badges,['lowest asking price']);
 assert.deepEqual(facts[1].badges,[]);
 assert.deepEqual(facts[2].badges,['most land','largest estimated discount']);
 assert.match(facts[2].checks[0],/16 valuation comparables/);
 assert.ok(decisionFacts([...rows,{id:4}]).every(r=>!r.badges.length));
 assert.ok(decisionFacts([rows[0],{...rows[1],property:{...rows[1].property,address:' 1 SYNTHETIC ROAD '}}]).every(r=>!r.badges.length));
 assert.ok(decisionFacts([rows[0],{...rows[1],property:{...rows[1].property,off_market:true}}]).every(r=>!r.badges.length));
 const tied=decisionFacts([rows[0],{...rows[1],property:{...rows[1].property,asking_price:569000}}]);
 assert.ok(tied.every(r=>r.badges.includes('Joint lowest asking price')));
 const invalid=decisionFacts([{id:1,property:{address:'Unknown',asking_price:NaN,fair_value:Infinity,land_area_m2:0}}]);
 assert.equal(invalid[0].badges.length,0);assert.equal(invalid[0].checks.length,4);
 assert.ok(decisionFacts([{id:1,property:{...rows[0].property,asking_price:800000}},{id:2,property:{...rows[1].property,asking_price:900000}}]).every(r=>!r.badges.includes('largest estimated discount')));
 const answer='[One](/property/1) [Two](/property/2) [Three](/property/3)';
 const calls=[];
 const tree=Decision({rows,answer,onAsk:(...args)=>calls.push(args)});
 const html=renderToStaticMarkup(tree);
 assert.equal(calls.length,0);
 assert.match(html,/\$723,162/);assert.match(html,/450 m²/);assert.match(html,/same zero baseline/);
 assert.equal((html.match(/Investigate this property/g)||[]).length,3);
 const buttons=[];
 function walk(n){if(Array.isArray(n))return n.forEach(walk);if(!n||typeof n!=='object')return;if(n.type==='button')buttons.push(n);walk(n.props?.children);}
 walk(tree);buttons[2].props.onClick();
 assert.equal(calls.length,1);assert.match(calls[0][0],/only Apex property ID 3/);assert.match(calls[0][0],/IDs 1, 2, 3/);assert.match(calls[0][0],/Keep my existing area, budget/);assert.match(calls[0][0],/do not introduce other properties/);
 assert.equal(calls[0][1],'Investigate 3 Synthetic Road');
 const disabled=renderToStaticMarkup(React.createElement(Decision,{rows,answer,onAsk:()=>{},disabled:true}));
 assert.equal((disabled.match(/disabled=""/g)||[]).length,3);
 const hostile=renderToStaticMarkup(React.createElement(Decision,{rows:[{id:1,property:{...rows[0].property,address:'<img src=x onerror=alert(1)>'}}],answer}));
 assert.doesNotMatch(hostile,/<img/);
 assert.equal(renderToStaticMarkup(React.createElement(Decision,{rows:[{id:1}],answer})), '');
 console.log('PASS: factual shortlist highlights, ties, partial/missing/duplicate/off-market suppression, exact amounts, safe rendering, scoped investigation actions and disabled controls.');
} finally {await unlink(tmp);}
