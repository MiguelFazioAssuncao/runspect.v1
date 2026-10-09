// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/graph-browser.mjs
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
  const entry = 'virtual:graph-browser.tsx';
  cache = await mkdtemp(join(tmpdir(), 'runspect-browser-cache-'));
  server = await createServer({
    root, configFile: false, cacheDir: cache,
    oxc: { jsx: { runtime: 'automatic' } },
    resolve: { alias: { '@': `${root}src` }, dedupe: ['react', 'react-dom'] },
    optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'd3', 'lucide-react', 'mp4-muxer', 'html-to-image'], exclude: ['next/dynamic'] },
    server: { host: '127.0.0.1', port: 0, hmr: false },
    plugins: [{
      name: 'graph-browser',
      enforce: 'pre',
      resolveId(id) {
        if (id === entry) return `\0${entry}`;
        if (id === 'next/dynamic') return '\0graph-browser-editor';
      },
      load(id) {
        // Lazy editor/settings components require Next and aren't used in the
        // graph tests. The actual player, canvas and toolbar remain mounted.
        if (id === '\0graph-browser-editor') return 'export default function dynamic() { return () => null; }';
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
          const html = `<html><body><div id="root"></div><script type="module" src="/@id/${entry}"></script></body></html>`;
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
let steps = [];
const event = (step_event, data = {}) => steps.push({ step: steps.length, step_event, data });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/run', route => route.fulfill({ json: { success: true, steps, time_ms: 1 } }));
await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
await page.route('**/healthz', route => route.fulfill({ json: { status: 'ok' } }));
const svg = '.visualizer-column:not(.recording-stage) .graph-canvas svg';

async function settle() {
  await page.evaluate(() => { window.graphStableSample = null; });
  await page.waitForFunction(selector => {
    const positions = [...document.querySelectorAll(`${selector} [data-graph-nodes] > g`)]
      .map(node => node.getAttribute('transform')).join('|');
    if (!positions) return false;
    const old = window.graphStableSample;
    if (!old || old.positions !== positions) {
      window.graphStableSample = { positions, since: performance.now() };
      return false;
    }
    return performance.now() - old.since > 400;
  }, svg);
}

async function snapshot() {
  return page.evaluate(selector => ({
    positions: [...document.querySelectorAll(`${selector} [data-graph-nodes] > g`)].map(node => node.getAttribute('transform')),
    paths: [...document.querySelectorAll(`${selector} [data-graph-edges] > path`)].map(path => path.getAttribute('d')),
    arrows: document.querySelectorAll(`${selector} [marker-end]`).length,
  }), svg);
}

async function assertStill(before, label) {
  const frames = await page.evaluate(async selector => {
    const frames = [];
    for (let i = 0; i < 40; i++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      frames.push([...document.querySelectorAll(`${selector} [data-graph-nodes] > g`)].map(node => node.getAttribute('transform')));
    }
    return frames;
  }, svg);
  for (const frame of frames) assert.deepEqual(frame, before.positions, label);
}

try {
  await page.goto(url);
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find(button => button.textContent === 'Executar Algoritmo');
    return button && Object.keys(button).some(key => key.startsWith('__reactProps'));
  });
  for (const directed of [false, true]) {
    steps = [];
    event('SET_DIRECTED', { directed });
    for (let id = 0; id < 8; id++) event('ADD_NODE', { id, label: String(id) });
    for (let id = 0; id < 7; id++) event('ADD_EDGE', { u: id, v: id + 1 });
    event('STEP', { caption: 'Construção' });
    event('HIGHLIGHT', { id: 2, color: 'orange' });
    event('HIGHLIGHT_EDGE', { u: 1, v: 2, color: 'red' });
    event('SET_BADGE', { id: 2, text: 'd=2' });
    event('STEP', { caption: 'Destaque' });
    event('ADD_EDGE', { u: 0, v: 7 });
    event('STEP', { caption: 'Nova aresta' });
    await page.getByRole('button', { name: 'Executar Algoritmo' }).click();
    await page.waitForFunction(selector => document.querySelectorAll(`${selector} [data-graph-edges] > path`).length === 7, svg);
    await settle();
    const before = await snapshot();
    assert.equal(before.arrows, directed ? 7 : 0);
    await page.evaluate(selector => {
      window.graphElements = [...document.querySelectorAll(`${selector} [data-graph-nodes] > g, ${selector} [data-graph-edges] > path`)];
    }, svg);
    await page.getByRole('button', { name: 'Próximo', exact: true }).click();
    await assertStill(before, 'Changing highlights must not restart the force layout');
    assert.equal(await page.evaluate(() => window.graphElements.every(element => element.isConnected)), true);
    assert.deepEqual((await snapshot()).paths, before.paths);

    await page.getByRole('button', { name: 'Tela cheia', exact: true }).click();
    await page.getByRole('button', { name: 'Sair da tela cheia', exact: true }).waitFor();
    await assertStill(before, 'Entering fullscreen must not move settled nodes');
    await page.getByRole('button', { name: 'Sair da tela cheia', exact: true }).click();
    await assertStill(before, 'Exiting fullscreen must not move settled nodes');
    assert.equal((await snapshot()).arrows, directed ? 7 : 0);

    await page.getByRole('button', { name: 'Próximo', exact: true }).click();
    await page.waitForFunction(selector => document.querySelectorAll(`${selector} [data-graph-edges] > path`).length === 8, svg);
    await settle();
    assert.equal((await snapshot()).arrows, directed ? 8 : 0);
    for (const layout of ['circular', 'grid', 'force']) {
      await page.getByLabel('Layout do grafo').selectOption(layout);
      await settle();
      const state = await snapshot();
      assert.equal(state.paths.length, 8);
      assert.ok(state.positions.every(position => position && !/NaN|Infinity/.test(position)));
      assert.ok(state.paths.every(path => path && !/NaN|Infinity/.test(path)));
    }
    console.log(`PASS ${directed ? 'directed' : 'undirected'}: highlights, fullscreen, topology, layout changes`);
  }
  // Parallel and opposite arcs remain distinct when explicitly requested.
  steps = [];
  event('SET_DIRECTED', { directed: true });
  event('SET_MULTI', { multi: true });
  event('ADD_NODE', { id: 0, label: '0' });
  event('ADD_NODE', { id: 1, label: '1' });
  event('ADD_EDGE', { u: 0, v: 1 });
  event('ADD_EDGE', { u: 0, v: 1 });
  event('ADD_EDGE', { u: 1, v: 0 });
  event('ADD_EDGE', { u: 0, v: 0 });
  event('STEP');
  await page.getByRole('button', { name: 'Executar Algoritmo' }).click();
  await page.waitForFunction(selector => document.querySelectorAll(`${selector} [data-graph-edges] > path`).length === 4, svg);
  await settle();
  const multi = await snapshot();
  assert.equal(multi.arrows, 4);
  assert.equal(new Set(multi.paths).size, 4);
  assert.deepEqual(errors, []);
  console.log('PASS parallel edges, opposite arcs and self-loops');
} catch (error) {
  console.error('Browser errors:', errors);
  console.error(await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
  await server?.close();
  if (cache) await rm(cache, { recursive: true, force: true });
}
