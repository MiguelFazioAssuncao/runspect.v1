import type { GraphEdge, GraphNode } from '@/types/visualizer';
import { analyzeAdvancedGraph, type PlanarityStatus } from './advancedGraph';

export interface GraphAnalysis {
  nodeCount: number;
  edgeCount: number;
  componentCount: number;
  connected: boolean;
  bipartite: boolean;
  cyclic: boolean;
  tree: boolean;
  forest: boolean;
  density: number;
  maxDegree: number;
  weaklyConnected: boolean;
  stronglyConnected: boolean;
  stronglyConnectedComponents: number;
  hasNegativeCycle: boolean;
  bridgeCount: number;
  articulationPointCount: number;
  eulerian: 'circuit' | 'path' | 'none';
  stronglyConnectedComponentByNode: Record<number, number>;
  bridgeEdgeIndexes: number[];
  articulationNodeIds: number[];
  matchingPairs: [number, number][];
  coloringByNode: Record<number, number>;
  coloringCount: number;
  topologicalOrder: number[];
  topologicalCycle: boolean;
  negativeCycleEdgeIndexes: number[];
  complete: boolean;
  hamiltonianPath: boolean | null;
  hamiltonianCycle: boolean | null;
  planarity: PlanarityStatus;
  maxClique: number[];
  independentSet: number[];
  dominatingSet: number[];
  weightedMatchingPairs: [number, number, number][];
  minCutValue: number | null;
  minCutEdgeIndexes: number[];
  minCutSide: number[];
  advancedAnalysisSkipped: boolean;
  advancedAnalysisReason: string | null;
}

const ids = (edge: GraphEdge) => ({
  source: typeof edge.source === 'number' ? edge.source : edge.source.id,
  target: typeof edge.target === 'number' ? edge.target : edge.target.id,
});

export function analyzeGraph(nodes: GraphNode[], edges: GraphEdge[], directed: boolean): GraphAnalysis {
  const nodeIds = new Set(nodes.map((node) => node.id));
  edges = edges.filter((edge) => {
    const { source, target } = ids(edge);
    return nodeIds.has(source) && nodeIds.has(target);
  });
  const adjacency = new Map<number, number[]>();
  const weakAdjacency = new Map<number, number[]>();
  nodes.forEach((node) => adjacency.set(node.id, []));
  nodes.forEach((node) => weakAdjacency.set(node.id, []));
  edges.forEach((edge) => {
    const { source, target } = ids(edge);
    adjacency.get(source)?.push(target);
    if (source !== target) {
      weakAdjacency.get(source)?.push(target);
      weakAdjacency.get(target)?.push(source);
    }
    if (!directed) adjacency.get(target)?.push(source);
  });

  const visited = new Set<number>();
  const weakComponentOf = new Map<number, number>();
  let componentCount = 0;
  nodes.forEach((node) => {
    if (visited.has(node.id)) return;
    componentCount++;
    const queue = [node.id];
    visited.add(node.id);
    weakComponentOf.set(node.id, componentCount - 1);
    while (queue.length) {
      const current = queue.shift();
      if (current === undefined) continue;
      weakAdjacency.get(current)?.forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          weakComponentOf.set(neighbor, componentCount - 1);
          queue.push(neighbor);
        }
      });
    }
  });

  const colors = new Map<number, 0 | 1>();
  let bipartite = !edges.some((edge) => ids(edge).source === ids(edge).target);
  nodes.forEach((node) => {
    if (colors.has(node.id)) return;
    colors.set(node.id, 0);
    const queue = [node.id];
    while (queue.length) {
      const current = queue.shift();
      if (current === undefined) continue;
      weakAdjacency.get(current)?.forEach((neighbor) => {
        const expected = colors.get(current) === 0 ? 1 : 0;
        if (!colors.has(neighbor)) {
          colors.set(neighbor, expected);
          queue.push(neighbor);
        } else if (colors.get(neighbor) !== expected) {
          bipartite = false;
        }
      });
    }
  });

  const undirectedEdges = edges.filter((edge) => {
    const { source, target } = ids(edge);
    return source !== target;
  });
  const connected = nodes.length > 0 && componentCount === 1;
  const forest = !directed && edges.length === undirectedEdges.length
    && undirectedEdges.length === nodes.length - componentCount;
  let cyclic = false;
  if (directed) {
    const state = new Map<number, 0 | 1 | 2>();
    const visit = (node: number): boolean => {
      state.set(node, 1);
      for (const neighbor of adjacency.get(node) ?? []) {
        if (state.get(neighbor) === 1 || (state.get(neighbor) !== 2 && visit(neighbor))) return true;
      }
      state.set(node, 2);
      return false;
    };
    cyclic = nodes.some((node) => !state.has(node.id) && visit(node.id));
  } else {
    cyclic = edges.length !== undirectedEdges.length || !forest;
  }
  const uniquePairs = new Set(
    edges.map((edge) => {
      const { source, target } = ids(edge);
      return directed ? `${source}->${target}` : `${Math.min(source, target)}-${Math.max(source, target)}`;
    }),
  );
  const possibleEdges = directed
    ? nodes.length * nodes.length
    : (nodes.length * (nodes.length + 1)) / 2;
  const hasLoop = edges.some((edge) => {
    const { source, target } = ids(edge);
    return source === target;
  });
  const complete = !hasLoop && !directed
    ? uniquePairs.size === (nodes.length * Math.max(0, nodes.length - 1)) / 2
    : !hasLoop && directed && uniquePairs.size === nodes.length * Math.max(0, nodes.length - 1);
  const weaklyConnected = nodes.length > 0 && componentCount === 1;

  const reverse = new Map<number, number[]>();
  nodes.forEach((node) => reverse.set(node.id, []));
  edges.forEach((edge) => {
    const { source, target } = ids(edge);
    reverse.get(target)?.push(source);
  });
  const reachable = (graph: Map<number, number[]>, start: number) => {
    const seen = new Set<number>([start]);
    const queue = [start];
    while (queue.length) {
      const current = queue.shift();
      if (current === undefined) continue;
      (graph.get(current) ?? []).forEach((neighbor) => {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      });
    }
    return seen;
  };
  const stronglyConnected = !directed
    ? connected
    : nodes.length > 0
      && reachable(adjacency, nodes[0].id).size === nodes.length
      && reachable(reverse, nodes[0].id).size === nodes.length;

  const finishOrder: number[] = [];
  const visitedDirected = new Set<number>();
  const visitDirected = (node: number) => {
    visitedDirected.add(node);
    (adjacency.get(node) ?? []).forEach((neighbor) => {
      if (!visitedDirected.has(neighbor)) visitDirected(neighbor);
    });
    finishOrder.push(node);
  };
  nodes.forEach((node) => {
    if (!visitedDirected.has(node.id)) visitDirected(node.id);
  });
  const componentOf = new Map<number, number>();
  let stronglyConnectedComponents = 0;
  const visitReverse = (node: number) => {
    componentOf.set(node, stronglyConnectedComponents);
    (reverse.get(node) ?? []).forEach((neighbor) => {
      if (!componentOf.has(neighbor)) visitReverse(neighbor);
    });
  };
  if (!directed) {
    weakComponentOf.forEach((component, node) => componentOf.set(node, component));
    stronglyConnectedComponents = nodes.length > 0 ? componentCount : 0;
  } else {
    [...finishOrder].reverse().forEach((node) => {
      if (!componentOf.has(node)) {
        visitReverse(node);
        stronglyConnectedComponents++;
      }
    });
  }

  const negativeCycleEdgeIndexes: number[] = [];
  const hasNegativeCycle = directed
    ? (() => {
      const distance = new Map(nodes.map((node) => [node.id, 0]));
      const predecessor = new Map<number, number>();
      for (let i = 0; i < nodes.length; i++) {
        let changedNode: number | undefined;
        edges.forEach((edge, edgeIndex) => {
          const { source, target } = ids(edge);
          const weight = edge.weight ?? 1;
          if ((distance.get(target) ?? 0) > (distance.get(source) ?? 0) + weight) {
            distance.set(target, (distance.get(source) ?? 0) + weight);
            predecessor.set(target, edgeIndex);
            changedNode = target;
          }
        });
        if (changedNode === undefined) return false;
        if (i === nodes.length - 1) {
          let current = changedNode;
          for (let step = 0; step < nodes.length; step++) {
            const edgeIndex = predecessor.get(current);
            if (edgeIndex === undefined) break;
            current = ids(edges[edgeIndex]).source;
          }
          const seen = new Set<number>();
          for (let step = 0; step <= nodes.length; step++) {
            if (seen.has(current)) break;
            seen.add(current);
            const edgeIndex = predecessor.get(current);
            if (edgeIndex === undefined) break;
            negativeCycleEdgeIndexes.push(edgeIndex);
            current = ids(edges[edgeIndex]).source;
          }
          return true;
        }
      }
      return false;
    })()
    : false;

  const topologicalOrder: number[] = [];
  if (directed) {
    const remaining = new Map(nodes.map((node) => [node.id, 0]));
    edges.forEach((edge) => {
      const { target } = ids(edge);
      remaining.set(target, (remaining.get(target) ?? 0) + 1);
    });
    const queue = nodes.filter((node) => remaining.get(node.id) === 0).map((node) => node.id);
    while (queue.length) {
      const current = queue.shift();
      if (current === undefined) continue;
      topologicalOrder.push(current);
      (adjacency.get(current) ?? []).forEach((neighbor) => {
        const degree = (remaining.get(neighbor) ?? 0) - 1;
        remaining.set(neighbor, degree);
        if (degree === 0) queue.push(neighbor);
      });
    }
  }
  const topologicalCycle = directed && topologicalOrder.length !== nodes.length;

  const bridgeAndArticulation = (() => {
    const graph = new Map<number, { node: number; edge: number }[]>();
    nodes.forEach((node) => graph.set(node.id, []));
    edges.forEach((edge, index) => {
      const { source, target } = ids(edge);
      if (source === target) return;
      graph.get(source)?.push({ node: target, edge: index });
      graph.get(target)?.push({ node: source, edge: index });
    });
    const discovery = new Map<number, number>();
    const low = new Map<number, number>();
    const articulation = new Set<number>();
    const bridges = new Set<number>();
    let time = 0;
    const visit = (node: number, parentEdge: number | undefined) => {
      discovery.set(node, ++time);
      low.set(node, discovery.get(node)!);
      let children = 0;
      for (const next of graph.get(node) ?? []) {
        if (next.edge === parentEdge) continue;
        if (!discovery.has(next.node)) {
          children++;
          visit(next.node, next.edge);
          low.set(node, Math.min(low.get(node)!, low.get(next.node)!));
          if (parentEdge !== undefined && low.get(next.node)! >= discovery.get(node)!) articulation.add(node);
          if (low.get(next.node)! > discovery.get(node)!) bridges.add(next.edge);
        } else {
          low.set(node, Math.min(low.get(node)!, discovery.get(next.node)!));
        }
      }
      if (parentEdge === undefined && children > 1) articulation.add(node);
    };
    nodes.forEach((node) => {
      if (!discovery.has(node.id)) visit(node.id, undefined);
    });
    return { bridges, articulation };
  })();

  const coloringByNode: Record<number, number> = {};
  nodes
    .slice()
    .sort((a, b) => (weakAdjacency.get(b.id)?.length ?? 0) - (weakAdjacency.get(a.id)?.length ?? 0))
    .forEach((node) => {
      const used = new Set(
        (weakAdjacency.get(node.id) ?? [])
          .map((neighbor) => coloringByNode[neighbor])
          .filter((color): color is number => color !== undefined),
      );
      let color = 0;
      while (used.has(color)) color++;
      coloringByNode[node.id] = color;
    });

  const matchingPairs: [number, number][] = [];
  if (bipartite && !directed) {
    const matching = new Map<number, number>();
    const left = new Set<number>();
    colors.forEach((color, node) => {
      if (color === 0) left.add(node);
    });
    const visit = (node: number, seen: Set<number>): boolean => {
      for (const neighbor of adjacency.get(node) ?? []) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        const paired = matching.get(neighbor);
        if (paired === undefined || visit(paired, seen)) {
          matching.set(neighbor, node);
          return true;
        }
      }
      return false;
    };
    left.forEach((node) => visit(node, new Set()));
    matching.forEach((node, neighbor) => matchingPairs.push([node, neighbor]));
  }

  const eulerian = (() => {
    const incident = new Set(edges.flatMap((edge) => {
      const { source, target } = ids(edge);
      return [source, target];
    }));
    const active = nodes.filter((node) => incident.has(node.id));
    if (active.length === 0) return 'none' as const;
    const activeWeak = reachable(weakAdjacency, active[0].id).size === active.length;
    if (directed) {
      const inDegree = new Map<number, number>();
      const outDegree = new Map<number, number>();
      nodes.forEach((node) => { inDegree.set(node.id, 0); outDegree.set(node.id, 0); });
      edges.forEach((edge) => {
        const { source, target } = ids(edge);
        outDegree.set(source, (outDegree.get(source) ?? 0) + 1);
        inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
      });
      const starts = nodes.filter((node) => (outDegree.get(node.id)! - inDegree.get(node.id)!) === 1).length;
      const ends = nodes.filter((node) => (inDegree.get(node.id)! - outDegree.get(node.id)!) === 1).length;
      const invalidBalance = nodes.some((node) => {
        const difference = (outDegree.get(node.id) ?? 0) - (inDegree.get(node.id) ?? 0);
        return Math.abs(difference) > 1;
      });
      const balanced = nodes.every((node) => (inDegree.get(node.id) ?? 0) === (outDegree.get(node.id) ?? 0));
      return !invalidBalance && starts === 0 && ends === 0 && balanced && activeWeak ? 'circuit' as const
        : !invalidBalance && starts === 1 && ends === 1 && activeWeak ? 'path' as const : 'none' as const;
    }
    const odd = nodes.filter((node) => (adjacency.get(node.id)?.length ?? 0) % 2 === 1).length;
    return activeWeak && odd === 0 ? 'circuit' as const
      : activeWeak && odd === 2 ? 'path' as const : 'none' as const;
  })();

  const hamiltonian = (() => {
    if (nodes.length === 0 || nodes.length > 12) return { path: null, cycle: null };
    const indexes = new Map(nodes.map((node, index) => [node.id, index]));
    const neighbors = new Array<number>(nodes.length).fill(0);
    edges.forEach((edge) => {
      const { source, target } = ids(edge);
      const u = indexes.get(source)!;
      const v = indexes.get(target)!;
      neighbors[u] |= 1 << v;
      if (!directed) neighbors[v] |= 1 << u;
    });
    const full = (1 << nodes.length) - 1;
    // Track reachable endpoints for each visited subset: O(n² * 2^n).
    const spanningEnds = (fixedStart: boolean): number => {
      const ends = new Uint16Array(full + 1);
      for (let i = 0; i < (fixedStart ? 1 : nodes.length); i++) ends[1 << i] = 1 << i;
      for (let mask = 1; mask <= full; mask++) {
        for (let u = 0; u < nodes.length; u++) {
          if (!(ends[mask] & (1 << u))) continue;
          const available = neighbors[u] & ~mask;
          for (let v = 0; v < nodes.length; v++) {
            const bit = 1 << v;
            if (available & bit) ends[mask | bit] |= bit;
          }
        }
      }
      return ends[full];
    };
    const path = spanningEnds(false) !== 0;
    const cycleEnds = path ? spanningEnds(true) : 0;
    const canClose = nodes.some((_, i) => (cycleEnds & (1 << i)) !== 0 && (neighbors[i] & 1) !== 0);
    const cycle = canClose && (
      nodes.length !== 2 || directed
      || edges.filter((edge) => ids(edge).source !== ids(edge).target).length >= 2
    );
    return { path, cycle };
  })();
  const advancedAnalysisSkipped = nodes.length > 20 || edges.length > 80;
  const advanced = advancedAnalysisSkipped
    ? {
      planarity: 'unknown' as PlanarityStatus,
      maxClique: [],
      independentSet: [],
      dominatingSet: [],
      weightedMatchingPairs: [],
      minCutValue: null,
      minCutEdgeIndexes: [],
      minCutSide: [],
    }
    : analyzeAdvancedGraph(nodes, edges, directed);

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    componentCount,
    connected,
    bipartite,
    cyclic,
    tree: !directed && connected && forest,
    forest,
    density: possibleEdges === 0 ? 0 : uniquePairs.size / possibleEdges,
    maxDegree: Math.max(0, ...Array.from(adjacency.values(), (neighbors) => neighbors.length)),
    weaklyConnected,
    stronglyConnected,
    stronglyConnectedComponents,
    hasNegativeCycle,
    bridgeCount: bridgeAndArticulation.bridges.size,
    articulationPointCount: bridgeAndArticulation.articulation.size,
    eulerian,
    stronglyConnectedComponentByNode: Object.fromEntries(componentOf),
    bridgeEdgeIndexes: directed ? [] : [...bridgeAndArticulation.bridges],
    articulationNodeIds: directed ? [] : [...bridgeAndArticulation.articulation],
    matchingPairs,
    coloringByNode,
    coloringCount: Math.max(0, ...Object.values(coloringByNode)) + (nodes.length ? 1 : 0),
    topologicalOrder,
    topologicalCycle,
    negativeCycleEdgeIndexes,
    complete,
    hamiltonianPath: hamiltonian.path,
    hamiltonianCycle: hamiltonian.cycle,
    ...advanced,
    advancedAnalysisSkipped,
    advancedAnalysisReason: advancedAnalysisSkipped
      ? 'Análises avançadas pausadas para manter o desempenho neste grafo.'
      : null,
  };
}
