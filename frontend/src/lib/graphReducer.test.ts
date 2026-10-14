import { describe, expect, it } from 'vitest';
import { buildGraphState, createGraphFlagIndex, frameEnds, isDirected, isMulti, isWeighted } from './graphReducer';
import type { TraceStep } from '@/types/visualizer';

const event = (step_event: string, data: TraceStep['data']): TraceStep => ({ step: 0, step_event, data });
const numbered = (events: TraceStep[]): TraceStep[] => events.map((item, i) => ({ ...item, step: i + 1 }));

const base = [
  event('ADD_NODE', { id: 1, label: '1' }),
  event('ADD_NODE', { id: 2, label: '2' }),
  event('ADD_EDGE', { u: 1, v: 2, weight: 3 }),
];

describe('graphReducer semantic events', () => {
  it('indexed flags match replay semantics during backward and forward seeks', () => {
    const steps = numbered([
      event('ADD_NODE', { id: 1 }),
      event('SET_DIRECTED', { directed: false }),
      event('SET_WEIGHTED', { weighted: false }),
      event('STEP', {}),
      event('SET_MULTI', { multi: true }),
      event('SET_DIRECTED', { directed: true }),
      event('STEP', { directed: false }),
    ]);
    const flags = createGraphFlagIndex(steps);
    for (const index of [-1, 0, 1, 4, 6, 3, 2, 100, -1]) {
      expect(flags(index)).toEqual({ directed: isDirected(steps, index), weighted: isWeighted(steps, index), multi: isMulti(steps, index) });
    }
    expect(createGraphFlagIndex([])(0)).toEqual({ directed: true, weighted: true, multi: false });
  });
  it('aplica a última configuração até o quadro atual, sem antecipar eventos', () => {
    const steps = numbered([
      event('SET_DIRECTED', { directed: false }),
      event('SET_WEIGHTED', { weighted: false }),
      event('SET_MULTI', { multi: true }),
      event('SET_DIRECTED', { directed: true }),
      event('SET_WEIGHTED', { weighted: true }),
      event('SET_MULTI', { multi: false }),
    ]);
    expect(isDirected(steps, -1)).toBe(true);
    expect(isWeighted(steps, -1)).toBe(true);
    expect(isMulti(steps, -1)).toBe(false);
    expect(isDirected(steps, 2)).toBe(false);
    expect(isWeighted(steps, 2)).toBe(false);
    expect(isMulti(steps, 2)).toBe(true);
    expect(isDirected(steps)).toBe(true);
    expect(isWeighted(steps)).toBe(true);
    expect(isMulti(steps)).toBe(false);
  });

  it('usa o rótulo padrão quando add_node omite o texto', () => {
    expect(buildGraphState([event('ADD_NODE', { id: 7, label: '' })], 0, true, false).nodes[0].label).toBe('Node 7');
  });

  it('trata VECTOR_STEP como fim de quadro', () => {
    const steps = numbered([event('VECTOR_INIT', { name: 'a', values: [1] }), event('VECTOR_STEP', { name: 'a' }), event('VECTOR_MARK', { name: 'a', index: 0, state: 'sorted' })]);
    expect(frameEnds(steps)).toEqual([1, 2]);
  });

  it('aplica estados de nó', () => {
    const steps = numbered([...base, event('GRAPH_NODE', { id: 1, state: 'visiting' }), event('GRAPH_NODE', { id: 2, state: 'done' })]);
    const state = buildGraphState(steps, 4, true, false);
    expect(state.nodes[0].color).toBe('orange');
    expect(state.nodes[1].color).toBe('emerald');
  });

  it('aplica estados de aresta, incluindo removida tracejada', () => {
    const steps = numbered([...base, event('GRAPH_EDGE', { u: 1, v: 2, state: 'removed' })]);
    const edge = buildGraphState(steps, 3, true, false).edges[0];
    expect(edge.color).toBe('gray');
    expect(edge.style).toBe('dashed');
  });

  it('aplica valor, componente e caminho', () => {
    const steps = numbered([
      ...base,
      event('GRAPH_VALUE', { id: 1, text: 'd=0' }),
      event('GRAPH_COMPONENT', { id: 2, component: 1 }),
      event('GRAPH_PATH', { path: [1, 2] }),
    ]);
    const afterComponent = buildGraphState(steps, 4, true, false);
    expect(afterComponent.nodes[0].badge).toBe('d=0');
    expect(afterComponent.nodes[1].color).toBe('orange');
    const afterPath = buildGraphState(steps, 5, true, false);
    expect(afterPath.nodes.map((node) => node.color)).toEqual(['red', 'red']);
    expect(afterPath.edges[0].color).toBe('red');
  });

  it('reset restaura cores e preserva badges', () => {
    const steps = numbered([
      ...base,
      event('GRAPH_VALUE', { id: 1, text: 'x' }),
      event('GRAPH_NODE', { id: 1, state: 'done' }),
      event('GRAPH_RESET', undefined),
    ]);
    const state = buildGraphState(steps, 5, true, false);
    expect(state.nodes[0].color).toBe('#3b82f6');
    expect(state.nodes[0].badge).toBe('x');
  });

  it('destaca o caminho final em verde apenas a partir do evento de resultado', () => {
    const steps = numbered([...base, event('GRAPH_PATH', { path: [1, 2], color: 'green' })]);
    expect(buildGraphState(steps, 2, true, false).edges[0].color).toBe('#64748b');
    const state = buildGraphState(steps, 3, true, false);
    expect(state.nodes.map((node) => node.color)).toEqual(['green', 'green']);
    expect(state.edges[0].color).toBe('green');
    expect(state.edges[0].highlighted).toBe(true);
  });

  it('ignora estados desconhecidos e caminhos inválidos', () => {
    const steps = numbered([
      ...base,
      event('GRAPH_NODE', { id: 1, state: 'constructor' }),
      event('GRAPH_EDGE', { u: 1, v: 2, state: 'nada' }),
      event('GRAPH_PATH', { path: [1.5] }),
    ]);
    const state = buildGraphState(steps, 5, true, false);
    expect(state.nodes[0].color).toBe('#3b82f6');
    expect(state.edges[0].color).toBe('#64748b');
  });
});
