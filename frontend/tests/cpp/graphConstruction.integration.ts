import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildGraphState, frameEnds, isDirected } from '../../src/lib/graphReducer';
import type { TraceStep } from '../../src/types/visualizer';

let directory: string;
let serial = 0;
beforeAll(() => { directory = mkdtempSync(join(tmpdir(), 'runspect-graph-')); });
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function run(body: string): TraceStep[] {
  const backend = resolve(process.cwd(), '../backend');
  const source = join(directory, `${serial++}.cpp`);
  const binary = `${source}.bin`;
  writeFileSync(source, `#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n${body}\n}`);
  const analysis = spawnSync('/usr/bin/python3', [
    '-B', join(backend, 'pkg/visualizer/instrument_cpp.py'), source,
    '--runtime', process.env.RUNSPECT_CLANG_RUNTIME ?? join(backend, '.runtime/clang'),
  ], { encoding: 'utf8', timeout: 30_000 });
  expect(analysis.status, analysis.stderr).toBe(0);
  const compilation = spawnSync('g++', [
    '-std=c++17', '-O0', '-I', join(backend, 'pkg/visualizer'), source, '-o', binary,
  ], { encoding: 'utf8', timeout: 30_000 });
  expect(compilation.status, compilation.stderr).toBe(0);
  const execution = spawnSync(binary, [], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
  expect(execution.status, execution.stderr).toBe(0);
  return String(execution.output[3]).trim().split('\n').map((line, step) => {
    const { step_event, ...data } = JSON.parse(line);
    return { step_event, step, data };
  });
}

describe('automatic graph construction', () => {
  it.each([
    ['unweighted', 'vector<vector<int>> adj(4);', 'adj[u].push_back(v);\n adj[v].push_back(u);'],
    ['weighted', 'vector<vector<pair<int,int>>> adj(4);', 'adj[u].push_back({v,7});\n adj[v].push_back({u,7});'],
    ['emplace', 'vector<vector<pair<int,int>>> adj(4);', 'adj[u].emplace_back(v,7);\n adj[v].emplace_back(u,7);'],
    ['make_pair', 'vector<vector<pair<int,int>>> adj(4);', 'adj[u].push_back(make_pair(v,7));\n adj[v].push_back(make_pair(u,7));'],
  ])('never shows arrows or duplicate edges between %s reverse writes', (_name, declaration, writes) => {
    const steps = run(`${declaration}\nfor (int u=0; u<3; ++u) { int v=u+1;\n${writes}\n}`);
    const visible = frameEnds(steps).map(index => ({
      directed: isDirected(steps, index),
      graph: buildGraphState(steps, index, isDirected(steps, index), false),
    })).filter(frame => frame.graph.edges.length);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every(frame => !frame.directed)).toBe(true);
    expect(visible.at(-1)!.graph.edges).toHaveLength(3);
    for (const frame of visible) {
      const pairs = frame.graph.edges.map(edge => [edge.source, edge.target].sort().join(':'));
      expect(new Set(pairs).size).toBe(pairs.length);
    }
    // The execution frame for each original insertion is still present.
    const lines = steps.filter(step => step.step_event === 'STEP').map(step => step.data?.line);
    expect(lines).toContain(6);
    expect(lines).toContain(7);
  });

  it('keeps single adjacency writes directed', () => {
    const steps = run('vector<vector<int>> adj(3);\nadj[0].push_back(1);\nadj[1].push_back(2);');
    const end = steps.length - 1;
    expect(isDirected(steps, end)).toBe(true);
    expect(buildGraphState(steps, end, true, false).edges).toHaveLength(2);
  });

  it('does not combine opposite arcs with different weights', () => {
    const steps = run('vector<vector<pair<int,int>>> adj(2);\nadj[0].push_back({1,3});\nadj[1].push_back({0,7});');
    const end = steps.length - 1;
    expect(isDirected(steps, end)).toBe(true);
    expect(buildGraphState(steps, end, true, false).edges.map(edge => edge.weight)).toEqual([3, 7]);
  });

  it('observes writes in separate branches without assuming both execute', () => {
    const steps = run('vector<vector<int>> adj(2);\nif (true) adj[0].push_back(1);\nif (false) adj[1].push_back(0);');
    expect(isDirected(steps)).toBe(true);
    expect(buildGraphState(steps, steps.length - 1, true, false).edges).toHaveLength(1);
  });
});
