import type { TraceStep } from '@/types/visualizer';
import { buildSvgExport, captureSvgSnapshot, DEFAULT_SVG_OPTIONS, svgFilename } from './svgExport';

export const downloadFile = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Allow the browser to start reading the file before releasing its URL.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
};

export const exportSvg = (svg: SVGSVGElement | null, filename = 'grafo.svg') => {
  if (!svg) return;
  const file = buildSvgExport(captureSvgSnapshot(svg, 'Grafo Runspect'), DEFAULT_SVG_OPTIONS);
  downloadFile(new Blob([file.source], { type: 'image/svg+xml;charset=utf-8' }), svgFilename(filename));
};

export const exportJson = (steps: TraceStep[], filename = 'execucao.json') => {
  const text = JSON.stringify(steps, null, 2);
  downloadFile(new Blob([text], { type: 'application/json;charset=utf-8' }), filename);
};
