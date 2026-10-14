import { describe, expect, it } from 'vitest';
import { analyzeGraph } from './graphAnalysis';
import { planarLayout } from './advancedGraph';
import type { GraphEdge, GraphNode } from '@/types/visualizer';

const nodes = (ids: number[]): GraphNode[] => ids.map((id) => ({ id, label: String(id) }));
const edges = (pairs: [number, number][]): GraphEdge[] => pairs.map(([source, target]) => ({ source, target }));

describe('graph analysis', () => {
  it.each([false, true])('analisa caminhos profundos sem estourar a pilha (directed=%s)', (directed) => {
    const count = 12000;
    const vertices = nodes(Array.from({ length: count }, (_, i) => i));
    const links = edges(Array.from({ length: count - 1 }, (_, i) => [i, i + 1]));
    const result = analyzeGraph(vertices, links, directed);
    expect(result.cyclic).toBe(false);
    expect(result.componentCount).toBe(1);
    expect(result.stronglyConnectedComponents).toBe(directed ? count : 1);
    expect(result.bridgeCount).toBe(count - 1);
    expect(result.articulationPointCount).toBe(count - 2);
    if (directed) expect(result.topologicalOrder).toHaveLength(count);
    else expect(result.matchingPairs).toHaveLength(count / 2);
  });

  it('mantém multiarestas fora da lista de pontes', () => {
    const result = analyzeGraph(nodes([1, 2, 3, 4]), edges([[1, 2], [1, 2], [2, 3], [2, 4]]), false);
    expect(result.bridgeEdgeIndexes.sort()).toEqual([2, 3]);
    expect(result.articulationNodeIds).toEqual([2]);
  });

  it('analisa uma componente fortemente conectada profunda sem recursão', () => {
    const count = 12000;
    const result = analyzeGraph(
      nodes(Array.from({ length: count }, (_, i) => i)),
      edges(Array.from({ length: count }, (_, i) => [i, (i + 1) % count])),
      true,
    );
    expect(result.cyclic).toBe(true);
    expect(result.stronglyConnected).toBe(true);
    expect(result.stronglyConnectedComponents).toBe(1);
    expect(result.bridgeCount).toBe(0);
    expect(result.articulationPointCount).toBe(0);
  });

  it('considera apenas arestas cujos extremos existem', () => {
    const result = analyzeGraph(nodes([1, 2]), edges([[1, 2], [2, 99]]), false);
    expect(result.edgeCount).toBe(1);
    expect(result.componentCount).toBe(1);
    expect(result.tree).toBe(true);
  });

  it('mantém os componentes separados no mapa de nós', () => {
    const result = analyzeGraph(nodes([1, 2, 3]), edges([[1, 2]]), false);
    const components = result.stronglyConnectedComponentByNode;
    expect(components[1]).toBe(components[2]);
    expect(components[1]).not.toBe(components[3]);
    expect(result.stronglyConnectedComponents).toBe(2);
  });

  it('dois vértices isolados direcionados não são fortemente conectados', () => {
    expect(analyzeGraph(nodes([1, 2]), [], true).stronglyConnected).toBe(false);
    expect(analyzeGraph(nodes([1]), [], true).stronglyConnected).toBe(true);
  });

  it('bipartição e coloração independem da orientação e da ordem dos nós', () => {
    const result = analyzeGraph(nodes([1, 2]), edges([[2, 1]]), true);
    expect(result.bipartite).toBe(true);
    expect(result.coloringByNode[1]).not.toBe(result.coloringByNode[2]);
  });

  it('inclui vértices sem saída no caminho Euleriano direcionado', () => {
    expect(analyzeGraph(nodes([1, 2, 3]), edges([[1, 2], [2, 3]]), true).eulerian).toBe('path');
  });

  it('vértices isolados não impedem um percurso Euleriano pelas arestas', () => {
    expect(analyzeGraph(nodes([1, 2, 3]), edges([[1, 2]]), false).eulerian).toBe('path');
    expect(analyzeGraph(nodes([1, 2, 3, 4]), edges([[1, 2], [3, 4]]), false).eulerian).toBe('none');
  });

  it('um laço é um ciclo e contribui dois para o grau não direcionado', () => {
    const result = analyzeGraph(nodes([1]), edges([[1, 1]]), false);
    expect(result.cyclic).toBe(true);
    expect(result.forest).toBe(false);
    expect(result.tree).toBe(false);
    expect(result.bipartite).toBe(false);
    expect(result.maxDegree).toBe(2);
    expect(result.eulerian).toBe('circuit');
  });

  it('busca um caminho Hamiltoniano começando por qualquer vértice', () => {
    expect(analyzeGraph(nodes([2, 1, 3]), edges([[1, 2], [2, 3]]), false).hamiltonianPath).toBe(true);
    expect(analyzeGraph(nodes([3, 2, 1]), edges([[1, 2], [2, 3]]), true).hamiltonianPath).toBe(true);
    expect(analyzeGraph(nodes([1, 2, 3, 4]), edges([[1, 2], [1, 3], [1, 4]]), false).hamiltonianPath).toBe(false);
  });

  it('exige arestas de retorno em ciclos Hamiltonianos pequenos', () => {
    expect(analyzeGraph(nodes([1]), [], false).hamiltonianCycle).toBe(false);
    expect(analyzeGraph(nodes([1]), edges([[1, 1]]), true).hamiltonianCycle).toBe(true);
    expect(analyzeGraph(nodes([1, 2]), edges([[1, 2], [2, 1]]), true).hamiltonianCycle).toBe(true);
    expect(analyzeGraph(nodes([1, 2]), edges([[1, 2]]), true).hamiltonianCycle).toBe(false);
    expect(analyzeGraph(nodes([1, 2]), edges([[1, 2]]), false).hamiltonianCycle).toBe(false);
    expect(analyzeGraph(nodes([1, 2]), edges([[1, 2], [1, 2]]), false).hamiltonianCycle).toBe(true);
  });

  it('destaca o ciclo negativo mesmo quando outra componente relaxa primeiro', () => {
    const result = analyzeGraph(nodes([1, 2, 3, 4]), [
      { source: 1, target: 2, weight: -1 },
      { source: 3, target: 4, weight: -3 },
      { source: 4, target: 3, weight: 1 },
    ], true);
    expect(result.hasNegativeCycle).toBe(true);
    expect(result.negativeCycleEdgeIndexes.sort()).toEqual([1, 2]);
  });

  it('analisa K5,7 sem busca fatorial por caminhos Hamiltonianos', () => {
    const pairs: [number, number][] = [];
    for (let u = 0; u < 5; u++) {
      for (let v = 5; v < 12; v++) pairs.push([u, v]);
    }
    const result = analyzeGraph(nodes(Array.from({ length: 12 }, (_, i) => i)), edges(pairs), false);
    expect(result.hamiltonianPath).toBe(false);
    expect(result.hamiltonianCycle).toBe(false);
  });

  it('um grafo vazio não contém ciclos', () => {
    expect(analyzeGraph([], [], false).cyclic).toBe(false);
  });

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
