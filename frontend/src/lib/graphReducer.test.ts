import { describe, it, expect } from 'vitest';
import {
  buildGraphState,
  frameCaption,
  frameEnds,
  isDirected,
  isMulti,
  isWeighted,
} from './graphReducer';
import type { TraceStep } from '@/types/visualizer';

type Item = [string, TraceStep['data']?];

const seq = (...items: Item[]): TraceStep[] =>
  items.map(([step_event, data], step) => ({ step, step_event, data: data ?? {} }));

const build = (steps: TraceStep[], upTo = steps.length - 1) =>
  buildGraphState(steps, upTo, isDirected(steps), isMulti(steps));

describe('graphReducer', () => {
  it('grafo vazio', () => {
    const state = build([], 0);
    expect(state.nodes).toEqual([]);
    expect(state.edges).toEqual([]);
  });

  it('mantém peso zero e label vazio', () => {
    const steps = seq(
      ['ADD_NODE', { id: 1, label: '' }],
      ['ADD_NODE', { id: 2, label: 'b' }],
      ['ADD_EDGE', { u: 1, v: 2, weight: 0 }]
    );
    const state = build(steps);
    expect(state.nodes[0].label).toBe('');
    expect(state.edges[0].weight).toBe(0);
  });

  it('remove nó junto com arestas incidentes', () => {
    const steps = seq(
      ['ADD_NODE', { id: 1, label: '1' }],
      ['ADD_NODE', { id: 2, label: '2' }],
      ['ADD_NODE', { id: 3, label: '3' }],
      ['ADD_EDGE', { u: 1, v: 2, weight: 1 }],
      ['ADD_EDGE', { u: 2, v: 3, weight: 1 }],
      ['REMOVE_NODE', { id: 2 }]
    );
    const state = build(steps);
    expect(state.nodes.map((n) => n.id)).toEqual([1, 3]);
    expect(state.edges).toEqual([]);
  });

  it('remove aresta e atualiza peso', () => {
    const steps = seq(
      ['ADD_NODE', { id: 1, label: '1' }],
      ['ADD_NODE', { id: 2, label: '2' }],
      ['ADD_EDGE', { u: 1, v: 2, weight: 5 }],
      ['SET_WEIGHT', { u: 1, v: 2, weight: 9 }],
      ['REMOVE_EDGE', { u: 1, v: 2 }]
    );
    expect(build(steps, 3).edges[0].weight).toBe(9);
    expect(build(steps, 4).edges).toEqual([]);
  });

  it('reset_colors limpa nós e arestas', () => {
    const steps = seq(
      ['ADD_NODE', { id: 1, label: '1' }],
      ['ADD_NODE', { id: 2, label: '2' }],
      ['ADD_EDGE', { u: 1, v: 2, weight: 1 }],
      ['SET_COLOR', { id: 1, color: 'red' }],
      ['HIGHLIGHT_EDGE', { u: 1, v: 2, color: 'red' }],
      ['RESET_COLORS']
    );
    const state = build(steps);
    expect(state.nodes[0].highlighted).toBe(false);
    expect(state.edges[0].highlighted).toBe(false);
  });

  it('não direcionado deduplica aresta nos dois sentidos', () => {
    const steps = seq(
      ['SET_DIRECTED', { directed: false }],
      ['ADD_NODE', { id: 1, label: '1' }],
      ['ADD_NODE', { id: 2, label: '2' }],
      ['ADD_EDGE', { u: 1, v: 2, weight: 1 }],
      ['ADD_EDGE', { u: 2, v: 1, weight: 1 }]
    );
    expect(isDirected(steps)).toBe(false);
    expect(build(steps).edges).toHaveLength(1);
  });

  it('multigrafo mantém arestas paralelas e destaca uma por vez', () => {
    const steps = seq(
      ['SET_MULTI', { multi: true }],
      ['ADD_NODE', { id: 1, label: '1' }],
      ['ADD_NODE', { id: 2, label: '2' }],
      ['ADD_EDGE', { u: 1, v: 2, weight: 1 }],
      ['ADD_EDGE', { u: 1, v: 2, weight: 2 }],
      ['HIGHLIGHT_EDGE', { u: 1, v: 2, color: 'red' }],
      ['HIGHLIGHT_EDGE', { u: 1, v: 2, color: 'red' }]
    );
    expect(build(steps, 4).edges).toHaveLength(2);
    const afterFirst = build(steps, 5).edges;
    expect(afterFirst[0].highlighted).toBe(true);
    expect(afterFirst[1].highlighted).toBeUndefined();
    expect(build(steps).edges[1].highlighted).toBe(true);
  });

  it('voltar na timeline reproduz o mesmo estado', () => {
    const steps = seq(
      ['ADD_NODE', { id: 1, label: '1' }],
      ['ADD_NODE', { id: 2, label: '2' }],
      ['ADD_EDGE', { u: 1, v: 2, weight: 1 }],
      ['REMOVE_EDGE', { u: 1, v: 2 }]
    );
    const before = build(steps, 2);
    build(steps, 3);
    expect(build(steps, 2)).toEqual(before);
  });

  it('detecta set_weighted(false)', () => {
    expect(isWeighted(seq(['SET_WEIGHTED', { weighted: false }]))).toBe(false);
    expect(isWeighted(seq(['ADD_NODE', { id: 1 }]))).toBe(true);
  });

  it('sem STEP, cada evento é um frame', () => {
    const steps = seq(['ADD_NODE', { id: 1 }], ['ADD_NODE', { id: 2 }]);
    expect(frameEnds(steps)).toEqual([0, 1]);
  });

  it('STEP agrupa eventos e o resto vira frame final', () => {
    const steps = seq(
      ['ADD_NODE', { id: 1 }],
      ['ADD_NODE', { id: 2 }],
      ['STEP', { caption: 'a' }],
      ['SET_COLOR', { id: 1, color: 'red' }]
    );
    expect(frameEnds(steps)).toEqual([2, 3]);
    expect(frameCaption(steps, 2)).toBe('a');
    expect(frameCaption(steps, 3)).toBe('');
  });

  it('frames vazios para execução vazia', () => {
    expect(frameEnds([])).toEqual([]);
  });

  it('badge, estilo e label aplicam e limpam', () => {
    const steps = seq(
      ['ADD_NODE', { id: 1, label: '1' }],
      ['ADD_NODE', { id: 2, label: '2' }],
      ['ADD_EDGE', { u: 1, v: 2, weight: 1 }],
      ['SET_BADGE', { id: 1, text: 'd=0' }],
      ['SET_EDGE_STYLE', { u: 1, v: 2, style: 'dashed' }],
      ['SET_EDGE_LABEL', { u: 1, v: 2, label: '3/10' }],
      ['SET_BADGE', { id: 1, text: '' }]
    );
    const s = build(steps, 5);
    expect(s.nodes[0].badge).toBe('d=0');
    expect(s.edges[0].style).toBe('dashed');
    expect(s.edges[0].label).toBe('3/10');
    expect(build(steps).nodes[0].badge).toBeUndefined();
  });
});