import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureFontCSS } from './captureFonts';

const rule = (family: string, url: string) => ({
  type: 5, cssText: `@font-face {font-family: "${family}"; src: url("${url}");}`,
  style: { getPropertyValue: () => family },
});
const area = { querySelectorAll: () => [] } as unknown as HTMLElement;
function setup() {
  const forbidden = { get cssRules() { throw new Error('cross-origin'); } };
  vi.stubGlobal('CSSRule', { FONT_FACE_RULE: 5 });
  vi.stubGlobal('getComputedStyle', () => ({ fontFamily: 'Geist, sans-serif' }));
  vi.stubGlobal('document', {
    baseURI: 'http://localhost:3000/',
    styleSheets: [forbidden, { href: 'http://localhost:3000/styles/main.css', cssRules: [rule('Geist', '../font.woff2'), rule('codicon', 'editor.woff')] }],
  });
  const fetcher = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'font/woff2' } }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());

describe('fontes da gravação', () => {
  it('ignora CSS inacessível e incorpora apenas a fonte usada na área', async () => {
    const fetcher = setup();
    const css = await captureFontCSS(area, []);
    expect(css).toContain('data:font/woff2;base64,AQID');
    expect(css).not.toContain('codicon');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('http://localhost:3000/font.woff2');
  });

  it('não baixa fontes depois de uma interrupção', async () => {
    const fetcher = setup();
    const controller = new AbortController();
    controller.abort(new Error('interrompido'));
    await expect(captureFontCSS(area, [controller.signal])).rejects.toThrow('interrompido');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('propaga falhas de download sem produzir uma fonte inválida', async () => {
    setup().mockResolvedValue(new Response('', { status: 404 }));
    await expect(captureFontCSS(area, [])).rejects.toThrow('carregar uma fonte');
  });
});
