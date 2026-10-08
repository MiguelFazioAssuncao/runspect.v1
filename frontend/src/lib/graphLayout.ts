import type { GraphEdge, GraphNode } from '@/types/visualizer';

export type Partition = 0 | 1;

const edgeIds = (edge: GraphEdge) => ({
  source: typeof edge.source === 'number' ? edge.source : edge.source.id,
  target: typeof edge.target === 'number' ? edge.target : edge.target.id,
});

export function findBipartitePartitions(
  nodes: GraphNode[],
  edges: GraphEdge[],
): { partitions: Map<number, Partition>; isBipartite: boolean } {
  const adjacency = new Map<number, number[]>();
  nodes.forEach((node) => adjacency.set(node.id, []));
  edges.forEach((edge) => {
    const { source, target } = edgeIds(edge);
    if (source !== target) {
      adjacency.get(source)?.push(target);
      adjacency.get(target)?.push(source);
    }
  });

  const partitions = new Map<number, Partition>();
  let isBipartite = true;
  nodes.forEach((node) => {
    if (partitions.has(node.id)) return;
    partitions.set(node.id, 0);
    const queue = [node.id];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) continue;
      const currentPartition = partitions.get(current) ?? 0;
      adjacency.get(current)?.forEach((neighbor) => {
        const expected: Partition = currentPartition === 0 ? 1 : 0;
        const existing = partitions.get(neighbor);
        if (existing === undefined) {
          partitions.set(neighbor, expected);
          queue.push(neighbor);
        } else if (existing !== expected) {
          isBipartite = false;
        }
      });
    }
  });

  return { partitions, isBipartite };
}

export function findHierarchicalLevels(
  nodes: GraphNode[],
  edges: GraphEdge[],
  directed: boolean,
): Map<number, number> {
  const adjacency = new Map<number, number[]>();
  const indegree = new Map<number, number>();
  nodes.forEach((node) => {
    adjacency.set(node.id, []);
    indegree.set(node.id, 0);
  });

  edges.forEach((edge) => {
    const { source, target } = edgeIds(edge);
    if (source === target) return;
    adjacency.get(source)?.push(target);
    if (directed) indegree.set(target, (indegree.get(target) ?? 0) + 1);
    else adjacency.get(target)?.push(source);
  });

  const levels = new Map<number, number>();
  const queue = directed
    ? nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id)
    : nodes.length > 0
      ? [nodes[0].id]
      : [];
  queue.forEach((id) => levels.set(id, 0));

  while (queue.length > 0 || levels.size < nodes.length) {
    if (queue.length === 0) {
      const nextRoot = nodes.find((node) => !levels.has(node.id));
      if (!nextRoot) break;
      levels.set(nextRoot.id, 0);
      queue.push(nextRoot.id);
    }
    const current = queue.shift();
    if (current === undefined) continue;
    const nextLevel = (levels.get(current) ?? 0) + 1;
    adjacency.get(current)?.forEach((neighbor) => {
      if (directed) {
        levels.set(neighbor, Math.max(levels.get(neighbor) ?? 0, nextLevel));
        const remaining = (indegree.get(neighbor) ?? 0) - 1;
        indegree.set(neighbor, remaining);
        if (remaining === 0) queue.push(neighbor);
      } else if (!levels.has(neighbor)) {
        levels.set(neighbor, nextLevel);
        queue.push(neighbor);
      }
    });
  }

  nodes.forEach((node) => {
    if (!levels.has(node.id)) levels.set(node.id, 0);
  });
  return levels;
}
