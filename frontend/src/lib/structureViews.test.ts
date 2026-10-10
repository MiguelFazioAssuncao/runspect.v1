import { describe, expect, it } from 'vitest';
import { binaryTree, diffStructureItems, inferStructureView, mapEntry, matrixShape, pairFields, parentForest, recordEntry, structureSize } from './structureViews';

describe('typed structure presentation', () => {
  it.each([
    ['set', 'set'], ['multiset', 'set'], ['unordered_set', 'set'],
    ['map', 'map'], ['unordered_map', 'map'], ['pair', 'record'], ['tuple', 'record'],
    ['vector-pair', 'sequence'], ['stack', 'stack'], ['queue', 'queue'], ['deque', 'deque'],
    ['priority_queue', 'priority'], ['bitset', 'bits'], ['string', 'string'],
    ['union-find', 'union-find'], ['binary-tree', 'binary-tree'],
  ])('uses metadata %s to select %s', (kind, view) => {
    expect(inferStructureView({ kind })).toBe(view);
  });

  it('does not infer union-find from an ordinary parent vector', () => {
    expect(inferStructureView({ kind: 'vector' })).toBe('sequence');
    expect(inferStructureView({})).toBe('items');
  });

  it('keeps nested keys and tuples intact while separating their fields', () => {
    expect(mapEntry('(1, (2, 3)) → 5', 0)).toEqual({ key: '(1, (2, 3))', value: '5' });
    expect(pairFields('((1, 2), (3, 4))')).toEqual(['(1, 2)', '(3, 4)']);
    expect(pairFields('("a, b", 2)')).toEqual(['"a, b"', '2']);
    expect(recordEntry('second = (2, 3)', 1, 'pair')).toEqual({ key: 'second', value: '(2, 3)' });
  });

  it('records inserting a set value without marking shifted values as changed', () => {
    expect(diffStructureItems(['2', '4'], ['1', '2', '4'], 'set')).toEqual([{ index: 0, key: '1', after: '1', kind: 'inserted' }]);
    expect(diffStructureItems(['1', '2', '2'], ['1', '2'], 'multiset')).toEqual([{ index: 2, key: '2', before: '2', kind: 'removed' }]);
  });

  it('identifies map changes by key regardless of captured iteration order', () => {
    expect(diffStructureItems(['a → 1', 'b → 2'], ['b → 3', 'a → 1'], 'unordered_map')).toEqual([{ index: 0, key: 'b', before: 'b → 2', after: 'b → 3', kind: 'changed' }]);
  });

  it('compares arrays by index and retains removals', () => {
    expect(diffStructureItems(['5', '9'], ['4'], 'vector')).toEqual([
      { index: 0, before: '5', after: '4', kind: 'changed' },
      { index: 1, before: '9', kind: 'removed' },
    ]);
  });

  it('preserves the real size separately from capture limits', () => {
    expect(structureSize({ name: 's', items: ['1', '2'], size: 600, truncated: 598 })).toBe(600);
    expect(structureSize({ name: 's', items: ['1', '2'], truncated: 5 })).toBe(7);
    expect(matrixShape({ name: 'm', rows: [['1']], shape: { rows: 50, cols: 30 }, size: 1500 })).toEqual({ rows: 50, cols: 30 });
  });

  it('builds parent forests with self roots or negative size roots', () => {
    expect(parentForest(['0', '0', '1', '3'])?.map(item => [item.root, item.depth])).toEqual([[0, 0], [0, 1], [0, 2], [3, 0]]);
    expect(parentForest(['-3', '0', '0'])?.map(item => item.root)).toEqual([0, 0, 0]);
  });

  it('rejects cyclic, out-of-range and lossy parent arrays', () => {
    expect(parentForest(['1', '0'])).toBeNull();
    expect(parentForest(['9', '1'])).toBeNull();
    expect(parentForest(['0', '9007199254740993'])).toBeNull();
    expect(parentForest(['zero'])).toBeNull();
  });

  it('maps binary heap indices to parents and preserves ordinary negative values', () => {
    expect(binaryTree(['-1', '2', '3', 'null', '5']).map(item => [item.index, item.parent, item.depth])).toEqual([[0, null, 0], [1, 0, 1], [2, 0, 1], [4, 1, 2]]);
  });
});
