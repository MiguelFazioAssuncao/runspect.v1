'use client';

import React from 'react';
import { useLocale } from '@/lib/i18n';

const ITEMS = [
  { color: '#3b82f6', pt: 'não visitado', en: 'unvisited' },
  { color: '#eab308', pt: 'descoberto', en: 'queued' },
  { color: '#f97316', pt: 'processando', en: 'visiting' },
  { color: '#10b981', pt: 'concluído', en: 'done' },
  { color: '#22c55e', pt: 'encontrado / caminho final', en: 'found / final path' },
  { color: '#ef4444', pt: 'caminho / erro', en: 'active path / error' },
];

export const GraphLegend: React.FC = () => {
  const { isEn } = useLocale();
  return (
    <div className="graph-legend" aria-hidden="true">
      {ITEMS.map((item) => (
        <span key={item.pt} className="legend-item">
          <i className="legend-dot" style={{ background: item.color }} />
          {isEn ? item.en : item.pt}
        </span>
      ))}
    </div>
  );
};
