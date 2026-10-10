import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildGraphState, frameEnds, isDirected } from '../../src/lib/graphReducer';
import { buildVectorsState } from '../../src/lib/vectorReducer';
import { buildTraceState, createTraceReplay } from '../../src/lib/traceState';
import type { TraceStep } from '../../src/types/visualizer';

const backend = resolve(process.cwd(), '../backend');
const fixture = readFileSync(join(backend, 'internal/runner/testdata/kuhn_difference.cpp'), 'utf8');
const requiredInput = readFileSync(join(backend, 'internal/runner/testdata/kuhn_difference.in'), 'utf8');
const binaries = new Map<string, string>();
let directory: string;
beforeAll(() => { directory = mkdtempSync(join(tmpdir(), 'runspect-evolution-')); });
afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

function execute(code: string, input = '') {
  let binary = binaries.get(code);
  if (!binary) {
    const source = join(directory, `${binaries.size}.cpp`);
    binary = `${source}.bin`;
    writeFileSync(source, code);
    const runtime = process.env.RUNSPECT_CLANG_RUNTIME ?? join(backend, '.runtime/clang');
    const args = ['-B', join(backend, 'pkg/visualizer/instrument_cpp.py'), source];
    if (existsSync(runtime)) args.push('--runtime', runtime);
    const analysis = spawnSync('/usr/bin/python3', args, { encoding: 'utf8', timeout: 30_000 });
    expect(analysis.status, analysis.stderr).toBe(0);
    expect(JSON.parse(analysis.stdout).mode).toBe('automatic');
    const compilation = spawnSync('g++', ['-std=c++17', '-O0', '-I', join(backend, 'pkg/visualizer'), source, '-o', binary], { encoding: 'utf8', timeout: 30_000 });
    expect(compilation.status, compilation.stderr).toBe(0);
    binaries.set(code, binary);
  }
  const execution = spawnSync(binary, [], { input, encoding: 'utf8', timeout: 3_000, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
  expect(execution.status, execution.stderr).toBe(0);
  const steps: TraceStep[] = String(execution.output[3]).trim().split('\n').filter(Boolean).map((line, step) => {
    const { step_event, ...data } = JSON.parse(line);
    return { step, step_event, data };
  });
  return { steps, output: execution.stdout };
}

function frameOnLine(steps: TraceStep[], code: string, statement: string) {
  const line = code.split('\n').findIndex(text => text.includes(statement)) + 1;
  const frame = frameEnds(steps).find(index => steps[index].data?.line === line);
  expect(frame, `Nenhum quadro para a linha ${line}: ${statement}`).toBeDefined();
  return frame!;
}

function values(steps: TraceStep[], index: number, name: string) {
  const state = buildVectorsState(steps, index);
  expect(state.issues).toEqual([]);
  return state.vectors.find(vector => vector.name === name)?.items.map(item => item.value);
}

describe('evolução da captura automática', () => {
  it('caso obrigatório conserva A/B, assign global e saída 2', () => {
    const { steps, output } = execute(fixture, requiredInput);
    expect(output).toBe('2\n');
    const beforeMatching = frameOnLine(steps, fixture, 'int mt = 0;');
    expect(values(steps, beforeMatching, 'par')).toEqual([-1]);
    expect(values(steps, beforeMatching, 'visited')).toEqual([0]);
    const structs = steps.slice(0, beforeMatching + 1).filter(step => step.step_event === 'SET_STRUCT');
    expect(structs.findLast(step => step.data?.name === 'A')?.data?.items).toEqual(['(1, 2)']);
    expect(structs.findLast(step => step.data?.name === 'B')?.data?.items).toEqual(['(3, 4)']);
    expect(structs.findLast(step => step.data?.name === 's1')?.data).toMatchObject({ kind: 'set', size: 5, initialized: true });
    const scalars = structs.findLast(step => step.data?.name === 'Variáveis')?.data?.items ?? [];
    expect(scalars).toContain('k = 1');
    expect(scalars).toContain('mt = 0');
    const graph = buildGraphState(steps, beforeMatching, isDirected(steps, beforeMatching), false);
    expect(graph.edges).toHaveLength(0);
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(values(steps, steps.length - 1, 'par')).toEqual([-1]);
    const state = buildTraceState(steps, beforeMatching);
    expect(state.structs.find(structure => structure.name === 'A')?.items).toEqual(['(1, 2)']);
    expect(state.vectorMeta.par).toMatchObject({ initialized: true, size: 1 });
    const replay = createTraceReplay(steps);
    replay(steps.length - 1);
    expect(replay(beforeMatching)).toEqual(state);
  });

  it('Kuhn reencaminha um par ao encontrar caminho aumentante', () => {
    const { steps, output } = execute(fixture, '4 2 2\n1 2\n1 3\n1 4\n2 4\n');
    expect(output).toBe('2\n');
    expect(values(steps, steps.length - 1, 'par')).toEqual([1, 0]);
    const calls = steps.filter(step => step.step_event === 'CALL_ENTER' && step.data?.function === 'dfs');
    expect(calls.some(step => calls.some(parent => parent.data?.id === step.data?.parent))).toBe(true);
  });

  it('assign local já aparece no quadro da próxima declaração', () => {
    const code = '#include <bits/stdc++.h>\nusing namespace std;\nint main() {\nvector<int> par, visited;\npar.assign(1,-1);\nvisited.assign(1,0);\nint marker=7;\ncout << marker;\n}\n';
    const { steps, output } = execute(code);
    expect(output).toBe('7');
    const index = frameOnLine(steps, code, 'int marker=7;');
    expect(values(steps, index, 'par')).toEqual([-1]);
    expect(values(steps, index, 'visited')).toEqual([0]);
  });

  it('retornos recursivos restauram a variável homônima do chamador', () => {
    const code = `#include <bits/stdc++.h>
using namespace std;
int branch(int depth) {
    vector<int> local{depth};
    if (depth == 0) return local[0];
    int child = branch(depth - 1);
    local[0] += child;
    return local[0];
}
int main() {
    vector<int> local{99};
    set<int> keys{5};
    vector<pair<int,int>> pairs{{3,4}};
    map<int,string> labels{{1,"one"}};
    vector<vector<int>> grid{{7}};
    int result = branch(3);
    cout << result << ' ' << local[0];
}
`;
    const { steps, output } = execute(code);
    expect(output).toBe('6 99');
    expect(values(steps, steps.length - 1, 'local')).toEqual([99]);
    expect(values(steps, steps.length - 1, 'keys')).toEqual([5]);
    const stack: unknown[] = [];
    for (const step of steps) {
      if (step.step_event === 'CALL_ENTER') {
        expect(step.data?.parent).toBe(stack.at(-1) ?? null);
        stack.push(step.data?.id);
      } else if (step.step_event === 'CALL_EXIT') {
        expect(step.data?.id).toBe(stack.pop());
      }
    }
    expect(stack).toEqual([]);
    expect(steps.filter(step => step.step_event === 'CALL_ENTER' && step.data?.function === 'branch')).toHaveLength(4);
    const replay = buildTraceState(steps);
    expect(replay.calls.every(call => call.status === 'returned')).toBe(true);
    expect(replay.calls.filter(call => call.function === 'branch')).toHaveLength(4);
    expect(replay.structs.find(structure => structure.name === 'pairs')?.items).toEqual(['(3, 4)']);
    expect(replay.structs.find(structure => structure.name === 'labels')?.items).toEqual(['1 → one']);
    expect(replay.matrices.find(matrix => matrix.name === 'grid')?.rows).toEqual([['7']]);
  });

  it('mantém índices 2D com incremento único e metadata DP', () => {
    const code = `#include <bits/stdc++.h>
using namespace std;
int main() {
    vector<vector<int>> grid{{1,2},{3,4}};
    vector<vector<int>> dp{{1,2},{3,0}};
    int i=0, j=0;
    grid[i++][j++]=9;
    dp[1][1]=dp[0][1]+dp[1][0];
    cout << grid[0][0] << ' ' << i << ' ' << j << ' ' << dp[1][1];
}
`;
    const { steps, output } = execute(code);
    expect(output).toBe('9 1 1 5');
    expect(steps.findLast(step => step.step_event === 'SET_MATRIX' && step.data?.name === 'grid')?.data).toMatchObject({ rows: [['9', '2'], ['3', '4']], kind: 'matrix', size: 4, shape: { rows: 2, cols: 2 }, initialized: true });
    expect(steps.findLast(step => step.step_event === 'SET_MATRIX' && step.data?.name === 'dp')?.data).toMatchObject({ kind: 'dp', rows: [['1', '2'], ['3', '5']] });
    expect(steps.some(step => step.step_event === 'MATRIX_ACCESS' && step.data?.name === 'grid' && step.data?.row === 0 && step.data?.col === 0 && step.data?.access === 'write')).toBe(true);
  });

  it('preserva inteiros exatos e distingue coleções STL', () => {
    const code = `#include <bits/stdc++.h>
using namespace std;
int main() {
    vector<long long> large{9007199254740993LL};
    __int128 giant=(static_cast<__int128>(1)<<100)+123;
    vector<__int128> enormous{giant};
    multiset<int> repeated{2,2,3};
    map<int,string> mapping{{7,"sete"}};
    stack<int> pending; pending.push(4);
    queue<int> fifo; fifo.push(5);
    deque<int> both{6,7};
    priority_queue<int> heap; heap.push(8);
    pair<int,int> edge{1,2};
    tuple<int,string> record{3,"três"};
    cout << large[0];
}
`;
    const { steps, output } = execute(code);
    expect(output).toBe('9007199254740993');
    const large = buildVectorsState(steps, steps.length - 1).vectors.find(vector => vector.name === 'large');
    expect(large?.items[0].displayValue).toBe('9007199254740993');
    const enormous = buildVectorsState(steps, steps.length - 1).vectors.find(vector => vector.name === 'enormous');
    expect(enormous?.items[0].displayValue).toBe('1267650600228229401496703205499');
    for (const [name, kind, size] of [['repeated', 'multiset', 3], ['mapping', 'map', 1], ['pending', 'stack', 1], ['fifo', 'queue', 1], ['both', 'deque', 2], ['heap', 'priority_queue', 1], ['edge', 'pair', 2], ['record', 'tuple', 2]]) {
      expect(steps.findLast(step => ['SET_STRUCT', 'VECTOR_META'].includes(step.step_event) && step.data?.name === name)?.data, String(name)).toMatchObject({ kind, size, initialized: true });
    }
  });

  it('distingue variável não inicializada de contêiner vazio', () => {
    const code = `#include <bits/stdc++.h>
using namespace std;
int main() {
    int unready;
    vector<int> empty;
    int marker=0;
    unready=7;
    cout << unready;
}
`;
    const { steps, output } = execute(code);
    expect(output).toBe('7');
    const frame = frameOnLine(steps, code, 'int marker=0;');
    const state = buildTraceState(steps, frame);
    expect(state.structs.find(structure => structure.name === 'unready')).toMatchObject({ initialized: false, items: [] });
    expect(state.vectorMeta.empty).toMatchObject({ initialized: true, size: 0 });
    expect(values(steps, frame, 'empty')).toEqual([]);
  });
});
