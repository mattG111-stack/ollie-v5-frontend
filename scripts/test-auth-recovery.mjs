import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import ts from 'typescript';
const temp = new URL('../.auth-recovery-test.mjs', import.meta.url);
let source = await readFile(new URL('../lib/auth.tsx', import.meta.url), 'utf8');
source = source.replace(/import[\s\S]*?from ["'][^"']+["'];/g, '');
source = `import React from 'react';
let states=[], cursor=0, token='existing-token', handler, calls=[];
const createContext=()=>({Provider:()=>null});
const useState=(initial)=>{const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=v];};
const useEffect=()=>{};const useCallback=(f)=>f;const useContext=()=>null;
const useRouter=()=>({push:p=>calls.push(p)});
const api=(...args)=>handler(...args);
const getToken=()=>token;const setToken=v=>token=v;const setRole=()=>{};
export function setup(fn,initial='existing-token'){states=[];cursor=0;token=initial;handler=fn;calls=[];}
export function state(){return {token,calls};}
export function context(){cursor=0;return AuthProvider({children:null}).props.value;}
` + source;
await writeFile(temp, ts.transpileModule(source, {compilerOptions: {jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText);
try {
  const {setup,state,context}=await import(temp.href);
  for(const status of [0,500,502,503,403]) {
    setup(async()=>{throw {status};});
    assert.equal(await context().refresh(),null);
    assert.equal(state().token,'existing-token');
    assert.equal(context().me,null); // Do not expose protected content on failure.
    assert.equal(context().loading,false);
    assert.match(context().error,/retry/);
  }
  setup(async()=>{throw {status:401};});
  await context().refresh();
  assert.equal(state().token,null);
  assert.equal(context().me,null);
  assert.equal(context().error,null); // Ordinary unauthenticated route handles 401.
  let count=0;
  const user={id:1,role:'admin',has_access:true};
  setup(async(path,init,opts)=>{
    assert.equal(opts.background,true);
    if(count++===0)throw {status:503};
    return user;
  });
  await context().refresh();
  assert.equal(await context().refresh(),user);
  assert.equal(context().error,null);
  assert.equal(state().token,'existing-token');
  setup(async()=>{throw Error('Should not request profile without a token');},null);
  await context().refresh();
  assert.equal(context().error,null);
  setup(async(path)=>{
    if(path.endsWith('/sign-in'))return {access_token:'new-token'};
    throw {status:503};
  });
  await assert.rejects(context().signIn('synthetic@example.test','synthetic'),/could not finish/);
  assert.equal(state().token,'new-token');
  context().signOut();
  assert.equal(state().token,null);
  assert.deepEqual(state().calls,['/sign-in']);
  assert.equal(context().error,null);
  // An older profile request must not clear a newly authenticated session.
  let rejectOld;
  setup(path=>{
    if(path.endsWith('/sign-in'))return Promise.resolve({access_token:'new-token'});
    if(state().token==='existing-token')return new Promise((resolve,reject)=>{rejectOld=reject;});
    return Promise.resolve(user);
  });
  const oldRefresh=context().refresh();
  assert.equal(await context().signIn('synthetic@example.test','synthetic'),user);
  rejectOld({status:401});
  await oldRefresh;
  assert.equal(state().token,'new-token');
  assert.equal(context().me,user);
  assert.equal(context().error,null);
  // Nor may an older successful response restore a user after sign-out.
  let resolveOld;
  setup(()=>new Promise(resolve=>{resolveOld=resolve;}));
  const oldSuccess=context().refresh();
  context().signOut();
  resolveOld(user);
  await oldSuccess;
  assert.equal(state().token,null);
  assert.equal(context().me,null);
  console.log('PASS: outages preserve credentials without authenticating, 401 clears them, retry recovers, failed profile checks do not complete sign-in, explicit sign-out clears state.');
} finally {await unlink(temp);}

const shellTemp = new URL('../.auth-shell-test.mjs', import.meta.url);
let shell = await readFile(new URL('../components/AppShell.tsx', import.meta.url), 'utf8');
shell = shell.replace(/import[\s\S]*?from ["'][^"']+["'];/g, '');
shell = `import React from 'react';
let auth, effects=[], paths=[];
export function configure(value){auth=value;effects=[];paths=[];}
export function runEffects(){effects.forEach(f=>f());return paths;}
const useAuth=()=>auth;const useT=()=>({t:k=>k});
const useRouter=()=>({replace:p=>paths.push(p)});const usePathname=()=>'/ask';
const useState=v=>[v,()=>{}];const useRef=v=>({current:v});
const useEffect=f=>effects.push(f);const usePageTracking=()=>{};
const window={matchMedia:()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}})};
const C={};const MONO='';
` + shell;
await writeFile(shellTemp, ts.transpileModule(shell,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText);
try {
  const React = (await import('react')).default;
  const {renderToStaticMarkup}=await import('react-dom/server');
  const {default:Shell,configure,runEffects}=await import(shellTemp.href);
  configure({me:null,loading:false,error:'Retry account check',refresh:()=>{},signOut:()=>{}});
  const html=renderToStaticMarkup(React.createElement(Shell,null,'PROTECTED_CONTENT'));
  assert.match(html,/Connection interrupted/);
  assert.match(html,/Try again/);
  assert.ok(!html.includes('PROTECTED_CONTENT'));
  assert.deepEqual(runEffects(),[]);
  configure({me:null,loading:false,error:null,refresh:()=>{},signOut:()=>{}});
  renderToStaticMarkup(React.createElement(Shell,null,'PROTECTED_CONTENT'));
  assert.deepEqual(runEffects(),['/sign-in']);
  console.log('PASS: outage screen hides protected content and offers retry without redirect; unauthenticated users still redirect.');
} finally {await unlink(shellTemp);}
