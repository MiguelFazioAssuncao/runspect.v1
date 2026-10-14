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
  it('exibe distância inalcançável como infinito nas células, operação e resultado', () => {
    const infinity = 9223372036854776000;
    const html = render([snapshot({
      name: 'dist',
      items: [{ index: 0, value: 0, state: 'default' }, { index: 1, value: infinity, displayValue: '∞', state: 'active' }],
      operation: { kind: 'set', index: 1, value: infinity },
      result: [0, infinity], range: null, pivot: null, caption: '',
    })]);
    expect(html).not.toContain(String(infinity));
    expect(html).toContain('escrita: [1] = ∞');
    expect(html).toContain('resultado: 0, ∞');
    expect(html).toContain('1: ∞ (ativo)');
  });

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
    expect(render([snapshot({ items: [], operation: null, range: null, pivot: null })])).toContain('vazio (size 0)');
  });

  it('mostra tipo semântico, tamanho real e valores de vetor compacto', () => {
    const items = Array.from({ length: 70 }, (_, index) => ({ index, value: index + 1000, state: 'default' as const }));
    const html = render([snapshot({ items, size: 300, truncated: 230, operation: null, range: null, pivot: null })]);
    expect(html).toContain('1000');
    expect(html).toContain('1069');
    expect(html).toContain('size 300');
    expect(html).toContain('+230 elementos não capturados');
    expect(render([snapshot({ initialized: false, items: [], operation: null })])).toContain('ainda não inicializado');
  });

  it('não renderiza nada sem vetores', () => {
    expect(render([])).toBe('');
  });

  it('lista eventos ignorados', () => {
    const html = render([snapshot()], [{ event: 2, step_event: 'VECTOR_SWAP', reason: 'índices fora do intervalo' }]);
    expect(html).toContain('evento 3 ignorado');
    expect(html).toContain('índices fora do intervalo');
  });

  it('pagina as células renderizadas e informa o total', () => {
    const items = Array.from({ length: 600 }, (_, index) => ({ index, value: index, state: 'default' as const }));
    const html = render([snapshot({ items, operation: null, range: null, pivot: null })]);
    expect(html).toContain('elementos 0–511 de 600 · página 1 / 2');
    expect(html).toContain('Próxima página do vetor a');
    expect((html.match(/class="vector-index"/g) ?? []).length).toBe(512);
  });

  it('abre a página que contém a operação ativa', () => {
    const items = Array.from({ length: 600 }, (_, index) => ({ index, value: index, state: 'default' as const }));
    const html = render([snapshot({ items, operation: { kind: 'set', index: 599, value: 599 }, range: null, pivot: null })]);
    expect(html).toContain('elementos 512–599 de 600 · página 2 / 2');
    expect(html).toContain('599: 599');
    expect((html.match(/class="vector-index"/g) ?? []).length).toBe(88);
  });

  it('não mantém o GenericTracePanel no projeto', () => {
    expect(existsSync(fileURLToPath(new URL('./GenericTracePanel.tsx', import.meta.url)))).toBe(false);
  });
});
