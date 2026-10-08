'use client';

import React from 'react';
import { Download } from 'lucide-react';
import type { GraphLayout } from './GraphCanvas';

interface GraphToolbarProps {
  layout: GraphLayout;
  onLayoutChange: (layout: GraphLayout) => void;
  onExportSvg: () => void;
  onExportJson: () => void;
  hasGraph: boolean;
  hasSteps: boolean;
}

export const GraphToolbar: React.FC<GraphToolbarProps> = ({
  layout,
  onLayoutChange,
  onExportSvg,
  onExportJson,
  hasGraph,
  hasSteps,
}) => (
  <div className="graph-toolbar">
    <select
      className="example-select"
      value={layout}
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
    <button className="toolbar-button" onClick={onExportSvg} disabled={!hasGraph}>
      <Download className="h-3 w-3" /> SVG
    </button>
    <button className="toolbar-button" onClick={onExportJson} disabled={!hasSteps}>
      <Download className="h-3 w-3" /> JSON
    </button>
  </div>
);