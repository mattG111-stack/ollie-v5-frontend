import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const temp=new URL('../.conversation-test.mjs',import.meta.url);
let source=await readFile(new URL('../app/ask/page.tsx',import.meta.url),'utf8');
source=source.replace(/import[\s\S]*?from ["'][^"']+["'];/g,'');
const historySource=(await readFile(new URL('../lib/ollie-history.ts',import.meta.url),'utf8')).replace(/export /g,'');
source=`import React from 'react';
${historySource}
const useAuth=()=>({me:{id:101}});
let fixture=[]; let slot=0;
export function configure(values){fixture=values;slot=0;}
const useState=(value)=>[slot in fixture?fixture[slot++]: (slot++,value),()=>{}];
const useEffect=()=>{}; const useRef=(value)=>({current:value});
const useT=()=>({t:(key)=>key}); const D={}; const C={};
const Link='a'; const AppShell=({children})=>children;
const AssistantAnswer=({content})=>React.createElement('p',null,content);
const OllieActions=()=>null; const OllieEvidence=()=>null; const OllieHunt=()=>null; const OllieOrb=()=>null;
const api=()=>{throw Error('Unexpected network call during render');};
`+source.replace('function Inner()','export function Inner()');
await writeFile(temp,ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText);
try{
 const {Inner,configure}=await import(temp.href);
 const turns=[{role:'user',content:'FIRST_QUESTION'},{role:'assistant',content:'FIRST_ANSWER'},{role:'user',content:'FOLLOWUP_QUESTION'},{role:'assistant',content:'FOLLOWUP_ANSWER'}];
 for(const width of [390,1280]){
 configure([turns,'','',false,null,false,'',{configured:true},{shared:true,configured:true,remaining:7,limit:20},'idle',null,null,false,width]);
 const html=renderToStaticMarkup(React.createElement(Inner));
 const form=html.indexOf('aria-label="Ask a follow-up"');
 assert.ok(html.includes('FOLLOWUP_ANSWER'));
 assert.ok(form>html.indexOf('FOLLOWUP_ANSWER'));
 assert.ok(html.indexOf('FIRST_ANSWER')<html.indexOf('FOLLOWUP_QUESTION'));
 assert.ok(html.indexOf('FIRST_QUESTION')<html.indexOf('FOLLOWUP_QUESTION'));
 assert.equal((html.match(/data-testid="ollie-ask"/g)||[]).length,1);
 assert.match(html,/Ask a follow-up about this answer/);
 }
 configure([[],'','',false,null,false,'',{configured:true},{remaining:7},'idle',null,null,false,390]);
 assert.match(renderToStaticMarkup(React.createElement(Inner)),/aria-label="Ask Ollie"/);
 const render=(messages,notice='')=>{
   configure([messages,'',notice,false,null,false,'',{configured:true},{remaining:7},'idle',null,null,false,390]);
   return renderToStaticMarkup(React.createElement(Inner));
 };
 assert.doesNotMatch(render(turns),/role="status"/);
 const missing=render(turns,'Original filters are missing');
 assert.match(missing,/role="status"/);
 assert.ok(missing.indexOf('Original filters are missing')>missing.indexOf('FOLLOWUP_ANSWER'));
 assert.ok(missing.indexOf('Original filters are missing')<missing.indexOf('aria-label="Ask a follow-up"'));
 assert.match(render(Array.from({length:22},(_,i)=>({role:i%2?'assistant':'user',content:String(i)}))),/Ollie uses the latest 20 messages/);
 assert.doesNotMatch(render(Array.from({length:20},(_,i)=>({role:i%2?'assistant':'user',content:String(i)}))),/Ollie uses the latest 20 messages/);
 console.log('PASS: context notices appear below answers before the composer only for missing or truncated history.');
 console.log('PASS: one composer below the latest exchange on mobile and desktop; chronological questions; initial composer retained.');
}finally{await unlink(temp);}
