import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VectorSortPanel } from './VectorSortPanel';
import type { VectorSnapshot } from '@/types/visualizer';

const snapshot = (overrides: Partial<VectorSnapshot> = {}): VectorSnapshot => ({
  name: 'a',
  initial: [3, -1, 3],
  items: [
    { index: 0, value: 3, state: 'comparing' },
    { index: 1, value: -1, state: 'sorted' },
    { index: 2, value: 3, state: 'pivot' },
  ],
  operation: { kind: 'compare', a: 0, b: 1 },
  range: { start: 0, end: 2 },
  pivot: 2,
  caption: 'comparando',
  result: null,
  ...overrides,
});

const render = (vectors: VectorSnapshot[], issues: { event: number; step_event: string; reason: string }[] = []) =>
  renderToStaticMarkup(createElement(VectorSortPanel, { vectors, issues }));

describe('VectorSortPanel', () => {
  it('renderiza índice, valor, estado, intervalo, pivô, operação e legenda', () => {
    const html = render([snapshot()]);
    expect(html).toContain('vector-cell-comparing');
    expect(html).toContain('vector-cell-sorted');
    expect(html).toContain('vector-cell-pivot');
    expect(html).toContain('-1');
    expect(html).toContain('intervalo [0, 2]');
    expect(html).toContain('pivô: índice 2');
    expect(html).toContain('comparação');
    expect(html).toContain('comparando');
  });

  it('renderiza vetor vazio', () => {
    expect(render([snapshot({ items: [], operation: null, range: null, pivot: null })])).toContain('vetor vazio');
  });

  it('não renderiza nada sem vetores', () => {
    expect(render([])).toBe('');
  });

  it('lista eventos ignorados', () => {
    const html = render([snapshot()], [{ event: 2, step_event: 'VECTOR_SWAP', reason: 'índices fora do intervalo' }]);
    expect(html).toContain('evento 3 ignorado');
    expect(html).toContain('índices fora do intervalo');
  });

  it('limita células renderizadas e informa o total', () => {
    const items = Array.from({ length: 600 }, (_, index) => ({ index, value: index, state: 'default' as const }));
    const html = render([snapshot({ items, operation: null, range: null, pivot: null })]);
    expect(html).toContain('exibindo os primeiros 512 de 600 elementos');
  });

  it('não mantém o GenericTracePanel no projeto', () => {
    expect(existsSync(fileURLToPath(new URL('./GenericTracePanel.tsx', import.meta.url)))).toBe(false);
  });
});