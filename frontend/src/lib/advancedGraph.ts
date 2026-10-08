import type { GraphEdge, GraphNode } from '@/types/visualizer';

export type PlanarityStatus = 'planar' | 'non-planar' | 'unknown';

const edgeIds = (edge: GraphEdge) => ({
  source: typeof edge.source === 'number' ? edge.source : edge.source.id,
  target: typeof edge.target === 'number' ? edge.target : edge.target.id,
});

export interface AdvancedGraphAnalysis {
  planarity: PlanarityStatus;
  maxClique: number[];
  independentSet: number[];
  dominatingSet: number[];
  weightedMatchingPairs: [number, number, number][];
  minCutValue: number | null;
  minCutEdgeIndexes: number[];
  minCutSide: number[];
}

export function planarLayout(
  ids: number[],
  edges: Array<{ source: number; target: number }>,
): Map<number, { x: number; y: number }> | null {
  const adjacency = new Map(ids.map((id) => [id, new Set<number>()]));
  edges.forEach(({ source, target }) => {
    if (source !== target) {
      adjacency.get(source)?.add(target);
      adjacency.get(target)?.add(source);
    }
  });
  if (exactPlanarity(ids, adjacency) !== true) return null;
  const root = ids[0];
  if (root === undefined) return new Map();
  const levels = new Map<number, number>([[root, 0]]);
  const queue = [root];
  while (queue.length) {
    const current = queue.shift()!;
    [...(adjacency.get(current) ?? [])].forEach((neighbor) => {
      if (!levels.has(neighbor)) {
        levels.set(neighbor, (levels.get(current) ?? 0) + 1);
        queue.push(neighbor);
      }
    });
  }
  const maxLevel = Math.max(...levels.values(), 0);
  const positions = new Map<number, { x: number; y: number }>();
  ids.forEach((id, index) => {
    const level = levels.get(id) ?? Math.floor(index / Math.max(1, Math.ceil(Math.sqrt(ids.length))));
    const group = ids.filter((candidate) => (levels.get(candidate) ?? 0) === level);
    const position = Math.max(0, group.indexOf(id));
    positions.set(id, {
      x: group.length <= 1 ? 0.5 : 0.08 + 0.84 * (position / (group.length - 1)),
      y: maxLevel === 0 ? 0.5 : 0.08 + 0.84 * (level / maxLevel),
    });
  });
  return positions;
}

export function analyzeAdvancedGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  directed: boolean,
): AdvancedGraphAnalysis {
  const adjacency = new Map<number, Set<number>>();
  nodes.forEach((node) => adjacency.set(node.id, new Set()));
  edges.forEach((edge) => {
    const { source, target } = edgeIds(edge);
    if (source === target) return;
    adjacency.get(source)?.add(target);
    if (!directed) adjacency.get(target)?.add(source);
  });

  const n = nodes.length;
  let planarity: PlanarityStatus = 'unknown';
  if (!directed) {
    const exact = exactPlanarity([...adjacency.keys()], adjacency);
    planarity = exact === null ? 'unknown' : exact ? 'planar' : 'non-planar';
  }

  const maxClique = maximumClique(nodes.map((node) => node.id), adjacency);
  const independentSet = maximumClique(
    nodes.map((node) => node.id),
    new Map(nodes.map((node) => [
      node.id,
      new Set(nodes.filter((other) => other.id !== node.id && !(adjacency.get(node.id)?.has(other.id))).map((other) => other.id)),
    ])),
  );
  const dominatingSet = greedyDominatingSet(nodes.map((node) => node.id), adjacency);
  const weightedMatchingPairs = weightedMatching(nodes.map((node) => node.id), edges, directed);
  const minCut = !directed && n <= 30 ? stoerWagner(nodes.map((node) => node.id), edges) : null;

  return {
    planarity,
    maxClique,
    independentSet,
    dominatingSet,
    weightedMatchingPairs,
    minCutValue: minCut?.value ?? null,
    minCutEdgeIndexes: minCut?.edgeIndexes ?? [],
    minCutSide: minCut?.side ?? [],
  };
}

/**
 * Enumerates cyclic orders around vertices and checks Euler's formula for the
 * resulting combinatorial embedding. This is an exact planarity test; the
 * search is intentionally bounded so the UI remains responsive on large
 * graphs, which are reported as unknown rather than misclassified.
 */
function exactPlanarity(ids: number[], adjacency: Map<number, Set<number>>): boolean | null {
  if (ids.length <= 1) return true;
  const visited = new Set<number>();
  const components: number[][] = [];
  ids.forEach((id) => {
    if (visited.has(id)) return;
    const component: number[] = [];
    const queue = [id];
    visited.add(id);
    while (queue.length) {
      const current = queue.shift()!;
      component.push(current);
      (adjacency.get(current) ?? []).forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      });
    }
    components.push(component);
  });
  if (ids.length > 10) return null;
  let budget = 250_000;
  for (const component of components) {
    const componentSet = new Set(component);
    const edges = component.reduce(
      (total, id) => total + [...(adjacency.get(id) ?? [])].filter((neighbor) => componentSet.has(neighbor)).length,
      0,
    ) / 2;
    if (component.length >= 3 && edges > 3 * component.length - 6) return false;
    const rotations = new Map<number, number[]>();
    const vertices = component.filter((id) => (adjacency.get(id)?.size ?? 0) > 1);
    const enumerate = (index: number): boolean => {
      if (--budget < 0) return false;
      if (index === vertices.length) {
        const darts = new Map<string, string>();
        component.forEach((source) => {
          const neighbors = rotations.get(source) ?? [...(adjacency.get(source) ?? [])];
          neighbors.forEach((target) => {
            const targetRotation = rotations.get(target) ?? [...(adjacency.get(target) ?? [])];
            const predecessor = targetRotation[(targetRotation.indexOf(source) - 1 + targetRotation.length) % targetRotation.length];
            darts.set(`${source}:${target}`, `${target}:${predecessor}`);
          });
        });
        const seen = new Set<string>();
        let faces = 0;
        darts.forEach((next, dart) => {
          if (seen.has(dart)) return;
          faces++;
          let current = dart;
          while (!seen.has(current)) {
            seen.add(current);
            current = darts.get(current)!;
          }
        });
        return component.length - edges + faces === 2;
      }
      const vertex = vertices[index];
      const neighbors = [...(adjacency.get(vertex) ?? [])];
      const first = neighbors[0];
      const permute = (remaining: number[], current: number[]) => {
        if (remaining.length === 0) {
          rotations.set(vertex, [first, ...current]);
          if (enumerate(index + 1)) return true;
          rotations.delete(vertex);
          return false;
        }
        for (let i = 0; i < remaining.length; i++) {
          const next = remaining[i];
          if (permute([...remaining.slice(0, i), ...remaining.slice(i + 1)], [...current, next])) return true;
        }
        return false;
      };
      return permute(neighbors.slice(1), []);
    };
    if (!enumerate(0)) {
      if (budget < 0) return null;
      return false;
    }
  }
  return true;
}

function maximumClique(ids: number[], adjacency: Map<number, Set<number>>): number[] {
  let best: number[] = [];
  const visit = (current: number[], candidates: number[]) => {
    if (current.length + candidates.length <= best.length) return;
    if (current.length > best.length) best = current;
    while (candidates.length) {
      const node = candidates.pop()!;
      const next = candidates.filter((candidate) => adjacency.get(node)?.has(candidate));
      visit([...current, node], next);
    }
  };
  visit([], [...ids]);
  return best;
}

function greedyDominatingSet(ids: number[], adjacency: Map<number, Set<number>>): number[] {
  const dominated = new Set<number>();
  const result: number[] = [];
  while (dominated.size < ids.length) {
    const node = ids
      .filter((id) => !result.includes(id))
      .sort((a, b) => {
        const gain = (id: number) => 1 + [...(adjacency.get(id) ?? [])].filter((neighbor) => !dominated.has(neighbor)).length;
        return gain(b) - gain(a);
      })[0];
    if (node === undefined) break;
    result.push(node);
    dominated.add(node);
    (adjacency.get(node) ?? []).forEach((neighbor) => dominated.add(neighbor));
  }
  return result;
}

function weightedMatching(ids: number[], edges: GraphEdge[], directed: boolean): [number, number, number][] {
  if (directed || ids.length > 16) return [];
  const candidates = edges
    .map((edge, index) => ({ ...edgeIds(edge), weight: edge.weight ?? 1, index }))
    .filter(({ source, target }) => source !== target);
  let best: { weight: number; pairs: [number, number, number][] } = { weight: 0, pairs: [] };
  const visit = (index: number, used: Set<number>, pairs: [number, number, number][], weight: number) => {
    if (weight > best.weight) best = { weight, pairs };
    for (let i = index; i < candidates.length; i++) {
      const edge = candidates[i];
      if (used.has(edge.source) || used.has(edge.target)) continue;
      visit(i + 1, new Set([...used, edge.source, edge.target]), [...pairs, [edge.source, edge.target, edge.weight]], weight + edge.weight);
    }
  };
  visit(0, new Set(), [], 0);
  return best.pairs;
}

function stoerWagner(ids: number[], edges: GraphEdge[]) {
  const weights = new Map<string, number>();
  const key = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  edges.forEach((edge) => {
    const { source, target } = edgeIds(edge);
    if (source !== target) weights.set(key(source, target), (weights.get(key(source, target)) ?? 0) + (edge.weight ?? 1));
  });
  const groups = new Map(ids.map((id) => [id, [id]]));
  if (ids.length <= 20) {
    let best = { value: Infinity, edgeIndexes: [] as number[], side: [] as number[] };
    const limit = 1 << (ids.length - 1);
    for (let mask = 0; mask < limit; mask++) {
      const side = new Set<number>([ids[0]]);
      ids.slice(1).forEach((id, index) => {
        if (mask & (1 << index)) side.add(id);
      });
      if (side.size === ids.length) continue;
      let value = 0;
      const edgeIndexes: number[] = [];
      edges.forEach((edge, index) => {
        const { source, target } = edgeIds(edge);
        if (side.has(source) !== side.has(target)) {
          value += edge.weight ?? 1;
          edgeIndexes.push(index);
        }
      });
      if (value < best.value) best = { value, edgeIndexes, side: [...side] };
    }
    return best;
  }
  let best = { value: Infinity, edgeIndexes: [] as number[], side: [] as number[] };
  while (groups.size > 1) {
    const active = [...groups.keys()];
    const added = new Set<number>();
    const connection = new Map<number, number>();
    let previous = active[0];
    let selected = active[0];
    for (let step = 0; step < active.length; step++) {
      selected = active.filter((id) => !added.has(id)).sort((a, b) => (connection.get(b) ?? 0) - (connection.get(a) ?? 0))[0];
      added.add(selected);
      if (step === active.length - 1) {
        const cut = connection.get(selected) ?? 0;
        if (cut < best.value) {
          const side = new Set(groups.get(selected));
          best = { value: cut, side: [...side], edgeIndexes: edges.map((edge, index) => {
            const { source, target } = edgeIds(edge);
            return side.has(source) !== side.has(target) ? index : -1;
          }).filter((index) => index >= 0) };
        }
        const merged = [...(groups.get(previous) ?? []), ...(groups.get(selected) ?? [])];
        groups.set(previous, merged);
        groups.delete(selected);
      }
      previous = selected;
      active.forEach((id) => {
        if (!added.has(id)) connection.set(id, (connection.get(id) ?? 0) + (weights.get(key(selected, id)) ?? 0));
      });
    }
  }
  return best;
}
