import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CallTree, MatrixView, StructureView } from './StructureViews';
import type { StructureSnapshot } from '@/lib/structureViews';

const renderStructure = (snapshot: StructureSnapshot) => renderToStaticMarkup(createElement(StructureView, { snapshot }));

describe('semantic views', () => {
  it('distinguishes uninitialized state from actual size zero', () => {
    expect(renderStructure({ name: 'q', items: [], kind: 'queue', initialized: false })).toContain('ainda não inicializado');
    expect(renderStructure({ name: 'q', items: [], kind: 'queue', initialized: true })).toContain('vazio (size 0)');
  });

  it('renders keys, insertion/change/comparison symbols and removed values', () => {
    const html = renderStructure({ name: 'm', items: ['a → 2', 'b → 3', 'c → 4'], kind: 'map', changes: [
      { index: 0, kind: 'inserted', after: 'a → 2' },
      { index: 1, kind: 'changed', before: 'b → 1', after: 'b → 3' },
      { index: 2, kind: 'compared' },
      { index: 3, kind: 'removed', before: 'd → 5', key: 'd' },
    ] });
    expect(html).toContain('structure-view-map');
    expect(html).toContain('m[a] = 2, inserido');
    expect(html).toContain('aria-label="comparado"');
    expect(html).toContain('↻');
    expect(html).toContain('≟');
    expect(html).toContain('<del>d → 5</del>');
    expect(html).toContain('antes: b → 1');
  });

  it('caps rendered items at 32 and separates unseen capture data', () => {
    const html = renderStructure({ name: 's', items: Array.from({ length: 256 }, (_, index) => String(index)), kind: 'set', size: 600, truncated: 344 });
    expect((html.match(/class="structure-element struct-chip /g) ?? []).length).toBe(32);
    expect(html).toContain('+568 elementos');
    expect(html).toContain('256 capturados de 600');
    expect(html).toContain('página 1 / 8');
  });

  it.each(['stack', 'queue', 'deque', 'priority_queue'])('describes the removal end for %s', kind => {
    const html = renderStructure({ name: 'q', kind, items: ['8', '4', '1'] });
    expect(html).toContain('aria-label="Visualização de q"');
    expect(html).toContain(kind === 'stack' || kind === 'priority_queue' ? 'topo' : 'frente');
    expect(html).toContain('8');
  });

  it('preserves exact large integers and pair member descriptions', () => {
    const html = renderStructure({ name: 'A', kind: 'vector-pair', items: ['(9007199254740993, 2)'] });
    expect(html).toContain('9007199254740993');
    expect(html).toContain('first: 9007199254740993');
    expect(html).toContain('second: 2');
  });

  it('explains that a custom comparator queue exposes only its top', () => {
    const html = renderStructure({ name: 'heap', kind: 'priority_queue', items: ['topo = 8', 'tamanho = 40'], size: 40, opaque: true });
    expect(html).toContain('Somente topo capturado; comparador personalizado');
    expect(html).toContain('conteúdo interno indisponível');
    expect(html).toContain('+39 elementos');
    expect((html.match(/class="structure-element struct-chip /g) ?? []).length).toBe(1);
    expect(html).not.toContain('ordem de remoção por prioridade');
  });

  it('renders a union-find forest and warns for malformed parent links', () => {
    expect(renderStructure({ name: 'parent', kind: 'union-find', items: ['0', '0', '2'] })).toContain('2 conjuntos');
    expect(renderStructure({ name: 'parent', kind: 'union-find', items: ['1', '0'] })).toContain('não forma uma floresta');
  });

  it('marks matrix writes and dependency cells without depending on color', () => {
    const html = renderToStaticMarkup(createElement(MatrixView, { snapshot: {
      name: 'dp', kind: 'dp', rows: [['0', '2'], ['3', '5']],
      active: { row: 1, col: 1, access: 'write' }, dependencies: [{ row: 0, col: 1 }, { row: 1, col: 0 }],
    } }));
    expect(html).toContain('matrix-cell-active');
    expect(html).toContain('matrix-cell-dependency');
    expect(html).toContain('dp[1][1] = 5, escrita atual');
    expect(html).toContain('aria-label="dependência"');
    expect(html).toContain('✎');
    expect(html).toContain('↗ dp[0][1]');
  });

  it('opens a bounded matrix page around the currently accessed cell', () => {
    const rows = Array.from({ length: 10 }, (_, r) => Array.from({ length: 20 }, (_, c) => `${r}:${c}`));
    const html = renderToStaticMarkup(createElement(MatrixView, { snapshot: { name: 'grid', rows, active: { row: 8, col: 18 } } }));
    expect(html).toContain('grid[8][18] = 8:18, leitura atual');
    expect((html.match(/<td /g) ?? []).length).toBeLessThanOrEqual(32);
    expect(html).not.toContain('grid[0][0]');
  });

  it('keeps active call frames and returned historical calls distinct', () => {
    const html = renderToStaticMarkup(createElement(CallTree, { calls: [
      { id: 1, function: 'main', depth: 0, line: 1, status: 'active' },
      { id: 2, parent: 1, function: 'dfs', depth: 1, line: 8, status: 'returned' },
      { id: 3, parent: 1, function: 'dfs', depth: 1, line: 8, status: 'active' },
    ] }));
    expect(html).toContain('▶ topo');
    expect(html).toContain('call-entry-returned');
    expect(html).toContain('pai #1');
    expect(html).toContain('aria-label="retornou"');
  });
});
