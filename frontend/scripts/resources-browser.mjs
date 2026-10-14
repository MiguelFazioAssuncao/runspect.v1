// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:resources
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { confirmAllVisualizations } from './browser-selection.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const backendRoot = fileURLToPath(new URL('../../backend/', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'runspect-resources-browser-'));
const entry = 'virtual:resources-browser.tsx';
let browser, backend, server;
let backendLog = '';
const screenshots = process.env.RUNSPECT_SCREENSHOTS;

try {
  const binary = join(temporary, 'server');
  const build = spawnSync('go', ['build', '-o', binary, './cmd/server'], { cwd: backendRoot, env: { ...process.env, GOCACHE: '/tmp/runspect-go-cache' }, encoding: 'utf8', timeout: 120000 });
  assert.equal(build.status, 0, build.stderr);
  const reservation = createNetServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const endpoint = `http://127.0.0.1:${port}`;
  // Only the reviewed catalog and fixtures in this script reach this server.
  backend = spawn(binary, [], { cwd: backendRoot, env: { ...process.env, RUNSPECT_ADDR: `127.0.0.1:${port}`, RUNSPECT_SANDBOX: 'off', RUNSPECT_RATE_PER_MIN: '1000' }, stdio: ['ignore', 'ignore', 'pipe'] });
  backend.stderr.on('data', data => backendLog += data);
  let healthy = false;
  for (let attempt = 0; attempt < 100 && !healthy; attempt++) {
    healthy = await fetch(`${endpoint}/healthz`).then(response => response.ok).catch(() => false);
    if (!healthy) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(healthy, backendLog);

  server = await createServer({
    root, configFile: false, cacheDir: join(temporary, 'vite'),
    define: { 'process.env.NEXT_PUBLIC_RUNSPECT_API_URL': '""', 'process.env.NEXT_PUBLIC_BASE_PATH': '""' },
    oxc: { jsx: { runtime: 'automatic' } },
    resolve: { alias: { '@': `${root}src` }, dedupe: ['react', 'react-dom'] },
    optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'd3', 'lucide-react', 'mp4-muxer', 'html-to-image'], exclude: ['next/dynamic'] },
    server: { host: '127.0.0.1', port: 0, hmr: false },
    plugins: [{
      name: 'resources-browser', enforce: 'pre',
      resolveId(id) {
        if (id === entry) return `\0${entry}`;
        if (id === 'next/dynamic') return '\0resources-editor';
      },
      load(id) {
        if (id === '\0resources-editor') return `import React from 'react'; export default function dynamic() { return props => React.createElement('textarea', { value: props.value ?? '', onChange: event => props.onChange?.(event.target.value), 'aria-label': 'Código da verificação', style: { width:'100%',height:'100%',background:'#0f172a',color:'#cbd5e1' } }); }`;
        if (id === `\0${entry}`) return `import React from 'react'; import {createRoot} from 'react-dom/client'; import Home from '/src/app/page.tsx'; import '/src/app/globals.css'; createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(Home)));`;
      },
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          if (request.url !== '/') return next();
          response.setHeader('Content-Type', 'text/html');
          response.end(await server.transformIndexHtml('/', `<html style="--font-geist-sans:Arial;--font-geist-mono:monospace"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@id/${entry}"></script></body></html>`));
        });
      },
    }],
  });
  await server.listen();
  const { examples } = await server.ssrLoadModule('/src/lib/examples.ts');
  const { frameEnds } = await server.ssrLoadModule('/src/lib/graphReducer.ts');
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(30000);
  const errors = [];
  const requests = [];
  let result;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/healthz', route => route.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/{run,analyze}', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON();
    const response = await fetch(endpoint + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (path === '/api/run') { requests.push(body); result = data; }
    await route.fulfill({ status: response.status, json: data });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.getByRole('tab', { name: 'técnicas', exact: true }).click();
  const main = '.visualizer-column:not(.recording-stage)';
  const seek = async predicate => {
    const event = result.steps.findIndex(predicate);
    assert.ok(event >= 0, 'Expected event must exist in the real backend trace');
    const frames = frameEnds(result.steps);
    const target = frames.findIndex(index => index >= event);
    const slider = page.getByLabel('Posição na linha do tempo');
    await slider.press('Home');
    for (let index = 0; index < target; index++) await slider.press('ArrowRight');
  };
  const execute = async (id, input) => {
    const example = examples.find(item => item.id === id);
    await page.getByLabel('Selecionar técnica de programação competitiva').selectOption(id);
    if (input !== undefined) {
      const expand = page.getByRole('button', { name: 'Restaurar Entrada (stdin)', exact: true });
      if (await expand.isVisible()) await expand.click();
      await page.getByLabel('Entrada padrão do programa').fill(input);
    }
    result = undefined;
    await page.getByRole('button', { name: 'Executar Algoritmo', exact: true }).click();
    const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/run');
    await confirmAllVisualizations(page);
    await response;
    await page.waitForFunction(() => document.querySelector('.timeline-slider')?.disabled === false);
    await page.getByLabel('Posição na linha do tempo').waitFor();
    assert.equal(result?.success, true, JSON.stringify(result));
    assert.equal(result.trace_mode, 'automatic', JSON.stringify(result.trace_warnings));
    if (input === undefined) assert.equal(result.output, example.expectedOutput);
    return example;
  };

  for (const id of ['linked-list-reversal', 'bst-insertion', 'trie-prefix-count', 'huffman-tree', 'generic-insertion-sort', 'constexpr-factorial', 'postfix-evaluation', 'euclidean-gcd-goto', 'lcs-string-table']) {
    await execute(id);
    if (['linked-list-reversal', 'bst-insertion', 'huffman-tree', 'trie-prefix-count'].includes(id)) {
      await seek(step => step.step_event === 'SET_REFERENCES' && step.data?.objects?.length >= 3);
      const panel = page.locator(`${main} .reference-view`);
      await panel.locator('[data-reference-nodes] > g').first().waitFor();
      await panel.getByLabel('Visualização dos objetos').selectOption('fields');
      assert.ok(await panel.locator('details[open]').count() >= 3);
      await panel.getByLabel('Visualização dos objetos').selectOption('connections');
    }
    await page.getByLabel('Posição na linha do tempo').press('End');
    await page.locator(`${main} .timeline-completed`).waitFor();
    if (id === 'lcs-string-table') assert.ok(await page.locator(`${main} [aria-label="Matriz dp"]`).count() > 0);
    if (screenshots && ['linked-list-reversal', 'huffman-tree', 'lcs-string-table'].includes(id)) {
      if (id !== 'lcs-string-table') await seek(step => step.step_event === 'SET_REFERENCES' && step.data?.objects?.length >= 3);
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({ path: join(screenshots, `${id}-desktop.png`), fullPage: true });
    }
    console.log(`PASS ${id}: editor → real API → automatic trace → player`);
  }
  await execute('postfix-evaluation', '8 0 /\n');
  assert.equal(result.output, 'EXPRESSAO INVALIDA\n');
  assert.ok(result.steps.some(step => step.step_event === 'CALL_EXIT' && step.data?.status === 'threw'));
  await page.getByLabel('Posição na linha do tempo').press('End');
  await page.locator(`${main} .call-entry-threw`).first().waitFor();

  await page.getByLabel('Captura da visualização').selectOption('detailed');
  await execute('generic-insertion-sort', `600\n${Array.from({ length: 600 }, (_, index) => index).join(' ')}\n`);
  assert.deepEqual(requests.at(-1).trace_options, { max_steps: 5000, max_items: 1024 });
  assert.equal(result.trace_limits.max_items, 1024);
  await seek(step => step.step_event === 'VECTOR_INIT' && step.data?.name === 'a' && step.data?.values?.length === 600);
  const next = page.locator(main).getByRole('button', { name: 'Próxima página do vetor a', exact: true });
  await next.click();
  await page.locator(`${main} .vector-view`).getByText('elementos 512–599 de 600 · página 2 / 2', { exact: true }).waitFor();
  await page.getByLabel('Captura da visualização').selectOption('standard');

  await page.getByRole('tab', { name: 'seu código', exact: true }).click();
  const wideRecord = `struct Wide { ${Array.from({ length: 200 }, (_, index) => `int field${index}=${index};`).join(' ')} }; int main() { Wide value; }`;
  await page.getByLabel('Código da verificação').fill(wideRecord);
  result = undefined;
  await page.getByRole('button', { name: 'Executar Algoritmo', exact: true }).click();
  const wideResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/run');
  await confirmAllVisualizations(page);
  await wideResponse;
  await page.waitForFunction(() => document.querySelector('.timeline-slider')?.disabled === false);
  assert.equal(result.success, true);
  const wideView = page.locator(`${main} .reference-view`);
  await wideView.getByLabel('Visualização dos objetos').selectOption('fields');
  await wideView.getByRole('button', { name: 'Próxima página de campos do objeto @1', exact: true }).click();
  await wideView.locator('dt').getByText('field199', { exact: true }).waitFor();
  await page.getByRole('tab', { name: 'técnicas', exact: true }).click();

  await page.setViewportSize({ width: 390, height: 1000 });
  await execute('linked-list-reversal');
  await seek(step => step.step_event === 'SET_REFERENCES' && step.data?.objects?.length >= 3);
  const diagram = page.locator(`${main} .reference-diagram-scroll`);
  const bounds = await diagram.boundingBox();
  assert.ok(bounds.width <= 390 && bounds.height > 120);
  assert.ok((await page.locator(`${main} .recording-area`).boundingBox()).height >= bounds.height, 'Mobile visualization must have enough height to display its contents');
  if (screenshots) await page.screenshot({ path: join(screenshots, 'linked-list-mobile.png'), fullPage: true });
  await execute('lcs-string-table');
  await page.getByLabel('Posição na linha do tempo').press('End');
  const matrix = page.locator(`${main} [aria-label="Matriz dp"]`);
  await matrix.getByRole('table').waitFor();
  assert.ok((await page.locator(`${main} .recording-area`).boundingBox()).height >= (await matrix.boundingBox()).height, 'Mobile DP table must be visible');
  assert.deepEqual(errors, []);
  console.log(`PASS exceptions, capture presets, vector and field pagination, backward replay and mobile; ${requests.length} real executions, no browser errors`);
} finally {
  await browser?.close();
  await server?.close();
  backend?.kill();
  await rm(temporary, { recursive: true, force: true });
}
