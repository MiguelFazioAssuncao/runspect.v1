import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReferenceView } from './ReferenceView';
import type { ReferenceSnapshot } from '@/lib/references';

const render = (snapshot: ReferenceSnapshot) => renderToStaticMarkup(createElement(ReferenceView, { snapshot }));

describe('ReferenceView', () => {
  it('shows object fields, cycles, null roots and released or unknown destinations', () => {
    const html = render({
      roots: [{ name: 'head', target: 1 }, { name: 'tail', target: null }],
      objects: [
        { id: 1, type: 'Node', status: 'observed', fields: [{ name: 'next', value: '@1', target: 1, changed: true }] },
        { id: 2, type: 'Node', status: 'released', fields: [] },
        { id: 3, type: 'objeto', status: 'unobserved', fields: [] },
      ],
    });
    expect(html).toContain('data-reference-edges');
    expect(html).toContain('@1.next → @1');
    expect(html).toContain('nullptr');
    expect(html).toContain('Este objeto foi liberado');
    expect(html).toContain('seus campos não foram capturados');
    expect(html).toContain('Campos completos');
  });

  it('paginates large snapshots and escapes user data', () => {
    const objects = Array.from({ length: 70 }, (_, index) => ({ id: index + 1, type: '<script>', status: 'observed' as const, fields: [{ name: 'data', value: '<img>' }] }));
    const html = render({ roots: [], objects });
    expect(html).toContain('página 1 / 3');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<img>');
    expect((html.match(/class="reference-object reference-object-observed"/g) ?? []).length).toBe(32);
  });

  it('provides pages for every captured field in wide records', () => {
    const fields = Array.from({ length: 200 }, (_, index) => ({ name: `field${index}`, value: String(index) }));
    const html = render({ roots: [], objects: [{ id: 1, type: 'Wide', status: 'observed', fields }] });
    expect(html).toContain('campos 1–128 de 200 · página 1 / 2');
    expect(html).toContain('Próxima página de campos do objeto @1');
    expect((html.match(/<dt>/g) ?? []).length).toBe(128);
  });
});
