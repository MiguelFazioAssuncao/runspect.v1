import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StructsPanel } from './StructsPanel';

describe('StructsPanel', () => {
  it('mostra cada variável como nome e valor na visualização principal', () => {
    const html = renderToStaticMarkup(createElement(StructsPanel, {
      primary: true, solo: true,
      structs: [{ name: 'Variáveis', items: ['a = 48', 'b = 18'] }],
    }));
    expect(html).toContain('structs-panel-primary structs-panel-solo');
    expect(html).toContain('class="variable-name">a</span>');
    expect(html).toContain('class="variable-value">48</strong>');
    expect(html).toContain('class="variable-name">b</span>');
  });

  it('preserva tuplas, opcionais e estruturas vazias na área principal', () => {
    const html = renderToStaticMarkup(createElement(StructsPanel, {
      primary: true,
      structs: [{ name: 'melhor', items: ['sem valor'] }, { name: 'registro', items: ['0 = 3', '1 = 25'] }, { name: 'registros', items: [] }],
    }));
    expect(html).toContain('sem valor');
    expect(html).toContain('0 = 3');
    expect(html).toContain('1 = 25');
    expect(html).toContain('vazio');
  });

  it('mantém os chips compactos quando acompanha um grafo', () => {
    const html = renderToStaticMarkup(createElement(StructsPanel, {
      structs: [{ name: 'Variáveis', items: ['a = 48'] }],
    }));
    expect(html).toContain('struct-chip');
    expect(html).toContain('a = 48');
    expect(html).not.toContain('variable-card');
  });
});
