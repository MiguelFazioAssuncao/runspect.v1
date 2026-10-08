import type { TraceStep } from '@/types/visualizer';

const download = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export const exportSvg = (svg: SVGSVGElement | null, filename = 'grafo.svg') => {
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const width = svg.viewBox.baseVal.width || svg.clientWidth;
  const height = svg.viewBox.baseVal.height || svg.clientHeight;

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('width', '100%');
  background.setAttribute('height', '100%');
  background.setAttribute('fill', '#020617');
  clone.insertBefore(background, clone.firstChild);

  const text = new XMLSerializer().serializeToString(clone);
  download(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }), filename);
};

export const exportJson = (steps: TraceStep[], filename = 'execucao.json') => {
  const text = JSON.stringify(steps, null, 2);
  download(new Blob([text], { type: 'application/json;charset=utf-8' }), filename);
};