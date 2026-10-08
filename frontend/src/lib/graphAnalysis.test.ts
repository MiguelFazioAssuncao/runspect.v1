import { describe, expect, it } from 'vitest';
import { analyzeGraph } from './graphAnalysis';
import { planarLayout } from './advancedGraph';
import type { GraphEdge, GraphNode } from '@/types/visualizer';

const nodes = (ids: number[]): GraphNode[] => ids.map((id) => ({ id, label: String(id) }));
const edges = (pairs: [number, number][]): GraphEdge[] => pairs.map(([source, target]) => ({ source, target }));

describe('graph analysis', () => {
  it('identifica uma árvore conectada', () => {
    const result = analyzeGraph(nodes([1, 2, 3]), edges([[1, 2], [1, 3]]), false);
    expect(result.tree).toBe(true);
    expect(result.cyclic).toBe(false);
  });

  it('identifica componentes e ciclo', () => {
    const result = analyzeGraph(nodes([1, 2, 3, 4]), edges([[1, 2], [2, 3], [3, 1]]), false);
    expect(result.componentCount).toBe(2);
    expect(result.cyclic).toBe(true);
    expect(result.bipartite).toBe(false);
  });

  it('calcula conectividade forte e ciclo negativo direcionado', () => {
    const result = analyzeGraph(
      nodes([1, 2, 3]),
      [
        { source: 1, target: 2, weight: 1 },
        { source: 2, target: 3, weight: -3 },
        { source: 3, target: 2, weight: 1 },
      ],
      true,
    );
    expect(result.weaklyConnected).toBe(true);
    expect(result.stronglyConnected).toBe(false);
    expect(result.stronglyConnectedComponents).toBe(2);
    expect(result.hasNegativeCycle).toBe(true);
  });

  it('detecta pontes, articulações e caminho Euleriano', () => {
    const result = analyzeGraph(nodes([1, 2, 3]), edges([[1, 2], [2, 3]]), false);
    expect(result.bridgeCount).toBe(2);
    expect(result.articulationPointCount).toBe(1);
    expect(result.eulerian).toBe('path');
  });

  it('calcula matching máximo e coloração gulosa', () => {
    const result = analyzeGraph(
      nodes([1, 2, 3, 4]),
      edges([[1, 3], [1, 4], [2, 3]]),
      false,
    );
    expect(result.matchingPairs).toHaveLength(2);
    expect(result.coloringCount).toBe(2);
  });

  it('calcula ordenação topológica e rejeita ciclos', () => {
    const dag = analyzeGraph(nodes([1, 2, 3]), edges([[1, 2], [1, 3]]), true);
    expect(dag.topologicalCycle).toBe(false);
    expect(dag.topologicalOrder).toEqual([1, 2, 3]);

    const cyclic = analyzeGraph(nodes([1, 2]), edges([[1, 2], [2, 1]]), true);
    expect(cyclic.topologicalCycle).toBe(true);
    expect(cyclic.topologicalOrder).toEqual([]);
  });

  it('conta densidade simples sem apagar a presença de multiarestas', () => {
    const result = analyzeGraph(
      nodes([1, 2]),
      [{ source: 1, target: 1 }, { source: 1, target: 2 }, { source: 1, target: 2 }],
      false,
    );
    expect(result.density).toBe(2 / 3);
  });

  it('detecta grafo completo e propriedades Hamiltonianas', () => {
    const result = analyzeGraph(
      nodes([1, 2, 3, 4]),
      edges([[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]),
      false,
    );
    expect(result.complete).toBe(true);
    expect(result.hamiltonianPath).toBe(true);
    expect(result.hamiltonianCycle).toBe(true);
  });

  it('limita a análise Hamiltoniana em grafos grandes', () => {
    const result = analyzeGraph(nodes(Array.from({ length: 13 }, (_, i) => i)), [], false);
    expect(result.hamiltonianPath).toBeNull();
    expect(result.hamiltonianCycle).toBeNull();
  });

  it('analisa clique, conjunto independente e conjunto dominante', () => {
    const result = analyzeGraph(
      nodes([1, 2, 3, 4]),
      edges([[1, 2], [1, 3], [2, 3], [3, 4]]),
      false,
    );
    expect(result.maxClique.length).toBe(3);
    expect(result.independentSet.length).toBeGreaterThanOrEqual(2);
    expect(result.dominatingSet.length).toBeGreaterThan(0);
  });

  it('identifica K5 como não planar e calcula min-cut', () => {
    const pairs: [number, number][] = [];
    for (let a = 1; a <= 5; a++) {
      for (let b = a + 1; b <= 5; b++) pairs.push([a, b]);
    }
    const result = analyzeGraph(nodes([1, 2, 3, 4, 5]), edges(pairs), false);
    expect(result.planarity).toBe('non-planar');
    expect(result.minCutValue).toBe(4);
    expect(result.minCutSide.length).toBeGreaterThan(0);
  });

  it('identifica K3,3 como não planar', () => {
    const pairs: [number, number][] = [];
    for (const left of [1, 2, 3]) {
      for (const right of [4, 5, 6]) pairs.push([left, right]);
    }
    const result = analyzeGraph(nodes([1, 2, 3, 4, 5, 6]), edges(pairs), false);
    expect(result.planarity).toBe('non-planar');
  });

  it('classifica um grafo planar denso e um grafo não planar sem K5 explícito', () => {
    const planar = analyzeGraph(
      nodes([1, 2, 3, 4]),
      edges([[1, 2], [2, 3], [3, 4], [4, 1], [1, 3]]),
      false,
    );
    const petersen: [number, number][] = [
      [1, 2], [2, 3], [3, 4], [4, 5], [5, 1],
      [6, 8], [8, 10], [10, 7], [7, 9], [9, 6],
      [1, 6], [2, 7], [3, 8], [4, 9], [5, 10],
    ];
    const nonPlanar = analyzeGraph(nodes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), edges(petersen), false);
    expect(planar.planarity).toBe('planar');
    expect(nonPlanar.planarity).toBe('non-planar');
  });

  it('pausa análises avançadas em grafos grandes', () => {
    const result = analyzeGraph(nodes(Array.from({ length: 21 }, (_, i) => i)), [], false);
    expect(result.advancedAnalysisSkipped).toBe(true);
    expect(result.maxClique).toEqual([]);
  });

  it('gera posições para um grafo planar e rejeita um não planar', () => {
    const planar = planarLayout([1, 2, 3, 4], [
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 4 },
      { source: 4, target: 1 },
      { source: 1, target: 3 },
    ]);
    const nonPlanar = planarLayout([1, 2, 3, 4, 5], [
      { source: 1, target: 2 }, { source: 1, target: 3 }, { source: 1, target: 4 }, { source: 1, target: 5 },
      { source: 2, target: 3 }, { source: 2, target: 4 }, { source: 2, target: 5 },
      { source: 3, target: 4 }, { source: 3, target: 5 }, { source: 4, target: 5 },
    ]);
    expect(planar?.size).toBe(4);
    expect(nonPlanar).toBeNull();
  });
});
