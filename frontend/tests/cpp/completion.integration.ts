import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { examples } from '../../src/lib/examples';
import { buildCppProgram } from '../../src/lib/cppTemplate';
import { buildVectorsState } from '../../src/lib/vectorReducer';
import { buildGraphState, isDirected } from '../../src/lib/graphReducer';
import type { TraceStep } from '../../src/types/visualizer';

let directory: string;
const binaries = new Map<string, string>();

beforeAll(() => { directory = mkdtempSync(join(tmpdir(), 'runspect-completion-')); });
afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

function run(code: string, stdin: string, output: string): TraceStep[] {
  let binary = binaries.get(code);
  if (!binary) {
    const backend = resolve(process.cwd(), '../backend');
    const source = join(directory, `${binaries.size}.cpp`);
    binary = join(directory, `${binaries.size}.bin`);
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
  const execution = spawnSync(binary, [], { input: stdin, encoding: 'utf8', timeout: 3_000, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
  expect(execution.status, execution.stderr).toBe(0);
  expect(execution.stdout).toBe(output);
  return String(execution.output[3]).trim().split('\n').map((line, step) => {
    const { step_event, ...data } = JSON.parse(line);
    return { step_event, step, data };
  });
}

function runExample(id: string, stdin?: string, output?: string) {
  const example = examples.find((item) => item.id === id)!;
  return run(example.code, stdin ?? example.stdin, output ?? example.expectedOutput);
}

const vectorsAtEnd = (steps: TraceStep[]) => buildVectorsState(steps, steps.length - 1);
const graphAtEnd = (steps: TraceStep[]) => buildGraphState(steps, steps.length - 1, isDirected(steps), false);

describe('cores de conclusão na visualização automática', () => {
  it('dist usa infinito para sentinelas sem esconder valores grandes válidos ou mudar a saída', () => {
    const steps = run(buildCppProgram(`    vector<vector<int>> adj{{1},{},{}};
    vector<ll> dist{0, numeric_limits<ll>::max(), -1};
    dist[1] = 7;
    dist[1] = numeric_limits<ll>::max();
    if (dist[1] == numeric_limits<ll>::max()) cout << "sem caminho";
    vector<ll> distance{0, numeric_limits<ll>::max()-1};
    const ll INF=1000000000;
    vector<ll> distancia{0, INF};
    vector<ll> dados{numeric_limits<ll>::max()};`), '', 'sem caminho');
    const end = vectorsAtEnd(steps);
    expect(end.issues).toEqual([]);
    expect(end.vectors.find((vector) => vector.name === 'dist')!.items.map((item) => item.displayValue)).toEqual([undefined, '∞', '∞']);
    expect(end.vectors.find((vector) => vector.name === 'distance')!.items[1].displayValue).toBe('9223372036854775806');
    expect(end.vectors.find((vector) => vector.name === 'distancia')!.items[1].displayValue).toBe('∞');
    expect(end.vectors.find((vector) => vector.name === 'dados')!.items[0].displayValue).toBe('9223372036854775807');
    const write = steps.findIndex((step) => step.step_event === 'VECTOR_SET' && step.data?.name === 'dist' && step.data?.value === 7);
    expect(buildVectorsState(steps, write).vectors.find((vector) => vector.name === 'dist')!.items[1].displayValue).toBeUndefined();
    expect(steps.some((step) => step.data?.caption === 'Atualiza dist[1] = ∞')).toBe(true);
    expect(steps.some((step) => step.data?.caption === 'Lê dist[1] = ∞')).toBe(true);
    expect(steps.filter((step) => step.step_event === 'VECTOR_RESULT' && step.data?.name === 'dist').at(-1)?.data?.value_labels).toEqual([null, '∞', '∞']);
  });

  it('busca binária preserva o encontrado após leituras posteriores', () => {
    const steps = runExample('binary-search');
    const state = vectorsAtEnd(steps);
    expect(state.issues).toEqual([]);
    expect(state.vectors.find((vector) => vector.name === 'a')!.items.map((item) => item.state)).toEqual(['default', 'default', 'default', 'default', 'default', 'found', 'default', 'default']);
    expect(steps.at(-1)?.data?.caption).toBe('Execução concluída');
  });

  it('busca ausente não pinta nenhum valor como encontrado', () => {
    const steps = runExample('binary-search', '3\n1 3 5\n4\n', '-1\n');
    expect(vectorsAtEnd(steps).vectors.flatMap((vector) => vector.items).some((item) => item.state === 'found')).toBe(false);
  });

  it('busca linear avalia o índice uma vez e preserva curto-circuito e retorno antecipado', () => {
    const steps = run(buildCppProgram(`    int a[]{4, 8}; int i=0;
    if (false && a[100] == 8) cout << "erro";
    while (i < 2) if (a[i++] == 8) { cout << i; return; }`), '', '2');
    expect(vectorsAtEnd(steps).vectors[0].items.map((item) => item.state)).toEqual(['default', 'found']);
    expect(steps.at(-1)?.data?.caption).toBe('Execução concluída');
  });

  it.each(['bubble-sort', 'merge-sort'])('%s termina com todo o vetor ordenado verde', (id) => {
    const steps = runExample(id);
    const state = vectorsAtEnd(steps);
    expect(state.issues).toEqual([]);
    const vector = state.vectors.find((item) => item.name === 'a')!;
    expect(vector.items.every((item) => item.state === 'sorted')).toBe(true);
    expect(vector.operation).toBeNull();
  });

  it('sort de vetor já ordenado também sinaliza conclusão', () => {
    const steps = run(buildCppProgram('    vector<int> a{1,2,3}; sort(a.begin(),a.end());'), '', '');
    expect(vectorsAtEnd(steps).vectors[0].items.every((item) => item.state === 'sorted')).toBe(true);
  });

  it.each(['bfs-shortest-path', 'dijkstra'])('%s mantém nós e arestas do caminho final verdes', (id) => {
    const steps = runExample(id);
    const graph = graphAtEnd(steps);
    const expected = id === 'dijkstra' ? [1, 3, 2, 4, 5] : [1, 2, 4, 5, 6, 7];
    expect(steps.filter((step) => step.step_event === 'GRAPH_PATH').at(-1)?.data?.path).toEqual(expected);
    expect(graph.nodes.filter((node) => node.color === 'green').map((node) => node.id).sort()).toEqual([...expected].sort());
    expect(graph.edges.filter((edge) => edge.color === 'green')).toHaveLength(expected.length - 1);
    expect(steps.at(-1)?.data?.caption).toContain('caminho encontrado');
  });

  it.each(['bfs-shortest-path', 'dijkstra'])('%s sem caminho mantém o destino sem destaque de sucesso', (id) => {
    const steps = runExample(id, id === 'dijkstra' ? '3 1\n1 2 4\n1 3\n' : '3 1\n1 2\n1 3\n', '-1\n');
    expect(steps.some((step) => step.step_event === 'GRAPH_PATH')).toBe(false);
    expect(graphAtEnd(steps).nodes.find((node) => node.id === 3)?.color).toBe('#3b82f6');
  });

  it('DFS conclui os vértices visitados', () => {
    const graph = graphAtEnd(runExample('dfs'));
    expect(graph.nodes.filter((node) => node.id > 0).every((node) => node.color === 'emerald')).toBe(true);
  });

  it('KMP preserva o padrão encontrado no quadro final', () => {
    const state = vectorsAtEnd(runExample('kmp'));
    expect(state.issues).toEqual([]);
    expect(state.vectors.flatMap((vector) => vector.items).some((item) => item.state === 'found')).toBe(true);
  });

  it('KMP sem correspondência não anuncia encontrado', () => {
    const state = vectorsAtEnd(runExample('kmp', 'aaaaab\naaac\n', '-1\n'));
    expect(state.vectors.flatMap((vector) => vector.items).some((item) => item.state === 'found')).toBe(false);
  });

  it('uma alteração posterior invalida o destaque do valor encontrado', () => {
    const steps = run(buildCppProgram('    vector<int> a{8}; if (a[0] == 8) a[0] = 3; cout << a[0];'), '', '3');
    expect(vectorsAtEnd(steps).vectors[0].items[0]).toMatchObject({ value: 3, state: 'default' });
  });

  it('consultas na mesma linha não encobrem uma busca com parênteses', () => {
    const steps = run(buildCppProgram('    vector<int> a{4,8}; int x=a[0]; if ((a[1] == 8)) cout << x;'), '', '4');
    expect(vectorsAtEnd(steps).vectors[0].items.map((item) => item.state)).toEqual(['default', 'found']);
  });

  it('sentinela INF e caminho com direção inválida não indicam sucesso', () => {
    const steps = run(buildCppProgram(`    vector<vector<int>> adj{{1},{},{}};
    const int INF=1000000000;
    vector<int> dist{0,1,INF};
    vector<int> caminho{1,0};`), '', '');
    const graph = graphAtEnd(steps);
    expect(graph.nodes.find((node) => node.id === 2)?.color).toBe('#3b82f6');
    expect(graph.nodes.some((node) => node.color === 'green')).toBe(false);
    expect(steps.some((step) => step.step_event === 'GRAPH_PATH')).toBe(false);
  });
});
