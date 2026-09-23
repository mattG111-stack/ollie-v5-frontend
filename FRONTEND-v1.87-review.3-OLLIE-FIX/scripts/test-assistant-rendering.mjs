import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const compiled = new URL('../.assistant-render-test.mjs', import.meta.url);
const source = await readFile(new URL('../components/AssistantAnswer.tsx', import.meta.url), 'utf8');
await writeFile(compiled, ts.transpileModule(source, { compilerOptions: {
  jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020,
}}).outputText);
try {
  const { default: Answer } = await import(compiled.href);
  const render = content => renderToStaticMarkup(React.createElement(Answer, {content}));
  const html = render('### Two choices\n\n**Verified figures**\n\n| Property | Ask |\n| --- | --- |\n| [57 Chislehurst Street](/property/271846) | $749k |\n\n- Keep the budget\n- Check the details\n\n[Source](https://example.com/property)');
  assert.match(html, /<h3>Two choices<\/h3>/);
  assert.match(html, /<strong>Verified figures<\/strong>/);
  assert.match(html, /<table>/);
  assert.match(html, /href="\/property\/271846"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /<ul>/);
  const unsafe = render('[bad](javascript:alert%281%29)\n\n<script>alert(1)</script>\n\n![tracking](https://example.com/pixel)\n\n[protocol](//example.com)');
  assert.doesNotMatch(unsafe, /href=|<script|<img/);
  const userHtml = render('Ordinary text & <b>raw HTML</b>');
  assert.doesNotMatch(userHtml, /<b>/);
  assert.match(userHtml, /&amp;/);
  console.log('PASS: headings, emphasis, tables, lists, internal/external links, unsafe URLs, HTML and remote images');
  if (process.env.ASSISTANT_PREVIEW) {
    const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
    await writeFile(process.env.ASSISTANT_PREVIEW, `<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\nbody{background:#16191f;color:#eee;font-family:Arial;padding:24px}.assistant-answer{max-width:700px;margin:auto}</style>${html}</html>`);
  }
} finally { await unlink(compiled); }
