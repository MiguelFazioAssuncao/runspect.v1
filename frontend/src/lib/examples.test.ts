import { describe, expect, it } from 'vitest';
import { convertToPureCpp } from './codeConversion';
import { CPP_HEADER, CPP_MAIN } from './cppTemplate';
import { examples } from './examples';

const originalIds = [
  'bubble-sort', 'binary-search', 'two-pointers', 'segment-tree', 'bfs-shortest-path',
  'dfs', 'dijkstra', 'kruskal', 'topological-sort', 'knapsack', 'sieve',
  'greedy-activity', 'backtracking-subsets', 'kmp', 'max-flow', 'two-sum',
];
const newIds = [
  'merge-sort', 'prefix-sum', 'sliding-window', 'fenwick-tree', 'lis',
  'zero-one-bfs', 'binary-exponentiation', 'euclidean-gcd',
  'tuple-optional', 'bitset-switch',
  'linked-list-reversal', 'bst-insertion', 'trie-prefix-count', 'huffman-tree',
  'generic-insertion-sort', 'constexpr-factorial', 'postfix-evaluation',
  'euclidean-gcd-goto', 'lcs-string-table',
];

describe('catálogo de técnicas em C++ puro', () => {
  it('preserva todas as técnicas anteriores e inclui as novas, com IDs únicos', () => {
    const ids = examples.map((example) => example.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [...originalIds, ...newIds]) expect(ids).toContain(id);
  });

  it('mantém entradas, saídas e metadados completos', () => {
    for (const example of examples) {
      expect(example.name, example.id).not.toBe('');
      expect(example.stdin, example.id).toContain('\n');
      expect(example.expectedOutput, example.id).toContain('\n');
      expect(example.description, example.id).toContain('Entrada:');
      expect(example.description, example.id).toContain('Saída:');
      expect(example.category, example.id).not.toBe('');
      expect(example.tags.length, example.id).toBeGreaterThan(0);
      expect(example.timeComplexity, example.id).not.toBe('');
      expect(example.memoryComplexity, example.id).not.toBe('');
    }
  });

  it('entrega programas independentes usando o template competitivo fornecido', () => {
    for (const example of examples) {
      expect(example.code.startsWith(CPP_HEADER), example.id).toBe(true);
      expect(example.code.endsWith(CPP_MAIN), example.id).toBe(true);
      expect(example.code, example.id).toContain('void solve() {');
      expect(example.code.match(/\bmain\s*\(/g), example.id).toHaveLength(1);
      expect(example.code, example.id).not.toContain('viz::');
      expect(example.code, example.id).not.toContain('visualizer.h');
      expect(example.code, example.id).not.toContain('automatic.h');
    }
  });

  it('preserva os programas ao exportar para C++ puro', () => {
    for (const example of examples) {
      expect(convertToPureCpp(example.code), example.id).toBe(example.code);
    }
  });
});
