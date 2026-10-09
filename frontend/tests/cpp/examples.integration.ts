import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { examples } from '../../src/lib/examples';

let directory: string;
const binaries = new Map<string, string>();

beforeAll(() => { directory = mkdtempSync(join(tmpdir(), 'runspect-cpp-examples-')); });
afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

function getBinary(id: string): string {
  const cached = binaries.get(id);
  if (cached) return cached;
  const example = examples.find((item) => item.id === id)!;
  const source = join(directory, `${id}.cpp`);
  const binary = join(directory, id);
  writeFileSync(source, example.code);
  const compilation = spawnSync('g++', ['-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror', source, '-o', binary], { encoding: 'utf8', timeout: 30_000 });
  expect(compilation.error, `${id}: compilador indisponível`).toBeUndefined();
  expect(compilation.status, `${id}: ${compilation.stderr}`).toBe(0);
  binaries.set(id, binary);
  return binary;
}

function run(id: string, stdin: string): string {
  const execution = spawnSync(getBinary(id), [], { input: stdin, encoding: 'utf8', timeout: 3_000 });
  expect(execution.error, id).toBeUndefined();
  expect(execution.status, `${id}: ${execution.stderr}`).toBe(0);
  return execution.stdout;
}

describe('programas independentes C++17', () => {
  it.each(examples)('$id compila sem avisos e produz a saída do exemplo', (example) => {
    expect(run(example.id, example.stdin)).toBe(example.expectedOutput);
  });

  it.each([
    ['bubble-sort', '0\n', '\n'],
    ['bubble-sort', '5\n3 -1 3 -2 0\n', '-2 -1 0 3 3\n'],
    ['merge-sort', '0\n', '\n'],
    ['merge-sort', '5\n3 -1 3 -2 0\n', '-2 -1 0 3 3\n'],
    ['binary-search', '0\n9\n', '-1\n'],
    ['binary-search', '3\n1 3 5\n4\n', '-1\n'],
    ['two-pointers', '1 10\n5\n', '-1\n'],
    ['two-pointers', '2 10\n5 5\n', '0 1\n'],
    ['two-sum', '1 10\n5\n', '-1\n'],
    ['two-sum', '2 10\n5 5\n', '0 1\n'],
    ['segment-tree', '1\n3000000000\n2\n1 1\n1 1\n', '3000000000\n3000000000\n'],
    ['bfs-shortest-path', '3 1\n1 2\n1 3\n', '-1\n'],
    ['bfs-shortest-path', '1 0\n1 1\n', '0\n1\n'],
    ['dfs', '3 1\n1 2\n3\n', '3\n'],
    ['dijkstra', '3 1\n1 2 4\n1 3\n', '-1\n'],
    ['dijkstra', '3 2\n1 2 3000000000\n2 3 4000000000\n1 3\n', '7000000000\n1 2 3\n'],
    ['dijkstra', '2 1\n1 2 0\n1 2\n', '0\n1 2\n'],
    ['kruskal', '3 1\n1 2 -4\n', 'IMPOSSIVEL\n'],
    ['kruskal', '1 0\n', '0\n'],
    ['topological-sort', '3 3\n1 2\n2 3\n3 1\n', 'CICLO\n'],
    ['topological-sort', '3 0\n', '1 2 3\n'],
    ['knapsack', '1 4\n2 3\n', '3\n'],
    ['knapsack', '2 0\n1 100\n2 200\n', '0\n'],
    ['sieve', '0\n', '\n'],
    ['sieve', '1\n', '\n'],
    ['sieve', '2\n', '2\n'],
    ['greedy-activity', '3\n-5 -3\n-3 -1\n-4 0\n', '2\n1 2\n'],
    ['greedy-activity', '0\n', '0\n\n'],
    ['backtracking-subsets', '0\n', '{}\n'],
    ['kmp', 'abc\n\n', '0\n'],
    ['kmp', 'a\nabc\n', '-1\n'],
    ['kmp', 'aaaaab\naaab\n', '2\n'],
    ['kmp', 'ola mundo\n mundo\n', '3\n'],
    ['max-flow', '3 1 1 3\n1 2 7\n', '0\n'],
    ['max-flow', '2 3 1 2\n1 2 3\n1 2 4\n2 1 8\n', '7\n'],
    ['max-flow', '1 0 1 1\n', '0\n'],
    ['prefix-sum', '3\n-2 5 -1\n2\n1 3\n2 3\n', '2\n4\n'],
    ['sliding-window', '3 2\n-5 -2 -4\n', '-6\n'],
    ['sliding-window', '2 3\n1 2\n', 'IMPOSSIVEL\n'],
    ['fenwick-tree', '1 3\n3000000000\n2 1 1\n1 1 -7\n2 1 1\n', '3000000000\n2999999993\n'],
    ['lis', '4\n2 2 2 2\n', '1\n'],
    ['lis', '0\n', '0\n'],
    ['zero-one-bfs', '3 1\n1 2 0\n1 3\n', '-1\n'],
    ['zero-one-bfs', '4 5\n1 2 1\n1 3 0\n3 2 0\n2 4 0\n3 4 1\n1 4\n', '0\n'],
    ['binary-exponentiation', '2 0 1\n', '0\n'],
    ['binary-exponentiation', '-2 3 5\n', '2\n'],
    ['binary-exponentiation', '9000000000000000000 2 9000000000000000001\n', '1\n'],
    ['euclidean-gcd', '0 0\n', '0\n'],
    ['euclidean-gcd', '0 18\n', '18\n'],
  ])('%s trata a entrada de borda %#', (id, stdin, expected) => {
    expect(run(id, stdin)).toBe(expected);
  });
});

describe.runIf(process.env.RUNSPECT_TEST_AUTOMATIC === '1')('visualização automática do catálogo', () => {
  it.each(examples)('$id mantém a saída ao ser instrumentado e produz eventos visuais', (example) => {
    const backend = resolve(process.cwd(), '../backend');
    const source = join(directory, `${example.id}-automatic.cpp`);
    writeFileSync(source, example.code);
    const runtime = process.env.RUNSPECT_CLANG_RUNTIME ?? join(backend, '.runtime/clang');
    const args = ['-B', join(backend, 'pkg/visualizer/instrument_cpp.py'), source];
    if (existsSync(runtime)) args.push('--runtime', runtime);
    const analysis = spawnSync('/usr/bin/python3', args, { encoding: 'utf8', timeout: 30_000 });
    expect(analysis.status, `${example.id}: ${analysis.stderr}`).toBe(0);
    expect(JSON.parse(analysis.stdout).mode).toBe('automatic');

    const binary = join(directory, `${example.id}-automatic`);
    const compilation = spawnSync('g++', ['-std=c++17', '-O0', '-I', join(backend, 'pkg/visualizer'), source, '-o', binary], { encoding: 'utf8', timeout: 30_000 });
    expect(compilation.status, `${example.id}: ${compilation.stderr}`).toBe(0);
    const execution = spawnSync(binary, [], { input: example.stdin, encoding: 'utf8', timeout: 3_000, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
    expect(execution.status, `${example.id}: ${execution.stderr}`).toBe(0);
    expect(execution.stdout).toBe(example.expectedOutput);
    const events = String(execution.output[3]).trim().split('\n').map((line) => JSON.parse(line) as { step_event: string });
    expect(events.some((event) => ['VECTOR_INIT', 'ADD_NODE', 'SET_MATRIX', 'SET_STRUCT'].includes(event.step_event)), example.id).toBe(true);
    if (example.category === 'Grafos') expect(events.some((event) => event.step_event === 'ADD_EDGE'), example.id).toBe(true);
  });
});
