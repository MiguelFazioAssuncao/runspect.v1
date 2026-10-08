'use client';

import React from 'react';

const ITEMS = [
  { color: '#3b82f6', label: 'não visitado' },
  { color: '#eab308', label: 'descoberto' },
  { color: '#f97316', label: 'processando' },
  { color: '#10b981', label: 'concluído' },
  { color: '#ef4444', label: 'caminho / erro' },
];

export const GraphLegend: React.FC = () => (
  <div className="graph-legend" aria-hidden="true">
    {ITEMS.map((item) => (
      <span key={item.label} className="legend-item">
        <i className="legend-dot" style={{ background: item.color }} />
        {item.label}
      </span>
    ))}
  </div>
);