const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('lib/api.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const calls = [];
const failure = new Error('request cancelled');
const context = { exports: {}, require: () => ({ APP_VERSION: 'test' }),
  Headers, FormData, URLSearchParams, AbortController,
  fetch: async (url) => { calls.push(url); throw failure; } };
vm.runInNewContext(source, context);
(async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(context.exports.api('/api/test', { signal: controller.signal }), e => e === failure);
  assert.equal(context.exports.recentApiFailures().length, 0);
  assert.deepEqual(calls, ['/api/test']);
  await assert.rejects(context.exports.api('/api/test'), e => e.status === 0);
  assert.equal(context.exports.recentApiFailures().length, 1);
  assert.equal(calls.at(-1), '/api/bugs/client');
  console.log('PASS: cancellation is silent; real network failures remain reported');
})().catch(e => { console.error(e); process.exitCode = 1; });
