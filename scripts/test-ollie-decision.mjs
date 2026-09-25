import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const tmp=new URL('../.ollie-decision-test.mjs',import.meta.url);
let src=await readFile(new URL('../components/OllieDecision.tsx',import.meta.url),'utf8');
const insightTmp=new URL('../.ollie-insights-test.mjs',import.meta.url);
await writeFile(insightTmp,ts.transpileModule(await readFile(new URL('../lib/ollie-insights.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText);
src=src.replace('../lib/ollie-insights','./.ollie-insights-test.mjs');
await writeFile(tmp,ts.transpileModule(src,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText);
try {
 const {default:Decision,decisionFacts,investigationQuestion,comparisonTakeaway}=await import(tmp.href);
 const {buildPropertyInsights}=await import(insightTmp.href);
 const rows=[
  {id:1,property:{address:'1 Synthetic Road',asking_price:569000,fair_value:607456,land_area_m2:79,floor_area_m2:111,comps_used:16}},
  {id:2,property:{address:'2 Synthetic Road',asking_price:625000,fair_value:650845,land_area_m2:79,floor_area_m2:87,comps_used:16}},
  {id:3,property:{address:'3 Synthetic Road',asking_price:629000,fair_value:723162,land_area_m2:450,floor_area_m2:85,comps_used:16}}
 ];
 assert.equal(comparisonTakeaway(rows),'3 Synthetic Road has 371 m² more recorded land and an asking price $60,000 higher than 1 Synthetic Road.');
 assert.equal(comparisonTakeaway([...rows,{id:4}]),null);
 for (const patch of [{asking_price:null},{land_area_m2:null},{off_market:true},{address:'1 Synthetic Road'},{asking_price:569000},{land_area_m2:450}]) {
  assert.equal(comparisonTakeaway([rows[0],{...rows[1],property:{...rows[1].property,...patch}},rows[2]]),null);
 }
 assert.equal(comparisonTakeaway([{...rows[0],property:{...rows[0].property,land_area_m2:500}},rows[2]]),null);
 assert.equal(comparisonTakeaway([rows[0]]),null);
 const insight=buildPropertyInsights(rows)[0];
 assert.equal(insight.schemaVersion,1);assert.equal(insight.kind,'land_price_tradeoff');
 assert.deepEqual(insight.scope.propertyIds,[1,2,3]);
 assert.deepEqual(insight.metrics.map(m=>m.value),[60000,371]);
 assert.equal(insight.evidence.length,4);assert.equal(insight.nextAction.href,'/property/3');
 assert.equal(buildPropertyInsights([rows[0],{...rows[2],id:1}]).length,0);
 const single=buildPropertyInsights([rows[2]])[0];
 assert.equal(single.kind,'asking_estimate_gap');assert.equal(single.metrics[0].value,94162);
 assert.equal(single.evidence[1].basis,'model-estimate');
 assert.equal(buildPropertyInsights([{...rows[2],property:{...rows[2].property,fair_value:null}}]).length,0);
 assert.equal(buildPropertyInsights([{...rows[2],property:{...rows[2].property,fair_value:600000}}])[0].metrics[0].value,-29000);
 assert.equal(buildPropertyInsights([{...rows[2],property:{...rows[2].property,fair_value:629000}}])[0].metrics[0].value,0);
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
 assert.match(html,/Shortlist trade-off/);assert.match(html,/\$60,000 higher/);
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
} finally {await unlink(tmp);await unlink(insightTmp);}
