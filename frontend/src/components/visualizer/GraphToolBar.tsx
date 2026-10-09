'use client';

import React from 'react';
import { Download, Maximize2, Minimize2, Scan, Square, Video, ZoomIn, ZoomOut } from 'lucide-react';
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
}) => (
  <div className="graph-toolbar">
    <select
      className="example-select"
      value={layout}
      disabled={isRecording}
      onChange={(e) => onLayoutChange(e.target.value as GraphLayout)}
      aria-label="Layout do grafo"
    >
      <option value="force">Forças</option>
      <option value="circular">Circular</option>
      <option value="grid">Grade</option>
      <option value="bipartite">Bipartido</option>
      <option value="hierarchical">Hierárquico</option>
      <option value="planar">Planar</option>
    </select>

    <button className="toolbar-button" onClick={onZoomOut} disabled={!hasGraph} title="Diminuir zoom" aria-label="Diminuir zoom" type="button">
      <ZoomOut className="h-3 w-3" />
    </button>
    <button className="toolbar-button" onClick={onZoomIn} disabled={!hasGraph} title="Aumentar zoom" aria-label="Aumentar zoom" type="button">
      <ZoomIn className="h-3 w-3" />
    </button>
    <button className="toolbar-button" onClick={onFit} disabled={!hasGraph} title="Ajustar à tela" aria-label="Ajustar à tela" type="button">
      <Scan className="h-3 w-3" />
    </button>

    <button className="toolbar-button" onClick={onExportSvg} disabled={!hasGraph || isRecording} title="Opções de download do grafo em SVG" aria-label="Exportar grafo em SVG" type="button">
      <Download className="h-3 w-3" /> SVG
    </button>
    <button className="toolbar-button" onClick={onExportJson} disabled={!hasSteps} type="button">
      <Download className="h-3 w-3" /> JSON
    </button>

    {isRecording ? (
      <button className="toolbar-button toolbar-button-recording" onClick={onStopRecording} disabled={isFinalizing} title="Parar gravação" type="button">
        <Square className="h-3 w-3" /> Parar
      </button>
    ) : (
      <button className="toolbar-button" onClick={onStartRecording} disabled={!canRecord} title="Gravar visualização" type="button">
        <Video className="h-3 w-3" /> Gravar
      </button>
    )}

    <button
      className="toolbar-button"
      onClick={onToggleFullscreen}
      title={isFullscreen ? 'Sair da tela cheia (Esc)' : 'Tela cheia'}
      aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
      type="button"
    >
      {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
    </button>
  </div>
);
