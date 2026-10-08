import { describe, expect, it } from 'vitest';
import { buildVectorsState } from './vectorReducer';
import type { TraceStep } from '@/types/visualizer';

const event = (step_event: string, data: TraceStep['data']): TraceStep => ({ step: 0, step_event, data });
const numbered = (events: TraceStep[]): TraceStep[] => events.map((item, i) => ({ ...item, step: i + 1 }));
const vectorAt = (steps: TraceStep[], at: number) => buildVectorsState(steps, at).vectors[0];
const valuesAt = (steps: TraceStep[], at: number) => vectorAt(steps, at).items.map((item) => item.value);
const statesAt = (steps: TraceStep[], at: number) => vectorAt(steps, at).items.map((item) => item.state);

describe('vectorReducer', () => {
  const sortSteps = numbered([
    event('VECTOR_INIT', { name: 'a', values: [2, -1, 2] }),
    event('VECTOR_COMPARE', { name: 'a', a: 0, b: 1, caption: 'comparando' }),
    event('VECTOR_STEP', { name: 'a' }),
    event('VECTOR_SWAP', { name: 'a', a: 0, b: 1, caption: 'trocando' }),
    event('VECTOR_STEP', { name: 'a' }),
    event('VECTOR_MARK', { name: 'a', index: 0, state: 'sorted' }),
    event('VECTOR_STEP', { name: 'a', caption: 'fim' }),
  ]);

  it('reconstrói qualquer etapa, para frente e para trás', () => {
    expect(valuesAt(sortSteps, 6)).toEqual([-1, 2, 2]);
    expect(valuesAt(sortSteps, 0)).toEqual([2, -1, 2]);
    expect(valuesAt(sortSteps, 2)).toEqual([2, -1, 2]);
    expect(valuesAt(sortSteps, 3)).toEqual([-1, 2, 2]);
    expect(valuesAt(sortSteps, 6)).toEqual([-1, 2, 2]);
  });

  it('mantém os valores originais no snapshot', () => {
    expect(vectorAt(sortSteps, 6).initial).toEqual([2, -1, 2]);
  });

  it('comparação vale somente até o próximo evento após o quadro', () => {
    expect(statesAt(sortSteps, 1)).toEqual(['comparing', 'comparing', 'default']);
    expect(statesAt(sortSteps, 2)).toEqual(['comparing', 'comparing', 'default']);
    expect(vectorAt(sortSteps, 3).operation).toEqual({ kind: 'swap', a: 0, b: 1 });
    expect(statesAt(sortSteps, 3)).toEqual(['swapping', 'swapping', 'default']);
  });

  it('marca ordenado depois de limpar a operação anterior', () => {
    expect(vectorAt(sortSteps, 5).operation).toBeNull();
    expect(statesAt(sortSteps, 5)).toEqual(['sorted', 'default', 'default']);
    expect(vectorAt(sortSteps, 6).caption).toBe('fim');
  });

  it('aplica pivô, intervalo e limpa o pivô com índice -1', () => {
    const steps = numbered([
      event('VECTOR_INIT', { name: 'a', values: [3, 1, 2] }),
      event('VECTOR_RANGE', { name: 'a', begin: 1, end: 2 }),
      event('VECTOR_PIVOT', { name: 'a', index: 2 }),
      event('VECTOR_MARK', { name: 'a', index: 0, state: 'sorted' }),
      event('VECTOR_PIVOT', { name: 'a', index: -1 }),
    ]);
    expect(statesAt(steps, 3)).toEqual(['sorted', 'active', 'pivot']);
    expect(vectorAt(steps, 3).pivot).toBe(2);
    expect(vectorAt(steps, 3).range).toEqual({ start: 1, end: 2 });
    expect(statesAt(steps, 4)).toEqual(['sorted', 'active', 'active']);
    expect(vectorAt(steps, 4).pivot).toBeNull();
  });

  it('limpa o intervalo quando início é maior que fim', () => {
    const steps = numbered([
      event('VECTOR_INIT', { name: 'a', values: [1, 2, 3] }),
      event('VECTOR_RANGE', { name: 'a', begin: 0, end: 2 }),
      event('VECTOR_RANGE', { name: 'a', begin: 2, end: 1 }),
    ]);
    expect(vectorAt(steps, 1).range).toEqual({ start: 0, end: 2 });
    expect(vectorAt(steps, 2).range).toBeNull();
  });

  it('descarta intervalos e prioriza descartados sobre o intervalo ativo', () => {
    const steps = numbered([
      event('VECTOR_INIT', { name: 'a', values: [1, 2, 3, 4] }),
      event('VECTOR_RANGE', { name: 'a', begin: 0, end: 3 }),
      event('VECTOR_DISCARD', { name: 'a', begin: 0, end: 1 }),
    ]);
    expect(statesAt(steps, 2)).toEqual(['discarded', 'discarded', 'active', 'active']);
  });

  it('consulta um índice e marca como encontrado', () => {
    const steps = numbered([
      event('VECTOR_INIT', { name: 'a', values: [1, 3, 5] }),
      event('VECTOR_PROBE', { name: 'a', index: 1 }),
      event('VECTOR_STEP', { name: 'a' }),
      event('VECTOR_MARK', { name: 'a', index: 1, state: 'found' }),
    ]);
    expect(statesAt(steps, 1)).toEqual(['default', 'comparing', 'default']);
    expect(statesAt(steps, 3)).toEqual(['default', 'found', 'default']);
  });

  it('escreve valores e marca a posição como ativa', () => {
    const steps = numbered([
      event('VECTOR_INIT', { name: 'dp', values: [0, 0, 0] }),
      event('VECTOR_SET', { name: 'dp', index: 1, value: 9, caption: 'dp[1] = 9' }),
    ]);
    expect(valuesAt(steps, 1)).toEqual([0, 9, 0]);
    expect(vectorAt(steps, 1).operation).toEqual({ kind: 'set', index: 1, value: 9 });
    expect(statesAt(steps, 1)).toEqual(['default', 'active', 'default']);
  });

  it('reset limpa marcas, intervalo, pivô e legenda sem alterar valores', () => {
    const steps = numbered([
      event('VECTOR_INIT', { name: 'a', values: [4, 5] }),
      event('VECTOR_MARK', { name: 'a', index: 0, state: 'sorted' }),
      event('VECTOR_RANGE', { name: 'a', begin: 0, end: 1, caption: 'x' }),
      event('VECTOR_PIVOT', { name: 'a', index: 1 }),
      event('VECTOR_RESET', { name: 'a' }),
    ]);
    expect(statesAt(steps, 4)).toEqual(['default', 'default']);
    expect(vectorAt(steps, 4).caption).toBe('');
    expect(valuesAt(steps, 4)).toEqual([4, 5]);
  });

  it('um STEP de grafo também encerra a operação do quadro', () => {
    const steps = numbered([
      event('VECTOR_INIT', { name: 'a', values: [1, 2] }),
      event('VECTOR_COMPARE', { name: 'a', a: 0, b: 1 }),
      event('STEP', { caption: 'quadro' }),
      event('VECTOR_MARK', { name: 'a', index: 0, state: 'sorted' }),
    ]);
    expect(vectorAt(steps, 2).operation).not.toBeNull();
    expect(vectorAt(steps, 3).operation).toBeNull();
  });

  it('reinicializa um vetor existente mantendo a ordem de exibição', () => {
    const steps = numbered([
      event('VECTOR_INIT', { name: 'a', values: [1] }),
      event('VECTOR_INIT', { name: 'b', values: [2] }),
      event('VECTOR_INIT', { name: 'a', values: [] }),
    ]);
    const state = buildVectorsState(steps, 2);
    expect(state.vectors.map((vector) => vector.name)).toEqual(['a', 'b']);
    expect(state.vectors[0].items).toEqual([]);
  });

  it('aceita vetor vazio, repetidos e negativos', () => {
    const empty = buildVectorsState(numbered([event('VECTOR_INIT', { name: 'a', values: [] })]), 0);
    expect(empty.vectors[0].items).toEqual([]);
    expect(empty.issues).toEqual([]);

    const mixed = numbered([event('VECTOR_INIT', { name: 'a', values: [-5, 7, -5, 7, 0] })]);
    expect(valuesAt(mixed, 0)).toEqual([-5, 7, -5, 7, 0]);
  });

  it('reporta eventos inválidos sem alterar o estado', () => {
    const steps = numbered([
      event('VECTOR_SWAP', { name: 'x', a: 0, b: 1 }),
      event('VECTOR_INIT', { name: 'a', values: [1, 2] }),
      event('VECTOR_SWAP', { name: 'a', a: 0, b: 5 }),
      event('VECTOR_MARK', { name: 'a', index: 0, state: 'invalido' }),
      event('VECTOR_FOO', { name: 'a' }),
      event('VECTOR_MARK', { index: 0, state: 'sorted' }),
    ]);
    const state = buildVectorsState(steps, 5);
    expect(state.issues.map((issue) => issue.event)).toEqual([0, 2, 3, 4, 5]);
    expect(state.vectors[0].items.map((item) => item.value)).toEqual([1, 2]);
    expect(state.vectors[0].items.map((item) => item.state)).toEqual(['default', 'default']);
  });

  it('rejeita valores e intervalos incompletos', () => {
    const steps = numbered([
      event('VECTOR_INIT', { name: 'a', values: [1, 2, 3] }),
      event('VECTOR_INIT', { name: 'b', values: 'texto' }),
      event('VECTOR_RANGE', { name: 'a', begin: 0 }),
      event('VECTOR_RANGE', { name: 'a', begin: 0, end: 9 }),
      event('VECTOR_DISCARD', { name: 'a', begin: -1, end: 1 }),
      event('VECTOR_SET', { name: 'a', index: 1 }),
    ]);
    const state = buildVectorsState(steps, 5);
    expect(state.issues).toHaveLength(5);
    expect(state.vectors).toHaveLength(1);
  });

  it('detecta divergência entre resultado emitido e estado reconstruído', () => {
    const steps = numbered([
      event('VECTOR_INIT', { name: 'a', values: [2, 1] }),
      event('VECTOR_RESULT', { name: 'a', values: [1, 2] }),
    ]);
    const state = buildVectorsState(steps, 1);
    expect(state.issues[0].reason).toMatch(/diverge/);
    expect(state.vectors[0].result).toEqual([1, 2]);
  });

  it('aceita resultado consistente', () => {
    const steps = numbered([
      event('VECTOR_INIT', { name: 'a', values: [2, 1] }),
      event('VECTOR_SWAP', { name: 'a', a: 0, b: 1 }),
      event('VECTOR_RESULT', { name: 'a', values: [1, 2] }),
    ]);
    expect(buildVectorsState(steps, 2).issues).toEqual([]);
  });

  it('lida com vetores grandes', () => {
    const values = Array.from({ length: 5000 }, (_, i) => i);
    const steps = numbered([
      event('VECTOR_INIT', { name: 'a', values }),
      event('VECTOR_SWAP', { name: 'a', a: 0, b: 4999 }),
    ]);
    const state = buildVectorsState(steps, 1);
    expect(state.vectors[0].items).toHaveLength(5000);
    expect(state.vectors[0].items[0].value).toBe(4999);
  });

  it('ignora eventos de outras famílias e lista vazia de passos', () => {
    expect(buildVectorsState([], 0).vectors).toEqual([]);
    const steps = numbered([event('ADD_NODE', { id: 1, label: 'a' }), event('PRINT', { message: 'x' })]);
    expect(buildVectorsState(steps, 1)).toEqual({ vectors: [], issues: [] });
  });
});