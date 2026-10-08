import { describe, expect, it } from 'vitest';
import { findBipartitePartitions, findHierarchicalLevels } from './graphLayout';
import type { GraphEdge, GraphNode } from '@/types/visualizer';

const nodes = (ids: number[]): GraphNode[] => ids.map((id) => ({ id, label: String(id) }));
const edges = (pairs: [number, number][]): GraphEdge[] =>
  pairs.map(([source, target]) => ({ source, target }));

describe('graph layout helpers', () => {
  it('separa um grafo bipartido em duas partições', () => {
    const result = findBipartitePartitions(nodes([1, 2, 3, 4]), edges([[1, 3], [1, 4], [2, 3]]));
    expect(result.isBipartite).toBe(true);
    expect(result.partitions.get(1)).toBe(result.partitions.get(2));
    expect(result.partitions.get(3)).not.toBe(result.partitions.get(1));
  });

  it('rejeita ciclos ímpares como não bipartidos', () => {
    const result = findBipartitePartitions(nodes([1, 2, 3]), edges([[1, 2], [2, 3], [3, 1]]));
    expect(result.isBipartite).toBe(false);
  });

  it('calcula níveis de um DAG', () => {
    const levels = findHierarchicalLevels(nodes([1, 2, 3, 4]), edges([[1, 2], [1, 3], [2, 4], [3, 4]]), true);
    expect(levels.get(1)).toBe(0);
    expect(levels.get(2)).toBe(1);
    expect(levels.get(3)).toBe(1);
    expect(levels.get(4)).toBe(2);
  });

  it('usa o caminho mais longo para posicionar um DAG', () => {
    const levels = findHierarchicalLevels(
      nodes([1, 2, 3, 4]),
      edges([[1, 2], [1, 3], [2, 4], [3, 4]]),
      true,
    );
    expect(levels.get(4)).toBe(2);
  });

  it('calcula níveis por componente em uma floresta', () => {
    const levels = findHierarchicalLevels(nodes([1, 2, 3, 4]), edges([[1, 2], [2, 3]]), false);
    expect(levels.get(1)).toBe(0);
    expect(levels.get(2)).toBe(1);
    expect(levels.get(3)).toBe(2);
    expect(levels.get(4)).toBe(0);
  });
});
