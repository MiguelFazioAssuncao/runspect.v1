import { confirmAllVisualizations, mockVisualizationAnalysis } from './browser-selection.mjs';
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/evolution-browser.mjs
// Executes trusted repository fixtures with the real instrumenter and mounts the
// application in Vite. Monaco is replaced by an editable textarea in this harness.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const backend = fileURLToPath(new URL('../../backend/', import.meta.url));
const output = process.env.EVOLUTION_OUTPUT || fileURLToPath(new URL('../../docs/evidencias/', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'runspect-evolution-browser-'));
const entry = 'virtual:evolution-browser.tsx';
const fixture = await readFile(join(backend, 'internal/runner/testdata/kuhn_difference.cpp'), 'utf8');
const required = await readFile(join(backend, 'internal/runner/testdata/kuhn_difference.in'), 'utf8');
const augmenting = '4 2 2\n1 2\n1 3\n1 4\n2 4\n';
const structures = `#include <bits/stdc++.h>
using namespace std;
int recurse(int n) {
    if (n == 0) return 0;
    return recurse(n - 1) + 1;
}
int main() {
    set<pair<int,int>> s1{{1,2}}, s2{{3,4}};
    vector<pair<int,int>> A{{1,2}}, B{{3,4}};
    map<int,string> legend{{1,"descoberto"},{2,"processando"}};
    stack<int> pending; pending.push(1); pending.push(2);
    queue<int> fifo; fifo.push(1); fifo.push(2);
    tuple<int,string> state{2,"pronto"};
    vector<vector<int>> dp{{0,1},{1,0}};
    int result=recurse(2);
    dp[1][1]=dp[0][1]+dp[1][0];
    cout << dp[1][1] << '\\n';
}
`;
let browser;

function trace(code, input, serial) {
  const source = join(temporary, `${serial}.cpp`);
  const binary = `${source}.bin`;
  return writeFile(source, code).then(() => {
    const args = ['-B', join(backend, 'pkg/visualizer/instrument_cpp.py'), source];
    const runtime = process.env.RUNSPECT_CLANG_RUNTIME || join(backend, '.runtime/clang');
    if (existsSync(runtime)) args.push('--runtime', runtime);
    const analysis = spawnSync('/usr/bin/python3', args, { encoding: 'utf8', timeout: 30000 });
    assert.equal(analysis.status, 0, analysis.stderr);
    assert.equal(JSON.parse(analysis.stdout).mode, 'automatic');
    const compile = spawnSync('g++', ['-std=c++17', '-O0', '-I', join(backend, 'pkg/visualizer'), source, '-o', binary], { encoding: 'utf8', timeout: 30000 });
    assert.equal(compile.status, 0, compile.stderr);
    const execution = spawnSync(binary, [], { input, encoding: 'utf8', timeout: 3000, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
    assert.equal(execution.status, 0, execution.stderr);
    assert.equal(execution.stdout, '2\n');
    const steps = String(execution.output[3]).trim().split('\n').filter(Boolean).map((line, step) => {
      const { step_event, ...data } = JSON.parse(line);
      return { step, step_event, data };
    });
    return { success: true, trace_mode: 'automatic', steps, output: execution.stdout, time_ms: 1 };
  });
}

const server = await createServer({
  root, configFile: false, cacheDir: join(temporary, 'vite'),
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias: { '@': `${root}src` }, dedupe: ['react', 'react-dom'] },
  optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'd3', 'lucide-react', 'mp4-muxer', 'html-to-image'], exclude: ['next/dynamic'] },
  server: { host: '127.0.0.1', port: 0, hmr: false },
  plugins: [{
    name: 'evolution-browser', enforce: 'pre',
    resolveId(id) {
      if (id === entry) return `\0${entry}`;
      if (id === 'next/dynamic') return '\0evolution-browser-editor';
    },
    load(id) {
      if (id === '\0evolution-browser-editor') return `
        import React from 'react';
        export default function dynamic() {
          return function Editor(props) {
            return React.createElement('textarea', { value: props.value || props.defaultValue || '', onChange: event => props.onChange?.(event.target.value), 'aria-label': 'Código C++ da verificação', spellCheck: false, style: { width: '100%', height: '100%', resize: 'none', background: '#0f172a', color: '#cbd5e1', padding: '12px', fontFamily: 'monospace', fontSize: '12px' } });
          };
        }
      `;
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
  const traces = await Promise.all([trace(fixture, required, 0), trace(fixture, augmenting, 1), trace(structures, '', 2)]);
  await server.listen();
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let selected = 0;
  await page.route('**/healthz', route => route.fulfill({ json: { status: 'ok' } }));
  await mockVisualizationAnalysis(page, () => traces[selected].steps);
  await page.route('**/api/run', route => route.fulfill({ json: traces[selected] }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.getByLabel('Código C++ da verificação').fill(fixture);
  const metrics = [];
  const waitForTrace = async index => {
    const frames = traces[index].steps.filter(step => ['STEP', 'VECTOR_STEP'].includes(step.step_event)).length;
    await page.waitForFunction(count => document.querySelector('.visualizer-column:not(.recording-stage) .timeline-step')?.textContent.includes(`/ ${count}`), frames);
  };
  for (const [index, label] of [[0, 'obrigatório'], [1, 'caminho aumentante']]) {
    selected = index;
    await page.getByRole('button', { name: 'Executar Algoritmo', exact: true }).click(); await confirmAllVisualizations(page);
    await waitForTrace(index);
    const timeline = page.getByLabel('Posição na linha do tempo');
    await timeline.waitFor();
    await timeline.press('End');
    await page.locator('.visualizer-column:not(.recording-stage) .timeline-completed').waitFor();
    for (const [width, height, suffix] of [[1440, 960, 'desktop'], [360, 640, 'mobile']]) {
      await page.setViewportSize({ width, height });
      const result = await page.evaluate(() => ({ width: innerWidth, pageWidth: document.documentElement.scrollWidth }));
      assert.equal(result.pageWidth, width, `${label}: a página ultrapassa ${width}px`);
      metrics.push({ label, ...result });
      if (index === 0) await page.screenshot({ path: join(output, `fase1-${suffix}.png`), fullPage: true });
    }
    console.log(`PASS ${label}: trace real, playback final e viewports 1440/360`);
  }
  selected = 2;
  await page.getByLabel('Código C++ da verificação').fill(structures);
  await page.getByRole('button', { name: 'Executar Algoritmo', exact: true }).click(); await confirmAllVisualizations(page);
  await waitForTrace(2);
  await page.getByLabel('Posição na linha do tempo').press('End');
  await page.locator('.visualizer-column:not(.recording-stage) .timeline-completed').waitFor();
  const main = page.locator('.visualizer-column:not(.recording-stage)');
  await main.getByRole('region', { name: 'Matriz dp', exact: true }).waitFor();
  for (const [width, height, suffix] of [[1440, 960, 'desktop'], [360, 640, 'mobile']]) {
    await page.setViewportSize({ width, height });
    await main.getByRole('region', { name: 'Variável A', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, `fase1-estruturas-${suffix}.png`), fullPage: true });
    await main.getByRole('region', { name: 'Matriz dp', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, `fase1-dp-${suffix}.png`), fullPage: true });
    await main.getByText('Árvore de chamadas', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, `fase1-chamadas-${suffix}.png`), fullPage: true });
  }
  console.log('PASS estruturas, matriz DP e árvore de chamadas: traces reais e capturas desktop/mobile');
  assert.deepEqual(errors, []);
  await writeFile(join(output, 'fase1-browser.json'), JSON.stringify({ metrics, note: 'Trace C++ real; Monaco substituído por textarea no harness.' }, null, 2));
} finally {
  await browser?.close();
  await server.close();
  await rm(temporary, { recursive: true, force: true });
}
