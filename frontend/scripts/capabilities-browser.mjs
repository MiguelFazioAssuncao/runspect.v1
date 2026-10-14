import { confirmAllVisualizations } from './browser-selection.mjs';
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/capabilities-browser.mjs
import { spawn, spawnSync } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
// Mount the real application without Next's server-component debug transport.
// RUNSPECT_URL can instead point at a normally accessible Next server.
let server;
let cache;
let url = process.env.RUNSPECT_URL;
if (!url) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const entry = 'virtual:panels-browser.tsx';
  cache = await mkdtemp(join(tmpdir(), 'runspect-browser-cache-'));
  server = await createServer({
    root, configFile: false, cacheDir: cache,
    oxc: { jsx: { runtime: 'automatic' } },
    resolve: { alias: { '@': `${root}src` }, dedupe: ['react', 'react-dom'] },
    optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'd3', 'lucide-react', 'mp4-muxer', 'html-to-image'], exclude: ['next/dynamic'] },
    server: { host: '127.0.0.1', port: 0, hmr: false },
    plugins: [{
      name: 'panels-browser',
      enforce: 'pre',
      resolveId(id) {
        if (id === entry) return `\0${entry}`;
        if (id === 'next/dynamic') return '\0panels-browser-editor';
      },
      load(id) {
        // Substitute Monaco with an editable textarea; the actual workspace,
        // panel controls, player, canvas and toolbar remain mounted.
        if (id === '\0panels-browser-editor') return `import React from 'react'; export default function dynamic() { return props => React.createElement('textarea', { value: props.value ?? '', onChange: e => props.onChange?.(e.target.value), 'aria-label': 'Código da verificação', style: { width: '100%', height: '100%', background: '#0f172a', color: '#cbd5e1', resize: 'none' } }); }`;
        if (id === `\0${entry}`) return `
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import Home from '/src/app/page.tsx';
          import '/src/app/globals.css';
          createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode, null, React.createElement(Home)));
        `;
      },
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          if (request.url !== '/') return next();
          const html = `<html style="--font-geist-sans:Arial;--font-geist-mono:monospace"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@id/${entry}"></script></body></html>`;
          response.setHeader('Content-Type', 'text/html');
          response.end(await server.transformIndexHtml('/', html));
        });
      },
    }],
  });
  await server.listen();
  const address = server.httpServer.address();
  url = `http://127.0.0.1:${address.port}`;
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
  headless: true, args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.setDefaultTimeout(30000);

const backendRoot = fileURLToPath(new URL('../../backend/', import.meta.url));
const backendCache = await mkdtemp(join(tmpdir(), 'runspect-capabilities-'));
const binary = join(backendCache, 'server');
const build = spawnSync('go', ['build', '-o', binary, './cmd/server'], { cwd: backendRoot, env: { ...process.env, GOCACHE: '/tmp/runspect-go-cache' }, encoding: 'utf8' });
assert.equal(build.status, 0, build.stderr);
const reservation = createNetServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
// Only the reviewed C++ fixtures below run outside namespace sandboxing.
const backend = spawn(binary, [], { cwd: backendRoot, env: { ...process.env, RUNSPECT_ADDR: `127.0.0.1:${port}`, RUNSPECT_SANDBOX: 'off', RUNSPECT_RATE_PER_MIN: '1000' }, stdio: ['ignore', 'pipe', 'pipe'] });
let backendLog = '';
backend.stderr.on('data', data => backendLog += data);
const endpoint = `http://127.0.0.1:${port}`;
let executions = 0;
let analyzed = [];
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
await page.route('**/healthz', route => route.fulfill({ json: { status: 'ok' } }));
await page.route('**/api/analyze', async route => {
  analyzed.push(route.request().postDataJSON().code);
  const response = await fetch(`${endpoint}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: route.request().postData() });
  try { await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() }); } catch { /* Dialog cancellation aborts requests. */ }
});
await page.route('**/api/run', async route => {
  executions++;
  const response = await fetch(`${endpoint}/api/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: route.request().postData() });
  await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
});
const picker = page.getByRole('dialog', { name: 'Escolha o que visualizar' });
async function options() {
  await page.waitForFunction(() => document.querySelector('.visualization-picker-confirm')?.disabled === false);
  return picker.locator('.visualization-picker-option strong').allTextContents();
}
async function inspect(code, expected) {
  await page.getByLabel('Código da verificação').fill(code);
  const count = executions;
  await page.getByRole('button', { name: 'Executar Algoritmo', exact: true }).click();
  await picker.waitFor();
  assert.deepEqual(await options(), expected, code);
  assert.equal(executions, count, 'Analyzing must never execute the code');
}
const vector = '#include <vector>\nusing Data=std::vector<int>; int main(){ const Data g{3,1,2}; }';
const graph = '#include <vector>\nint main(){ std::vector<std::vector<int>> roads(3); roads[0].push_back(1); }';
try {
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(`${endpoint}/healthz`)).ok) break; } catch { /* server startup */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok((await fetch(`${endpoint}/healthz`)).ok, backendLog);
  await page.goto(url);
  await inspect(vector, ['Vetores']);
  assert.equal(await picker.getByRole('checkbox').isChecked(), true, 'Remembered graph choice must adapt to a vector program');
  await picker.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await inspect(vector, ['Vetores']);
  await confirmAllVisualizations(page);
  await page.getByRole('button', { name: 'Minimizar Vetores', exact: true }).waitFor();
  assert.equal(executions, 1);
  await page.getByLabel('Código da verificação').fill(graph);
  const before = analyzed.length;
  await page.getByRole('button', { name: 'Alterar visualizações', exact: true }).click();
  assert.deepEqual(await options(), ['Vetores'], 'Existing playback uses the whole executed trace, not the edited source');
  assert.equal(analyzed.length, before);
  await picker.getByRole('button', { name: 'Cancelar', exact: true }).click();
  for (const [code, expected] of [
    [graph, ['Grafo', 'Análise do grafo', 'Legenda do grafo']],
    ['#include <array>\nusing Row=std::array<int,2>; int main(){ std::array<Row,2> table{{Row{{0,1}},Row{{1,2}}}}; }', ['Matrizes e DP']],
    ['#include <iostream>\nint main(){ std::cout << "hello"; }', ['Saída do programa']],
    ['int recur(int n){return n?recur(n-1):0;} int main(){return recur(2);}', ['Variáveis e estruturas', 'Chamadas de funções']],
    ['#include <vector>\n#include <iostream>\nvoid unused(){ std::vector<std::vector<int>> graph(2); graph[0].push_back(1); } int main(){std::cout << "hello";}', ['Saída do programa']],
    ['#include <vector>\nstruct Data{int value;}; int main(){std::vector<Data> objects;}', ['Variáveis e estruturas', 'Objetos e ponteiros']],
    ['#include <vector>\n#define DATA std::vector<int>\nint main(){DATA values{1,2};}', ['Vetores']],
  ]) {
    await inspect(code, expected);
    await picker.getByRole('button', { name: 'Cancelar', exact: true }).click();
  }
  const manual = '#include "visualizer.h"\n#include <iostream>\nnamespace display=viz; int main(){display::vector_init("values",std::vector<int>{1,2}); display::vector_step("values","first"); std::cout << "manual output";}';
  await inspect(manual, ['Vetores', 'Saída do programa']);
  await confirmAllVisualizations(page);
  await page.getByRole('button', { name: 'Minimizar Vetores', exact: true }).waitFor();
  await page.getByLabel('Posição na linha do tempo').press('End');
  await page.getByRole('button', { name: 'Minimizar Saída do programa', exact: true }).waitFor();
  await page.locator('.program-console').getByText('manual output', { exact: true }).waitFor();
  assert.equal(executions, 2);
  // Library examples go through the exact same source analysis.
  await page.getByRole('tab', { name: 'técnicas', exact: true }).click();
  await page.getByLabel('Filtrar exemplos por categoria').selectOption('todas');
  for (const [id, hasGraph] of [['binary-search', false], ['bfs-shortest-path', true]]) {
    await page.getByLabel('Selecionar técnica de programação competitiva').selectOption(id);
    await page.getByRole('button', { name: 'Executar Algoritmo', exact: true }).click();
    const labels = await options();
    assert.equal(labels.includes('Grafo'), hasGraph);
    assert.equal(labels.includes('Análise do grafo'), hasGraph);
    await picker.getByRole('button', { name: 'Cancelar', exact: true }).click();
  }
  // Documentation's direct run analyzes the example argument, not old editor state.
  for (const [method, expected] of [['vector_init', ['Vetores']], ['show_matrix', ['Matrizes e DP']]]) {
    await page.getByRole('button', { name: 'documentação da API', exact: true }).click();
    const card = page.locator('.docs-card').filter({ has: page.getByRole('heading', { name: method, exact: true }) });
    const source = await card.locator('.docs-example').innerText();
    await card.getByRole('button', { name: 'executar', exact: true }).click();
    assert.deepEqual(await options(), expected, method);
    assert.ok(analyzed.includes(source));
    await picker.getByRole('button', { name: 'Cancelar', exact: true }).click();
  }
  // Analysis failures offer only terminal execution and never invented panels.
  await page.getByLabel('Código da verificação').fill('int main(){ invalid C++ }');
  await page.getByRole('button', { name: 'Executar Algoritmo', exact: true }).click();
  assert.deepEqual(await options(), []);
  await picker.getByRole('alert').waitFor();
  await picker.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await inspect(vector, ['Vetores']);
  await page.setViewportSize({ width: 360, height: 640 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);
  await page.screenshot({ path: '/tmp/runspect-capabilities-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.screenshot({ path: '/tmp/runspect-capabilities-desktop.png', fullPage: true });
  await page.keyboard.press('Escape');
  assert.equal(executions, 2);
  assert.deepEqual(errors, []);
  console.log('PASS: real C++ analysis; aliases, const, macros, graph, matrix, output, recursion, unused helpers, unsupported objects, manual stdout, edited source vs trace, examples, documentation, invalid code, mobile and cancellation without execution.');
} finally {
  await browser.close();
  await server?.close();
  backend.kill();
  await new Promise(resolve => backend.exitCode !== null ? resolve() : backend.once('exit', resolve));
  await rm(backendCache, { recursive: true, force: true });
  if (cache) await rm(cache, { recursive: true, force: true });
}
