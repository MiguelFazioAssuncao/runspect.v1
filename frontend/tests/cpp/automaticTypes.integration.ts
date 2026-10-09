import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { examples } from '../../src/lib/examples';
import { buildVectorsState, createVectorReplay } from '../../src/lib/vectorReducer';
import { frameEnds } from '../../src/lib/graphReducer';
import { playerStartFrame } from '../../src/lib/playerStart';
import type { TraceStep } from '../../src/types/visualizer';

let directory: string;
beforeAll(() => { directory = mkdtempSync(join(tmpdir(), 'runspect-types-')); });
afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

function runExample(id: string): TraceStep[] {
  const example = examples.find((item) => item.id === id)!;
  const backend = resolve(process.cwd(), '../backend');
  const source = join(directory, `${id}.cpp`);
  const binary = join(directory, id);
  writeFileSync(source, example.code);
  const runtime = process.env.RUNSPECT_CLANG_RUNTIME ?? join(backend, '.runtime/clang');
  const args = ['-B', join(backend, 'pkg/visualizer/instrument_cpp.py'), source];
  if (existsSync(runtime)) args.push('--runtime', runtime);
  const analysis = spawnSync('/usr/bin/python3', args, { encoding: 'utf8', timeout: 30_000 });
  expect(analysis.status, analysis.stderr).toBe(0);
  expect(JSON.parse(analysis.stdout).mode).toBe('automatic');
  const compilation = spawnSync('g++', ['-std=c++17', '-O0', '-I', join(backend, 'pkg/visualizer'), source, '-o', binary], { encoding: 'utf8', timeout: 30_000 });
  expect(compilation.status, compilation.stderr).toBe(0);
  const execution = spawnSync(binary, [], { input: example.stdin, encoding: 'utf8', timeout: 3_000, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
  expect(execution.status, execution.stderr).toBe(0);
  expect(execution.stdout).toBe(example.expectedOutput);
  return String(execution.output[3]).trim().split('\n').map((line, step) => {
    const { step_event, ...data } = JSON.parse(line);
    return { step_event, step, data };
  });
}

describe('novos tipos no player automático', () => {
  it.each([
    ['binary-exponentiation', ['base = 65536', 'expoente = 0', 'modulo = 1000000007', 'resultado = 1024']],
    ['euclidean-gcd', ['a = 6', 'b = 0']],
  ])('%s inicia com valores escalares e conserva o resultado no último quadro', (id, expected) => {
    const steps = runExample(id);
    const frames = frameEnds(steps);
    const firstFrame = playerStartFrame(steps, frames, true);
    const start = steps.slice(0, frames[firstFrame] + 1).filter((step) => step.step_event === 'SET_STRUCT' && step.data?.name === 'Variáveis').at(-1);
    expect(start?.data?.items?.length).toBeGreaterThan(0);
    const final = steps.filter((step) => step.step_event === 'SET_STRUCT' && step.data?.name === 'Variáveis').at(-1);
    expect(final?.data?.items).toEqual(expected);
    expect(steps.some((step) => step.step_event === 'VECTOR_INIT' || step.step_event === 'ADD_NODE')).toBe(false);
    expect(steps.at(-1)?.data?.caption).toBe('Execução concluída');
  });
  it('reproduz alterações dos bits e permite voltar ao estado inicial', () => {
    const steps = runExample('bitset-switch');
    const end = buildVectorsState(steps, steps.length - 1);
    expect(end.issues).toEqual([]);
    const flags = end.vectors.find((vector) => vector.name === 'flags')!;
    expect(flags.items.map((item) => item.value)).toEqual([0, 0, 0, 1, 0, 0, 1, 0]);
    expect(flags.result).toEqual([0, 0, 0, 1, 0, 0, 1, 0]);
    const replay = createVectorReplay(steps);
    const start = steps.findIndex((step) => step.step_event === 'VECTOR_INIT' && step.data?.name === 'flags');
    replay(steps.length - 1);
    expect(replay(start).vectors.find((vector) => vector.name === 'flags')?.items.map((item) => item.value)).toEqual(Array(8).fill(0));
    const cases = steps.filter((step) => step.step_event === 'STEP' && step.data?.caption?.startsWith('Caso '));
    expect(cases.map((step) => step.data?.caption)).toEqual(['Caso 1', 'Caso 1', 'Caso 3', 'Caso 1']);
  });

  it('entrega tuplas e opcionais ao painel de estruturas, incluindo o estado vazio', () => {
    const steps = runExample('tuple-optional');
    const states = steps.filter((step) => step.step_event === 'SET_STRUCT' && step.data?.name === 'melhor');
    expect(states[0].data?.items).toEqual(['sem valor']);
    expect(states.at(-1)?.data?.items).toEqual(['valor = (0 = 3, 1 = 25)']);
    const records = steps.filter((step) => step.step_event === 'SET_STRUCT' && step.data?.name === 'registros');
    expect(records.at(-1)?.data?.items).toEqual(['(0 = 1, 1 = 12)', '(0 = 2, 1 = 8)', '(0 = 3, 1 = 25)', '(0 = 4, 1 = 20)']);
    expect(steps.at(-1)?.data?.caption).toBe('Execução concluída');
  });
});
