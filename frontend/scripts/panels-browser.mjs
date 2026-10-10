// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/panels-browser.mjs
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
let steps = [];
const event = (step_event, data = {}) => steps.push({ step: steps.length, step_event, data });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/run', route => route.fulfill({ json: { success: true, steps, time_ms: 1 } }));
await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
await page.route('**/healthz', route => route.fulfill({ json: { status: 'ok' } }));
async function drag(handle, delta, horizontal = false) {
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  assert.ok(box);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + (horizontal ? delta : 0), y + (horizontal ? 0 : delta), { steps: 8 });
  await page.mouse.up();
}
const toggle = (verb, title) => page.getByRole('button', { name: `${verb} ${title}`, exact: true });
const panel = title => toggle('Minimizar', title).locator('xpath=../..');
try {
  await page.goto(url);
  await page.getByLabel('Código da verificação').fill('int main() { return 42; }');
  const split = page.getByRole('separator', { name: 'Redimensionar código e visualização', exact: true });
  const pane = page.locator('.workspace-pane').first();
  const initialWidth = (await pane.boundingBox()).width;
  await drag(split, -180, true);
  assert.ok((await pane.boundingBox()).width < initialWidth - 150);
  const resizedWidth = (await pane.boundingBox()).width;
  await toggle('Minimizar', 'Escrever código').click();
  assert.equal((await pane.boundingBox()).width, 40);
  assert.equal(await page.getByLabel('Código da verificação').isVisible(), false);
  await toggle('Restaurar', 'Escrever código').click();
  assert.ok(Math.abs((await pane.boundingBox()).width - resizedWidth) < 2);
  assert.equal(await page.getByLabel('Código da verificação').inputValue(), 'int main() { return 42; }');
  await split.press('ArrowRight');
  assert.ok((await pane.boundingBox()).width > resizedWidth + 10);
  await split.dblclick();
  assert.ok(Math.abs((await pane.boundingBox()).width - initialWidth) < 2);
  await toggle('Minimizar', 'Visualizar').click();
  assert.equal((await page.locator('.workspace-pane').last().boundingBox()).width, 40);
  await toggle('Minimizar', 'Escrever código').click();
  await toggle('Restaurar', 'Visualizar').click();
  await toggle('Restaurar', 'Escrever código').click();

  event('ADD_NODE', { id: 0, label: '0' });
  event('ADD_NODE', { id: 1, label: '1' });
  event('ADD_EDGE', { u: 0, v: 1 });
  event('VECTOR_INIT', { name: 'a', values: [3, 1, 2] });
  event('SET_STRUCT', { name: 'fila', kind: 'queue', items: ['1', '2'] });
  event('SET_MATRIX', { name: 'dp', rows: [['0', '1'], ['1', '2']] });
  event('CALL_ENTER', { id: 1, parent: null, function: 'main', depth: 0, line: 1 });
  event('PROGRAM_OUTPUT', { text: '42\n' });
  event('STEP', { caption: 'Primeiro passo' });
  event('VECTOR_SET', { name: 'a', index: 0, value: 4 });
  event('STEP', { caption: 'Segundo passo' });
  await page.getByRole('button', { name: 'Executar Algoritmo', exact: true }).click();
  await toggle('Minimizar', 'Grafo').waitFor();
  await page.getByLabel('Posição na linha do tempo').press('End');
  const step = await page.locator('.timeline-step').textContent();
  for (const title of ['Grafo', 'Vetores', 'Vetor a', 'Análise do grafo', 'Legenda', 'Estruturas e variáveis', 'Variável fila', 'Matriz dp', 'Chamadas recursivas', 'Pilha de chamadas', 'Árvore de chamadas', 'Saída do programa', 'Linha do tempo', 'Editor', 'Terminal']) {
    const body = panel(title).locator(':scope > .resizable-panel-body');
    await toggle('Minimizar', title).click();
    assert.equal(await body.isVisible(), false, title);
    await toggle('Restaurar', title).click();
    assert.equal(await body.isVisible(), true, title);
  }
  assert.equal(await page.locator('.timeline-step').textContent(), step);
  assert.equal(await page.getByLabel('Código da verificação').inputValue(), 'int main() { return 42; }');
  await toggle('Restaurar', 'Análises avançadas').click();
  await toggle('Minimizar', 'Análises avançadas').click();
  await toggle('Restaurar', 'Entrada (stdin)').click();
  await page.getByLabel('Entrada padrão do programa').fill('1 2 3');
  await toggle('Minimizar', 'Entrada (stdin)').click();
  await toggle('Restaurar', 'Entrada (stdin)').click();
  assert.equal(await page.getByLabel('Entrada padrão do programa').inputValue(), '1 2 3');
  await toggle('Minimizar', 'Entrada (stdin)').click();
  for (const title of ['Grafo', 'Vetor a', 'Matriz dp', 'Terminal', 'Editor']) {
    const body = panel(title).locator(':scope > .resizable-panel-body');
    const handle = page.getByRole('separator', { name: `Redimensionar ${title}`, exact: true });
    await drag(handle, 60);
    const height = (await body.boundingBox()).height;
    assert.ok(height >= 40, title);
    await handle.press('ArrowUp');
    assert.ok((await body.boundingBox()).height < height - 10, title);
    const adjusted = (await body.boundingBox()).height;
    await toggle('Minimizar', title).click();
    await toggle('Restaurar', title).click();
    assert.ok(Math.abs((await body.boundingBox()).height - adjusted) < 2, title);
    await handle.dblclick();
    assert.equal(await panel(title).getAttribute('data-sized'), 'false');
  }
  await page.evaluate(() => document.querySelectorAll('.recording-area, .resizable-panel-body').forEach(element => { element.scrollTop = 0; }));
  await page.screenshot({ path: '/tmp/runspect-panels-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 360, height: 640 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);
  await toggle('Minimizar', 'Escrever código').click();
  assert.ok((await pane.boundingBox()).height < 50);
  await toggle('Restaurar', 'Escrever código').click();
  const mobileGraph = panel('Grafo').locator(':scope > .resizable-panel-body');
  const mobileHeight = (await mobileGraph.boundingBox()).height;
  await drag(page.getByRole('separator', { name: 'Redimensionar Grafo', exact: true }), -60);
  assert.ok((await mobileGraph.boundingBox()).height < mobileHeight - 40);
  await page.screenshot({ path: '/tmp/runspect-panels-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: arraste, teclado, minimizar/restaurar todos os painéis, preservação do código/playback e layout mobile.');
} finally {
  await browser.close();
  await server?.close();
  if (cache) await rm(cache, { recursive: true, force: true });
}
