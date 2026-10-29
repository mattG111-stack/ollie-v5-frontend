import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const options={compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}};
const files=[];
async function load(name) {
  const file=new URL(`../.asking-history-${files.length}.mjs`,import.meta.url);
  files.push(file);
  const source=await readFile(new URL(`../components/${name}.tsx`,import.meta.url),'utf8');
  await writeFile(file,ts.transpileModule(source,options).outputText);
  return (await import(file.href)).default;
}
try {
  const Badge=await load('PriceChangeBadge'),History=await load('AskingPriceHistory');
  const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));
  const base={previous_price:1000000,current_price:950000,change_dollars:-50000,change_pct:-5,recorded_at:'2026-10-28T14:00:00Z'};
  assert.match(render(Badge,{change:base}),/Price reduced.*\$50,000 \(5.0%\)/);
  assert.match(render(Badge,{change:base}),/29 Oct 2026/);
  assert.match(render(Badge,{change:{...base,current_price:1050000,change_dollars:50000,change_pct:5}}),/Price increased/);
  for(const change of [null,{...base,change_dollars:0},{...base,current_price:NaN},{...base,change_pct:20},{...base,recorded_at:'invalid'}])
    assert.equal(render(Badge,{change}),'');
  const history={asking_observations:[
    {recorded_at:'2026-10-01T00:00:00Z',recorded_date:'2026-10-01',asking_price:1000000},
    {recorded_at:'2026-10-08T00:00:00Z',recorded_date:'2026-10-08',asking_price:950000},
    {recorded_at:'2026-10-15T00:00:00Z',recorded_date:'2026-10-15',asking_price:950000},
  ]};
  const html=render(History,{history});
  assert.match(html,/−\$50,000 \(-5.0%\)/);assert.match(html,/Unchanged/);
  assert.match(html,/not the exact date the seller changed it/);
  assert.match(render(History,{history:{asking_observations:history.asking_observations.slice(0,1)}}),/no change can be calculated yet/);
  assert.match(render(History,{history:{points:[{asking_price:500000}]}}),/No recorded asking-price history/);
  assert.match(render(History,{history:{asking_observations:[...history.asking_observations,{recorded_at:'2026-10-22',asking_price:100000}]}}),/Large difference — needs review/);
  assert.doesNotMatch(render(History,{history:{asking_observations:[...history.asking_observations,{recorded_at:'2026-10-22',asking_price:100000}]}}),/Total recorded movement/);
  for(const name of ['DealFinder','PropertiesTable'])
    assert.match(await readFile(new URL(`../components/${name}.tsx`,import.meta.url),'utf8'),/PriceChangeBadge change=/);
  console.log('PASS: retained asking observations, reductions/increases, NZ dates, repeated unchanged prices, invalid/inconsistent suppression, outlier warning and listing badges.');
} finally {await Promise.all(files.map(file=>unlink(file)));}
