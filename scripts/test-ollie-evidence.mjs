import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import ts from 'typescript';
const temp=new URL('../.evidence-test.mjs',import.meta.url);
let source=await readFile(new URL('../components/OllieEvidence.tsx',import.meta.url),'utf8');
source=source.replace('import OllieDecision from "./OllieDecision";', 'const OllieDecision=()=>null;');
source=source.replace('import Link from "next/link";','const Link = "a";').replace('import { api, type ForSaleRow } from "../lib/api";','type ForSaleRow = any; const api = async <T,>(url: string): Promise<T> => { throw new Error("Unexpected request"); };');
await writeFile(temp,ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText);
try {
 const {propertyIds,priceComparison}=await import(temp.href);
 assert.deepEqual(propertyIds('[A](/property/12) [B](/property/12) [external](https://evil.test/property/34) [bad](/property/-1) [zero](/property/0)'),[12]);
 assert.deepEqual(propertyIds('No records.'),[]);
 assert.equal(propertyIds([1,2,3,4,5].map(n=>`[P](/property/${n})`).join(' ')).length,4);
 const p=priceComparison(2100000,2965000);
 assert.equal(p.gap,865000);assert.equal(p.uplift.toFixed(1),'41.2');assert.equal(p.discount.toFixed(1),'29.2');
 assert.equal(priceComparison(120,100).discount,-20);
 for (const n of [null,0,-1,NaN,Infinity]) assert.equal(priceComparison(n,100),null);
 console.log('PASS: bounded internal property references, deduplication, absent evidence, exact comparison denominators and invalid/missing prices.');
}finally{await unlink(temp);}
