const SVG_NS = 'http://www.w3.org/2000/svg';
const PADDING = 24;

export interface SvgBox { x: number; y: number; width: number; height: number }
export interface SvgExportOptions {
  scope: 'graph' | 'viewport';
  background: 'dark' | 'light' | 'transparent';
  scale: 1 | 2 | 4;
  includeDescription: boolean;
}
export interface SvgSnapshot {
  svg: SVGSVGElement;
  viewport: SvgBox;
  content: SvgBox;
  title: string;
  description: string;
}
export interface SvgExportFile { source: string; width: number; height: number }
export const DEFAULT_SVG_OPTIONS: SvgExportOptions = {
  scope: 'graph', background: 'dark', scale: 1, includeDescription: true,
};

function validBox(box: SvgBox) {
  return [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width > 0 && box.height > 0;
}

export function svgExportGeometry(viewport: SvgBox, content: SvgBox, options: SvgExportOptions) {
  if (!validBox(viewport) || !validBox(content) || ![1, 2, 4].includes(options.scale)) {
    throw new Error('O grafo ainda não tem dimensões válidas para exportação.');
  }
  const viewBox = options.scope === 'graph'
    ? { x: content.x - PADDING, y: content.y - PADDING, width: content.width + PADDING * 2, height: content.height + PADDING * 2 }
    : { ...viewport };
  return { viewBox, width: Math.ceil(viewBox.width * options.scale), height: Math.ceil(viewBox.height * options.scale) };
}

export function svgFilename(value: string) {
  const base = value.trim().replace(/(?:\.svg)+$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-')
    .replace(/^\.+|[. ]+$/g, '').slice(0, 120).replace(/[. ]+$/g, '');
  const safe = !base ? 'runspect-grafo' : /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base) ? `runspect-${base}` : base;
  return `${safe}.svg`;
}

export function captureSvgSnapshot(svg: SVGSVGElement | null, title: string, description = ''): SvgSnapshot {
  const content = svg?.querySelector<SVGGElement>('[data-graph-content]');
  if (!svg || !content) throw new Error('Não há um grafo pronto para exportar.');
  const box = content.getBBox();
  const viewport = svg.viewBox.baseVal;
  const snapshot = {
    svg: svg.cloneNode(true) as SVGSVGElement,
    content: { x: box.x, y: box.y, width: box.width, height: box.height },
    viewport: { x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height },
    title, description,
  };
  svgExportGeometry(snapshot.viewport, snapshot.content, DEFAULT_SVG_OPTIONS);
  return snapshot;
}

export function buildSvgExport(snapshot: SvgSnapshot, options: SvgExportOptions): SvgExportFile {
  const { viewBox, width, height } = svgExportGeometry(snapshot.viewport, snapshot.content, options);
  const clone = snapshot.svg.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute('style');
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
  clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  clone.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
  clone.setAttribute('role', 'img');
  clone.setAttribute('aria-labelledby', 'export-title');
  clone.removeAttribute('aria-describedby');
  if (options.scope === 'graph') clone.querySelector('[data-graph-content]')?.removeAttribute('transform');

  // Neutral text/halos adapt to paper; algorithm colors and marker references stay intact.
  if (options.background !== 'dark') {
    clone.querySelectorAll('text').forEach((text) => {
      const fill = text.getAttribute('fill');
      if (fill === '#94a3b8') text.setAttribute('fill', '#475569');
      if (fill === '#fbbf24') text.setAttribute('fill', '#92400e');
      if (options.background === 'transparent') {
        text.removeAttribute('stroke');
        text.removeAttribute('stroke-width');
      } else if (text.getAttribute('stroke') === '#020617') text.setAttribute('stroke', '#ffffff');
    });
    clone.querySelectorAll('circle[stroke="#ffffff"]').forEach((circle) => circle.setAttribute('stroke', '#334155'));
  }

  if (options.background !== 'transparent') {
    const background = document.createElementNS(SVG_NS, 'rect');
    background.setAttribute('data-export-background', '');
    for (const [key, value] of Object.entries(viewBox)) background.setAttribute(key, String(value));
    background.setAttribute('fill', options.background === 'light' ? '#ffffff' : '#020617');
    clone.insertBefore(background, clone.firstChild);
  }
  const title = document.createElementNS(SVG_NS, 'title');
  title.id = 'export-title';
  title.textContent = snapshot.title;
  clone.insertBefore(title, clone.firstChild);
  if (options.includeDescription && snapshot.description) {
    const description = document.createElementNS(SVG_NS, 'desc');
    description.id = 'export-description';
    description.textContent = snapshot.description;
    clone.setAttribute('aria-describedby', description.id);
    clone.insertBefore(description, title.nextSibling);
  }
  const source = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
  return { source, width, height };
}
