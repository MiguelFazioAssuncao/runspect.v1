import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFile, cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'runspect-proxy-'));
const serverRoot = join(temporary, 'frontend');
const delayMs = 31_000;
let next, logs = '';
const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(server.address().port); });
});
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections?.(); });
const upstream = createServer((request, response) => {
  request.resume();
  if (request.url === '/healthz') { response.writeHead(204).end(); return; }
  if (request.url !== '/api/run' || request.method !== 'POST') { response.writeHead(404).end(); return; }
  const timer = setTimeout(() => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ success: true, steps: [], output: 'resposta após 30 segundos', time_ms: delayMs }));
  }, delayMs);
  response.on('close', () => clearTimeout(timer));
});

try {
  const apiPort = await listen(upstream);
  const reservation = createServer();
  const port = await listen(reservation);
  await close(reservation);
  await mkdir(serverRoot);
  await Promise.all([
    ...['package.json', 'next.config.ts', 'tsconfig.json', 'postcss.config.mjs'].map(file => copyFile(join(root, file), join(serverRoot, file))),
    cp(join(root, 'src'), join(serverRoot, 'src'), { recursive: true }),
    ...['public', 'node_modules'].map(directory => symlink(join(root, directory), join(serverRoot, directory), 'dir')),
  ]);
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: serverRoot, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'development', GITHUB_PAGES: 'false', RUNSPECT_API_URL: `http://127.0.0.1:${apiPort}`, NEXT_PUBLIC_RUNSPECT_API_URL: '', NEXT_PUBLIC_BASE_PATH: '' },
  });
  next.stdout.on('data', data => { logs += data; });
  next.stderr.on('data', data => { logs += data; });
  next.on('error', error => { logs += error.message; });
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(1500) }).then(response => response.ok).catch(() => false)) { ready = true; break; }
    if (next.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, `Next proxy did not start:\n${logs}`);
  const response = await fetch(`${origin}/api/run`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'int main() {}' }), signal: AbortSignal.timeout(45_000),
  });
  assert.equal(response.status, 200, `Next aborted a valid slow response:\n${logs}`);
  const result = await response.json();
  assert.equal(result.success, true);
  assert.equal(result.output, 'resposta após 30 segundos');
  console.log('PASS: the real Next proxy returns a successful API response after 31 seconds.');
} finally {
  if (next?.pid && next.exitCode === null) {
    const exited = new Promise(resolve => next.once('exit', resolve));
    try { process.kill(-next.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    await exited;
  }
  await close(upstream);
  await rm(temporary, { recursive: true, force: true });
}
