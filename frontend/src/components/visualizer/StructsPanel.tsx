'use client';

import React from 'react';
import { ResizablePanel } from '@/components/workspace/ResizablePanel';
import type { CallFrame, MatrixSnapshot, StructureSnapshot } from '@/lib/structureViews';
import { CHANGE_LABELS, STRUCTURE_PAGE_SIZE } from '@/lib/structureViews';
import { CallTree, MatrixView, StructureView } from './StructureViews';
import './structures.css';

interface StructsPanelProps {
  structs: StructureSnapshot[];
  matrices?: MatrixSnapshot[];
  calls?: CallFrame[];
  primary?: boolean;
  solo?: boolean;
}

export const StructsPanel: React.FC<StructsPanelProps> = ({ structs, matrices = [], calls = [], primary = false, solo = false }) => {
  if (structs.length === 0 && matrices.length === 0 && calls.length === 0) return null;
  const variables = primary ? structs.filter(struct => struct.name === 'Variáveis') : [];
  const cards = primary ? structs.filter(struct => struct.name !== 'Variáveis') : structs;

  return <ResizablePanel title="Estruturas e variáveis" className={`structures-workspace${primary ? ' structures-workspace-primary' : ''}`} fill={solo}>
  <div className={`structs-panel${primary ? ' structs-panel-primary' : ''}${solo ? ' structs-panel-solo' : ''}`}>
    {variables.map(structure => <ResizablePanel title={structure.name} key={structure.name}><div className="struct-row struct-row-variables">
      <span className="struct-name">{structure.name}</span>
      <div className="struct-items">{structure.items.length === 0 ? <span className="struct-empty">vazio (size 0)</span> : structure.items.slice(0, STRUCTURE_PAGE_SIZE).map((item, index) => {
        const separator = item.indexOf(' = ');
        const change = structure.changes?.find(change => change.index === index && change.kind !== 'removed');
        return separator < 0 ? <span key={index} className={`struct-chip ${change ? `change-${change.kind}` : ''}`}>{item}</span> : <span key={index} className={`variable-card${change ? ` change-${change.kind}` : ''}`}>
          <span className="variable-name">{item.slice(0, separator)}</span>
          <strong className="variable-value">{item.slice(separator + 3)}</strong>
          {change && <span className="structure-change-symbol" aria-label={CHANGE_LABELS[change.kind].label}>{CHANGE_LABELS[change.kind].symbol}</span>}
        </span>;
      })}{structure.items.length > STRUCTURE_PAGE_SIZE && <span className="structure-overflow">+{structure.items.length - STRUCTURE_PAGE_SIZE} variáveis</span>}</div>
    </div></ResizablePanel>)}
    {(cards.length > 0 || matrices.length > 0) && <div className="struct-grid">
      {cards.map(structure => <StructureView key={structure.name} snapshot={structure} />)}
      {matrices.map(matrix => <MatrixView key={matrix.name} snapshot={matrix} />)}
    </div>}
    <CallTree calls={calls} />
  </div></ResizablePanel>;
};
