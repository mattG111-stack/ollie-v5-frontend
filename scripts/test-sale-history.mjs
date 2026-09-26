import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const path=new URL('../app/property/[id]/page.tsx',import.meta.url);
const source=ts.createSourceFile('page.tsx',await readFile(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const fn=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='parseSaleHistory');
assert.ok(fn,'Property page must use its sale-history parser');
const js=ts.transpileModule(fn.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
const parse=vm.runInNewContext(js+';parseSaleHistory');
const result=parse(JSON.stringify([
  {saleDate:'2022-03-01',salePrice:850000},
  {date:'2017-01-01',price:650000},
  {saleDate:'2025-01-01',salePrice:null},
  {saleDate:'2025-02-01',salePrice:'Infinity'},
  {sold_date:'2010-02-01',sale_price:400000}
]));
assert.equal(JSON.stringify(result),JSON.stringify([
  {date:'2022-03-01',price:850000,method:''},
  {date:'2017-01-01',price:650000,method:''},
  {date:'2010-02-01',price:400000,method:''}
]));
assert.equal(parse('not JSON').length,0);
console.log('Sale timeline: normalized and legacy dates/prices render; undisclosed and invalid values excluded.');
