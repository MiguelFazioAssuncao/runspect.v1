'use client';

import React from 'react';
import { Download, Maximize2, Minimize2, Scan, Square, Video, ZoomIn, ZoomOut } from 'lucide-react';
import { useLocale } from '@/lib/i18n';
import type { GraphLayout } from './GraphCanvas';

interface GraphToolbarProps {
  layout: GraphLayout;
  onLayoutChange: (layout: GraphLayout) => void;
  onExportSvg: () => void;
  onExportJson: () => void;
  hasGraph: boolean;
  hasSteps: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  canRecord: boolean;
  isRecording: boolean;
  isFinalizing?: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export const GraphToolbar: React.FC<GraphToolbarProps> = ({
  layout,
  onLayoutChange,
  onExportSvg,
  onExportJson,
  hasGraph,
  hasSteps,
  onZoomIn,
  onZoomOut,
  onFit,
  isFullscreen,
  onToggleFullscreen,
  canRecord,
  isRecording,
  isFinalizing = false,
  onStartRecording,
  onStopRecording,
}) => {
  const { tr } = useLocale();
  return (
  <div className="graph-toolbar">
    {hasGraph && <>
    <select
      className="example-select"
      value={layout}
      disabled={isRecording}
      onChange={(e) => onLayoutChange(e.target.value as GraphLayout)}
      aria-label={tr('Layout do grafo', 'Graph layout')}
    >
      <option value="force">{tr('Forças', 'Force')}</option>
      <option value="circular">{tr('Circular', 'Circular')}</option>
      <option value="grid">{tr('Grade', 'Grid')}</option>
      <option value="bipartite">{tr('Bipartido', 'Bipartite')}</option>
      <option value="hierarchical">{tr('Hierárquico', 'Hierarchical')}</option>
      <option value="planar">{tr('Planar', 'Planar')}</option>
    </select>

    <button className="toolbar-button" onClick={onZoomOut} disabled={!hasGraph} title={tr('Diminuir zoom', 'Zoom out')} aria-label={tr('Diminuir zoom', 'Zoom out')} type="button">
      <ZoomOut className="h-3 w-3" />
    </button>
    <button className="toolbar-button" onClick={onZoomIn} disabled={!hasGraph} title={tr('Aumentar zoom', 'Zoom in')} aria-label={tr('Aumentar zoom', 'Zoom in')} type="button">
      <ZoomIn className="h-3 w-3" />
    </button>
    <button className="toolbar-button" onClick={onFit} disabled={!hasGraph} title={tr('Ajustar à tela', 'Fit to screen')} aria-label={tr('Ajustar à tela', 'Fit to screen')} type="button">
      <Scan className="h-3 w-3" />
    </button>

    <button className="toolbar-button" onClick={onExportSvg} disabled={!hasGraph || isRecording} title={tr('Opções de download do grafo em SVG', 'Export graph as SVG')} aria-label={tr('Exportar grafo em SVG', 'Export graph as SVG')} type="button">
      <Download className="h-3 w-3" /> SVG
    </button>
    </>}
    <button className="toolbar-button" onClick={onExportJson} disabled={!hasSteps} type="button">
      <Download className="h-3 w-3" /> JSON
    </button>

    {isRecording ? (
      <button className="toolbar-button toolbar-button-recording" onClick={onStopRecording} disabled={isFinalizing} title={tr('Parar gravação', 'Stop recording')} type="button">
        <Square className="h-3 w-3" /> {tr('Parar', 'Stop')}
      </button>
    ) : (
      <button className="toolbar-button" onClick={onStartRecording} disabled={!canRecord} title={tr('Gravar visualização', 'Record visualization')} type="button">
        <Video className="h-3 w-3" /> {tr('Gravar', 'Record')}
      </button>
    )}

    <button
      className="toolbar-button"
      onClick={onToggleFullscreen}
      title={isFullscreen ? tr('Sair da tela cheia (Esc)', 'Exit fullscreen (Esc)') : tr('Tela cheia', 'Fullscreen')}
      aria-label={isFullscreen ? tr('Sair da tela cheia', 'Exit fullscreen') : tr('Tela cheia', 'Fullscreen')}
      type="button"
    >
      {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
    </button>
  </div>
  );
};
