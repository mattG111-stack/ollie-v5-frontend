import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import ts from 'typescript';
const temp=new URL('../.import-file-test.mjs',import.meta.url);
try {
 const source=await readFile(new URL('../lib/import-file.ts',import.meta.url),'utf8');
 await writeFile(temp,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}}).outputText);
 const {prepareImportFile}=await import(temp.href);
 const small=new File(['address,price\n1 Road,900000'],'sales.csv');
 assert.equal(await prepareImportFile(small),small);
 const text='address,price\n'+('"12 Road, Auckland",900000\n'.repeat(210000));
 const large=new File([text],'listings.csv',{lastModified:1234});
 const gz=await prepareImportFile(large);
 assert.equal(gz.name,'listings.csv.gz');assert.equal(gz.lastModified,1234);
 assert.equal(gunzipSync(Buffer.from(await gz.arrayBuffer())).toString(),text);
 assert.ok(gz.size<large.size/4);
 assert.equal(await prepareImportFile(gz),gz);
 const unavailable=globalThis.CompressionStream;globalThis.CompressionStream=undefined;
 try {await assert.rejects(prepareImportFile(large),/csv.gz/);}finally{globalThis.CompressionStream=unavailable;}
 console.log('PASS: large CSV round-trip is lossless;small/precompressed files untouched;unavailable compression fails clearly.');
}finally{await unlink(temp).catch(()=>{});}
