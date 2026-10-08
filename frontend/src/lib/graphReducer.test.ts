import { describe, expect, it } from 'vitest';
import { buildGraphState, frameEnds } from './graphReducer';
import type { TraceStep } from '@/types/visualizer';

const event = (step_event: string, data: TraceStep['data']): TraceStep => ({ step: 0, step_event, data });
const numbered = (events: TraceStep[]): TraceStep[] => events.map((item, i) => ({ ...item, step: i + 1 }));

const base = [
  event('ADD_NODE', { id: 1, label: '1' }),
  event('ADD_NODE', { id: 2, label: '2' }),
  event('ADD_EDGE', { u: 1, v: 2, weight: 3 }),
];

describe('graphReducer semantic events', () => {
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