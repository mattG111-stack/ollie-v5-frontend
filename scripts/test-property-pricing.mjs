import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const page=await readFile(new URL('../app/property/[id]/page.tsx',import.meta.url),'utf8');
const start=page.lastIndexOf('<Row',page.indexOf('label={t("prop.buyPriceRow")}'));
const end=page.indexOf('</div>',start);
const format=await readFile(new URL('../lib/format.ts',import.meta.url),'utf8');
const tmp=new URL('../.property-pricing-test.mjs',import.meta.url);
const fmt=new URL('../.property-format-test.mjs',import.meta.url);
const opts={compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}};
await writeFile(fmt,ts.transpileModule(format,opts).outputText);
await writeFile(tmp,ts.transpileModule(`import React from 'react';
import {fmtMoneyExact as fmtMoney,fmtMoneyShort} from './.property-format-test.mjs';
const t=k=>k; const conf=x=>x;
const Row=({label,value})=><div>{label}: {value}</div>;
export default function Pricing({p}) {return <>${page.slice(start,end)}</>}`,opts).outputText);
try {
 const {askingText}=await import(fmt.href);
 assert.equal(askingText(629500,'fixed',k=>k,false,true),'$629,500');
 assert.equal(askingText(629500,'guide',(_k,v)=>`Enquiries over ${v.v}`,false,true),'Enquiries over $629,500');
 const {default:Pricing}=await import(tmp.href);
 const base={buy_price:594000,fair_value:651000,range_low:625000,range_high:677000};
 const render=p=>renderToStaticMarkup(React.createElement(Pricing,{p:{...base,...p}}));
 assert.match(render({}),/prop.ourValuationRow — prop.likelyRange: \$625,000–\$677,000/);
 assert.match(render({}),/\+\$57,000 \(\+9.6%\)/);
 assert.match(render({fair_value:723162,buy_price:597550}),/prop.ourValuationRow: \$723,162/);
 assert.match(render({fair_value:723162,buy_price:597550}),/prop.buyPriceRow: \$597,550/);
 assert.match(render({fair_value:723162,buy_price:597550}),/\+\$125,612/);
 assert.match(render({fair_value:594000}),/prop.marginVsBuy: \$0 \(0.0%\)/);
 assert.match(render({fair_value:580000}),/−\$14,000 \(-2.4%\)/);
 assert.match(render({buy_price:0}),/prop.marginVsBuy: —/);
 for(const p of [{is_premium:true},{range_low:null},{range_high:Infinity},{range_low:700000},{fair_value:null}])
   assert.doesNotMatch(render(p),/prop.likelyRange/);
 console.log('Property pricing: valuation range, exact gap, positive/negative/zero and missing/invalid range checks passed.');
} finally {await unlink(tmp);await unlink(fmt);}
