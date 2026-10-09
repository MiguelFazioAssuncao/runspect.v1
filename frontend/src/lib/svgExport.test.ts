import { describe, expect, it } from 'vitest';
import { DEFAULT_SVG_OPTIONS, svgExportGeometry, svgFilename } from './svgExport';

const viewport = { x: 0, y: 0, width: 800, height: 400 };
const content = { x: -120, y: -50, width: 1000, height: 600 };

describe('enquadramento SVG', () => {
  it('inclui conteúdo fora da tela e margem para traços e setas', () => {
    const file = svgExportGeometry(viewport, content, DEFAULT_SVG_OPTIONS);
    expect(file.viewBox.x).toBeLessThan(content.x);
    expect(file.viewBox.y).toBeLessThan(content.y);
    expect(file.viewBox.x + file.viewBox.width).toBeGreaterThan(content.x + content.width);
    expect(file.viewBox.y + file.viewBox.height).toBeGreaterThan(content.y + content.height);
  });
  it('preserva exatamente o recorte original mesmo com origem diferente', () => {
    const shifted = { ...viewport, x: 10, y: -20 };
    expect(svgExportGeometry(shifted, content, { ...DEFAULT_SVG_OPTIONS, scope: 'viewport' }).viewBox).toEqual(shifted);
  });
  it('amplia as dimensões sem alterar as coordenadas vetoriais', () => {
    const original = svgExportGeometry(viewport, content, DEFAULT_SVG_OPTIONS);
    const large = svgExportGeometry(viewport, content, { ...DEFAULT_SVG_OPTIONS, scale: 4 });
    expect(large.viewBox).toEqual(original.viewBox);
    expect(large.width).toBe(original.width * 4);
    expect(large.height).toBe(original.height * 4);
  });
  it('rejeita grafo ainda não renderizado ou dimensões inválidas', () => {
    expect(() => svgExportGeometry(viewport, { ...content, width: 0 }, DEFAULT_SVG_OPTIONS)).toThrow('dimensões');
    expect(() => svgExportGeometry({ ...viewport, x: NaN }, content, DEFAULT_SVG_OPTIONS)).toThrow('dimensões');
  });
});

describe('nome do download SVG', () => {
  it('preserva Unicode e garante uma única extensão SVG', () => {
    expect(svgFilename('  busca — ação.SVG.svg  ')).toBe('busca — ação.svg');
  });
  it('remove caminhos e caracteres incompatíveis com arquivos', () => {
    expect(svgFilename('../grafo/teste:1.svg')).toBe('-grafo-teste-1.svg');
    expect(svgFilename('')).toBe('runspect-grafo.svg');
    expect(svgFilename('CON.svg')).toBe('runspect-CON.svg');
    expect(svgFilename('x'.repeat(200))).toHaveLength(124);
  });
});
