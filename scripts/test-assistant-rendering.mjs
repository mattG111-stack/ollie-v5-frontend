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
  const { default: Answer, parseChart } = await import(compiled.href);
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
  const chart = {type:'bar',title:'Asking prices',source:'Visible Glen Eden houses; 3+ beds; under $800,000',unit:'NZD',data:[{label:'49 Albionvale Road',value:569000},{label:'6 Jabuka Street',value:625000}]};
  const graph = render('```apex-chart\n'+JSON.stringify(chart)+'\n```');
  assert.match(graph, /<figure/);
  assert.match(graph, /<svg/);
  assert.match(graph, /View chart data \(2 points\)/);
  assert.match(graph, /\$569,000/);
  assert.doesNotMatch(graph, /language-apex-chart|&quot;type&quot;/);
  const fractional=render('```apex-chart\n'+JSON.stringify({...chart,data:[{label:'Recorded amount',value:569000.75}]})+'\n```');
  assert.match(fractional, /Recorded amount: \$569,000\.75/);
  assert.match(fractional, /<td>\$569,000\.75<\/td>/);
  const precise=render('```apex-chart\n'+JSON.stringify({...chart,unit:'percent',data:[{label:'Observed change',value:-0.00456789}]})+'\n```');
  assert.match(precise, /<td>-0\.00456789%<\/td>/);
  assert.match(render('```apex-chart\n{broken}\n```'), /could not be displayed/);
  for (const bad of [
    {...chart,type:'script'}, {...chart,unit:'usd'}, {...chart,data:[]},
    {...chart,data:[{label:'A',value:'125'}]}, {...chart,data:[{label:'A',value:1e100}]},
    {...chart,data:[{label:'A',value:null}]}, {...chart,data:[{label:'A',value:1},{label:'A',value:2}]},
    {...chart,data:Array.from({length:25},(_,i)=>({label:String(i),value:i}))},
  ]) assert.equal(parseChart(JSON.stringify(bad)),null);
  const line={...chart,title:'Value uplift over asking',source:'Synthetic test data — checks missing months and negative values',type:'line',unit:'percent',data:[{label:'2026-01',value:0},{label:'2026-02',value:null},{label:'2026-04',value:-15}]};
  assert.ok(parseChart(JSON.stringify(line)));
  const lineHtml=render('```apex-chart\n'+JSON.stringify(line)+'\n```');
  assert.match(lineHtml, /-15%/);
  assert.match(lineHtml, /No data/);
  assert.equal((lineHtml.match(/<circle /g)||[]).length,2);
  // Three horizontal grid lines, but no line across the missing observation.
  assert.equal((lineHtml.match(/<line /g)||[]).length,3);
  for(const labels of [['2026-02-30','2026-03-01'],['2026-04','2026-01'],['Jan','Feb']])
    assert.equal(parseChart(JSON.stringify({...line,data:labels.map(label=>({label,value:1}))})),null);
  const hostile = render('```apex-chart\n'+JSON.stringify({...chart,title:'<script>alert(1)</script>'})+'\n```');
  assert.doesNotMatch(hostile, /<script|<img/);
  assert.match(hostile, /&lt;script&gt;/);
  const zero=render('```apex-chart\n'+JSON.stringify({...chart,data:[{label:'A',value:0}]})+'\n```');
  assert.doesNotMatch(zero,/NaN|Infinity/);
  console.log('PASS: inline charts, numeric validation, null gaps, date ordering, zero/negative values, accessible data tables and escaped chart text');
  console.log('PASS: headings, emphasis, tables, lists, internal/external links, unsafe URLs, HTML and remote images');
  if (process.env.ASSISTANT_PREVIEW) {
    const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
    await writeFile(process.env.ASSISTANT_PREVIEW, `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\nbody{background:#16191f;color:#eee;font-family:Arial;padding:24px}.assistant-answer{max-width:700px;margin:auto}svg{font-family:Arial}</style>${graph}${lineHtml}${html}</html>`);
  }
} finally { await unlink(compiled); }
