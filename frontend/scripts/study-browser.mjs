import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { confirmAllVisualizations } from './browser-selection.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const backendRoot = fileURLToPath(new URL('../../backend/', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'runspect-study-'));
const evidence = process.env.RUNSPECT_SCREENSHOTS || join(temporary, 'screenshots');
const processes = [];
let browser, page;
let logs = '';
async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function start(command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  processes.push(child);
  return child;
}
async function healthy(url) {
  for (let attempt = 0; attempt < 160; attempt++) {
    if (await fetch(url).then(response => response.ok).catch(() => false)) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not become ready: ${url}\n${logs}`);
}

try {
  const build = spawnSync('go', ['build', '-o', join(temporary, 'backend'), './cmd/server'], { cwd: backendRoot, env: { ...process.env, GOCACHE: '/tmp/runspect-go-cache' }, encoding: 'utf8', timeout: 120000 });
  assert.equal(build.status, 0, build.stderr);
  const apiPort = await freePort();
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  start(join(temporary, 'backend'), [], backendRoot, { RUNSPECT_ADDR: `127.0.0.1:${apiPort}`, RUNSPECT_SANDBOX: 'off', RUNSPECT_ALLOWED_ORIGINS: origin, RUNSPECT_RATE_PER_MIN: '1000' });
  await healthy(`http://127.0.0.1:${apiPort}/healthz`);
  start(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], root, { RUNSPECT_API_URL: `http://127.0.0.1:${apiPort}`, NEXT_PUBLIC_RUNSPECT_API_URL: '', NEXT_PUBLIC_BASE_PATH: '' });
  await healthy(origin);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(45000);
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (/^https?:/.test(url) && new URL(url).origin !== origin) { external.push(url); return route.abort(); }
    return route.continue();
  });
  await page.goto(origin);
  const editorReady = () => page.waitForFunction(() => window.monaco?.editor.getModels().length > 0 && document.querySelector('.monaco-editor'));
  await editorReady();
  const setCode = async code => {
    await page.locator('.monaco-editor').getByRole('textbox').first().focus();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText(code);
  };
  const getCode = () => page.evaluate(() => window.monaco.editor.getModels()[0].getValue());
  const expandInput = async () => {
    const button = page.getByRole('button', { name: 'Restaurar Entrada (stdin)', exact: true });
    if (await button.isVisible()) await button.click();
  };
  const savedCode = '#include <iostream>\nint main() { int n; std::cin >> n; std::cout << n * 2 << "\\n"; }\n';
  await setCode(savedCode);
  await expandInput();
  await page.getByLabel('Entrada padrão do programa').fill('21\n');
  await page.waitForFunction(code => JSON.parse(localStorage.getItem('runspect.study.v1') || '{}').code === code, savedCode);
  await page.reload();
  await editorReady();
  assert.equal(await getCode(), savedCode);
  await expandInput();
  assert.equal(await page.getByLabel('Entrada padrão do programa').inputValue(), '21\n');
  console.log('PASS custom draft survives reload with its exact input');

  await page.getByRole('tab', { name: 'técnicas', exact: true }).click();
  await page.getByLabel('Buscar exemplos').fill('binaria');
  await page.getByLabel('Selecionar técnica de programação competitiva').selectOption('binary-search');
  await page.getByText('Como estudar esta técnica', { exact: true }).click();
  await page.getByRole('button', { name: 'Executar Algoritmo', exact: true }).click();
  const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/run');
  await confirmAllVisualizations(page);
  const result = await (await response).json();
  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(result.trace_mode, 'automatic');
  await page.getByText('A saída coincide com o exemplo.', { exact: true }).waitFor();
  await page.getByLabel('Posição na linha do tempo').press('End');
  await page.getByLabel('Já consigo explicar esta técnica').check();
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: join(evidence, 'study-desktop.png'), fullPage: true });
  console.log('PASS accent-insensitive search → real analysis → real execution → sample comparison');

  await setCode((await getCode()).replace('cout << resposta', 'cout << 999'));
  await page.getByText('O código ou a entrada mudou. Execute novamente para atualizar a visualização.', { exact: true }).waitFor();
  assert.equal(await page.getByText('A saída coincide com o exemplo.', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Executar Algoritmo', exact: true }).click();
  await confirmAllVisualizations(page);
  await page.getByText('A saída difere do exemplo. Confira os valores no terminal.', { exact: true }).waitFor();
  console.log('PASS modified solution clears stale feedback and detects wrong output');

  await page.getByRole('tab', { name: 'seu código', exact: true }).click();
  assert.equal(await getCode(), savedCode);
  assert.equal(await page.getByLabel('Entrada padrão do programa').inputValue(), '21\n');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar projeto', exact: true }).click();
  const download = await downloading;
  const file = join(temporary, 'project.json');
  await download.saveAs(file);
  const exported = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(exported.code, savedCode);
  assert.equal(exported.stdin, '21\n');
  assert.ok(exported.completed.includes('binary-search'));
  await setCode('int main() {}');
  await page.getByLabel('Arquivo de projeto').setInputFiles(file);
  await page.waitForFunction(code => window.monaco.editor.getModels()[0].getValue() === code, savedCode);
  await page.getByLabel('Arquivo de projeto').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('null') });
  await page.getByText('Projeto inválido.', { exact: true }).waitFor();
  assert.equal(await getCode(), savedCode);
  console.log('PASS tab input isolation, export/import and invalid-file recovery');
  await setCode('#include "visualizer.h"\nint main() { if (false) viz::step("não executado"); std::cout << "resultado sem passos\\n"; }');
  await page.getByLabel('Entrada padrão do programa').fill('');
  await page.getByRole('button', { name: 'Executar Algoritmo', exact: true }).click();
  const noStepsResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/run');
  await confirmAllVisualizations(page);
  const noStepsResult = await (await noStepsResponse).json();
  assert.equal(noStepsResult.success, true, JSON.stringify(noStepsResult));
  assert.equal(noStepsResult.trace_mode, 'manual');
  assert.equal(noStepsResult.steps.length, 0);
  await page.waitForFunction(() => document.querySelector('.terminal-output')?.textContent.includes('resultado sem passos'));
  console.log('PASS program output remains visible when no visualization events execute');

  await setCode('#include <iostream>\nint main() {\n  std::cout << "antes da falha" << std::endl;\n  int value;\n  std::cin >> value;\n  std::cout << value;\n}');
  await page.getByRole('button', { name: 'Executar Algoritmo', exact: true }).click();
  const failedResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/run');
  await confirmAllVisualizations(page);
  const failedResult = await (await failedResponse).json();
  assert.equal(failedResult.success, false);
  assert.ok(failedResult.steps.length > 0);
  await page.getByLabel('Posição na linha do tempo').press('End');
  await page.waitForFunction(() => {
    const terminal = document.querySelector('.terminal-output')?.textContent ?? '';
    return terminal.includes('antes da falha') && terminal.includes('Entrada insuficiente na linha 5');
  });
  assert.ok(await page.locator('.terminal-panel-error').isVisible());
  console.log('PASS runtime failures preserve partial stdout and the timeline leading to the error');

  await setCode('#include <iostream>\nint main() { while (true) {} }');
  await page.getByRole('button', { name: 'Executar Algoritmo', exact: true }).click();
  await confirmAllVisualizations(page);
  await page.getByRole('button', { name: 'Cancelar execução', exact: true }).click();
  await page.getByText('Execução cancelada. Seu código foi preservado.', { exact: true }).waitFor();
  console.log('PASS cancellation restores the editor');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'técnicas', exact: true }).click();
  await page.getByRole('button', { name: 'Restaurar exemplo', exact: true }).click();
  await page.getByText('Como estudar esta técnica', { exact: true }).click();
  await page.getByRole('button', { name: 'Executar Algoritmo', exact: true }).click();
  await confirmAllVisualizations(page);
  await page.getByText('A saída coincide com o exemplo.', { exact: true }).waitFor();
  await page.getByLabel('Posição na linha do tempo').press('End');
  assert.ok(await page.getByLabel('Já consigo explicar esta técnica').isChecked());
  const width = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(width.document <= width.viewport, JSON.stringify(width));
  await page.screenshot({ path: join(evidence, 'study-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(external, [], 'Editor must not depend on external CDN assets');
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log(`PASS mobile layout and local-only assets. Screenshots: ${evidence}`);
} catch (error) {
  if (page) {
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: join(evidence, 'failure.png'), fullPage: true });
    console.error(await page.locator('.monaco-editor').evaluateAll(elements => elements.map(element => ({ text: element.innerText.slice(0, 200), inputs: Array.from(element.querySelectorAll('[role],textarea,[contenteditable]')).map(input => ({ tag: input.tagName, role: input.getAttribute('role'), label: input.getAttribute('aria-label'), className: input.className })) }))));
  }
  console.error(logs.slice(-8000));
  throw error;
} finally {
  await browser?.close();
  for (const child of processes.reverse()) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
  await rm(temporary, { recursive: true, force: true });
}
