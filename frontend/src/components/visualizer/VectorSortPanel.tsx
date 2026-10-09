'use client';

import React from 'react';
import type {
  VectorElementState,
  VectorIssue,
  VectorOperation,
  VectorSnapshot,
} from '@/types/visualizer';

const COMPACT_THRESHOLD = 64;
const MAX_RENDERED_CELLS = 512;

const STATE_LABEL: Record<VectorElementState, string> = {
  default: 'não processado',
  comparing: 'comparando',
  swapping: 'trocando',
  pivot: 'pivô',
  sorted: 'ordenado',
  active: 'ativo',
  discarded: 'descartado',
  found: 'encontrado',
};

function describeOperation(operation: VectorOperation | null, vector: VectorSnapshot): string {
  if (!operation) return '';
  switch (operation.kind) {
    case 'compare':
      return `comparação: [${operation.a}] × [${operation.b}]`;
    case 'swap':
      return `troca: [${operation.a}] ↔ [${operation.b}]`;
    case 'probe':
      return `consulta: [${operation.index}]`;
    case 'set':
      return `escrita: [${operation.index}] = ${vector.items[operation.index]?.displayValue ?? operation.value}`;
  }
}

function VectorView({ vector }: { vector: VectorSnapshot }) {
  const compact = vector.items.length > COMPACT_THRESHOLD;
  const rendered = vector.items.slice(0, MAX_RENDERED_CELLS);
  const operation = describeOperation(vector.operation, vector);

  return (
    <div className="vector-view" data-testid={`vector-${vector.name}`}>
      <div className="vector-head">
        <strong>{vector.name}</strong>
        {vector.range && (
          <span>
            intervalo [{vector.range.start}, {vector.range.end}]
          </span>
        )}
        {vector.pivot !== null && <span>pivô: índice {vector.pivot}</span>}
        {operation && <span>{operation}</span>}
      </div>
      {vector.items.length === 0 ? (
        <div className="vector-empty">vetor vazio</div>
      ) : (
        <div className={`vector-cells ${compact ? 'vector-cells-compact' : ''}`}>
          {rendered.map((item) => (
            <div
              key={item.index}
              className={`vector-cell vector-cell-${item.state}`}
              title={`${item.index}: ${item.displayValue ?? item.value} (${STATE_LABEL[item.state]})`}
            >
              <span className="vector-index">{item.index}</span>
              <span className="vector-value">{compact ? '' : (item.displayValue ?? item.value)}</span>
            </div>
          ))}
        </div>
      )}
      {vector.items.length > MAX_RENDERED_CELLS && (
        <div className="vector-note">
          exibindo os primeiros {MAX_RENDERED_CELLS} de {vector.items.length} elementos
        </div>
      )}
      {vector.caption && (
        <p className="vector-caption" role="status">
          {vector.caption}
        </p>
      )}
      {vector.result && (
        <p className="vector-result">
          resultado: {vector.result.slice(0, MAX_RENDERED_CELLS).map((value, index) => vector.items[index]?.displayValue ?? value).join(', ')}
          {vector.result.length > MAX_RENDERED_CELLS ? ' …' : ''}
        </p>
      )}
    </div>
  );
}

export function VectorSortPanel({
  vectors,
  issues,
  solo = false,
}: {
  vectors: VectorSnapshot[];
  issues: VectorIssue[];
  solo?: boolean;
}) {
  if (vectors.length === 0) return null;

  return (
    <div className={`vector-panel ${solo ? 'vector-panel-solo' : ''}`}>
      {vectors.map((vector) => (
        <VectorView key={vector.name} vector={vector} />
      ))}
      {issues.length > 0 && (
        <ul className="vector-issues">
          {issues.map((issue) => (
            <li key={`${issue.event}-${issue.step_event}`}>
              evento {issue.event + 1} ignorado ({issue.step_event}): {issue.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
