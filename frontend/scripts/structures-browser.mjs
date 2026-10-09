// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/structures-browser.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const backend = fileURLToPath(new URL('../../backend/', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'runspect-structures-browser-'));
const entry = 'virtual:structures-browser.tsx';
let browser;
const server = await createServer({
  root, configFile: false, cacheDir: join(temporary, 'vite'),
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias: { '@': `${root}src` }, dedupe: ['react', 'react-dom'] },
  optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'd3', 'lucide-react', 'mp4-muxer', 'html-to-image'], exclude: ['next/dynamic'] },
  server: { host: '127.0.0.1', port: 0, hmr: false },
  plugins: [{
    name: 'structures-browser', enforce: 'pre',
    resolveId(id) {
      if (id === entry) return `\0${entry}`;
      if (id === 'next/dynamic') return '\0structures-browser-editor';
    },
    load(id) {
      if (id === '\0structures-browser-editor') return 'export default function dynamic() { return () => null; }';
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
        response.setHeader('Content-Type', 'text/html');
        response.end(await server.transformIndexHtml('/', `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@id/${entry}"></script></body></html>`));
      });
    },
  }],
});

try {
  await server.listen();
  const { examples } = await server.ssrLoadModule('/src/lib/examples.ts');
  const ids = ['tuple-optional', 'binary-exponentiation', 'euclidean-gcd'];
  const results = new Map();
  for (const id of ids) {
    const example = examples.find(item => item.id === id);
    const source = join(temporary, `${id}.cpp`);
    const binary = `${source}.bin`;
    await writeFile(source, example.code);
    const analysis = spawnSync('/usr/bin/python3', ['-B', join(backend, 'pkg/visualizer/instrument_cpp.py'), source, '--runtime', process.env.RUNSPECT_CLANG_RUNTIME || join(backend, '.runtime/clang')], { encoding: 'utf8', timeout: 30000 });
    assert.equal(analysis.status, 0, analysis.stderr);
    const compilation = spawnSync('g++', ['-std=c++17', '-O0', '-I', join(backend, 'pkg/visualizer'), source, '-o', binary], { encoding: 'utf8', timeout: 30000 });
    assert.equal(compilation.status, 0, compilation.stderr);
    const execution = spawnSync(binary, [], { input: example.stdin, encoding: 'utf8', timeout: 3000, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
    assert.equal(execution.status, 0, execution.stderr);
    assert.equal(execution.stdout, example.expectedOutput);
    const steps = String(execution.output[3]).trim().split('\n').map((line, step) => {
      const { step_event, ...data } = JSON.parse(line);
      return { step_event, step, data };
    });
    results.set(example.code, { success: true, trace_mode: 'automatic', output: execution.stdout, steps, time_ms: 1 });
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/healthz', route => route.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/run', route => {
    const result = results.get(route.request().postDataJSON().code);
    assert.ok(result, 'The selected example must be submitted to the backend');
    return route.fulfill({ json: result });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.getByRole('tab', { name: 'técnicas', exact: true }).click();
  const main = '.visualizer-column:not(.recording-stage)';
  const primary = `${main} .graph-stage .structs-panel-primary`;
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    for (const id of ids) {
      await page.getByLabel('Selecionar técnica de programação competitiva').selectOption(id);
      await page.getByRole('button', { name: 'Executar Algoritmo' }).click();
      await page.locator(`${primary} .variable-value`).first().waitFor();
      assert.ok((await page.locator(primary).boundingBox()).height > 100, 'The data panel must occupy the primary visualization area');
      const slider = page.getByLabel('Posição na linha do tempo');
      await slider.press('End');
      await page.locator(`${main} .timeline-completed`).waitFor();
      if (id === 'tuple-optional') {
        await page.locator(primary).getByText('valor = (0 = 3, 1 = 25)', { exact: true }).waitFor();
      } else {
        const name = id === 'euclidean-gcd' ? 'a' : 'resultado';
        const value = id === 'euclidean-gcd' ? '6' : '1024';
        const card = page.locator(`${primary} .variable-card`).filter({ has: page.getByText(name, { exact: true }) });
        assert.equal(await card.locator('.variable-value').innerText(), value);
      }
      if (width === 1440) {
        await page.getByRole('button', { name: 'Tela cheia', exact: true }).click();
        await page.getByRole('button', { name: 'Sair da tela cheia', exact: true }).waitFor();
        assert.ok((await page.locator(primary).boundingBox()).height > 100);
        await page.getByRole('button', { name: 'Sair da tela cheia', exact: true }).click();
      }
      console.log(`PASS ${id}: ${width}px, initial values, final result${width === 1440 ? ', fullscreen' : ''}`);
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await server.close();
  await rm(temporary, { recursive: true, force: true });
}
