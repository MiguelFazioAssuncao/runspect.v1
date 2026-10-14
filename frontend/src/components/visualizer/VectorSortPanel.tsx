'use client';

import React, { useState } from 'react';
import { ResizablePanel } from '@/components/workspace/ResizablePanel';
import { StructureView } from './StructureViews';
import { CHANGE_LABELS, inferStructureView, STRUCTURE_VIEWS } from '@/lib/structureViews';
import type { StructureView as StructureViewKind } from '@/lib/structureViews';
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
  const [choice, setChoice] = useState<'auto' | 'cells' | StructureViewKind>('auto');
  const inferred = inferStructureView({ kind: vector.kind });
  const view = choice === 'auto' ? (['set', 'deque', 'stack', 'queue', 'priority', 'string', 'union-find', 'binary-tree'].includes(inferred) ? inferred : 'cells') : choice;
  const compact = vector.items.length > COMPACT_THRESHOLD;
  const activeIndex = vector.operation && 'index' in vector.operation ? vector.operation.index : vector.operation && 'a' in vector.operation ? vector.operation.a : 0;
  const [navigation, setNavigation] = useState({ activeIndex, page: Math.floor(activeIndex / MAX_RENDERED_CELLS) });
  const pages = Math.max(1, Math.ceil(vector.items.length / MAX_RENDERED_CELLS));
  const page = Math.min(navigation.activeIndex === activeIndex ? navigation.page : Math.floor(activeIndex / MAX_RENDERED_CELLS), pages - 1);
  const begin = page * MAX_RENDERED_CELLS;
  const rendered = vector.items.slice(begin, begin + MAX_RENDERED_CELLS);
  const operation = describeOperation(vector.operation, vector);

  return (
    <ResizablePanel title={`Vetor ${vector.name}`} className="vector-item-workspace">
    <div className="vector-view" data-testid={`vector-${vector.name}`}>
      <div className="vector-head">
        <strong>{vector.name}</strong>
        <span>size {vector.size ?? vector.items.length}</span>
        <select value={choice} onChange={event => setChoice(event.target.value as typeof choice)} aria-label={`Visualização de ${vector.name}`} className="structure-view-select">
          <option value="auto">Automática</option><option value="cells">Células do vetor</option>
          {STRUCTURE_VIEWS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {vector.range && (
          <span>
            intervalo [{vector.range.start}, {vector.range.end}]
          </span>
        )}
        {vector.pivot !== null && <span>pivô: índice {vector.pivot}</span>}
        {operation && <span>{operation}</span>}
      </div>
      {view !== 'cells' ? <StructureView snapshot={{ name: vector.name, items: vector.items.map(item => vector.kind === 'string' && view === 'string' ? String.fromCharCode(item.value) : item.displayValue ?? String(item.value)), kind: vector.kind, size: vector.size, initialized: vector.initialized, truncated: vector.truncated, changes: vector.changes }} view={view} showSelector={false} /> : vector.items.length === 0 ? (
        <div className="vector-empty">{vector.initialized === false ? 'ainda não inicializado' : 'vazio (size 0)'}</div>
      ) : (
        <div className={`vector-cells ${compact ? 'vector-cells-compact' : ''}`}>
          {rendered.map((item) => (
            <div
              key={item.index}
              className={`vector-cell vector-cell-${item.state} ${vector.changes?.find(change => change.index === item.index && change.kind !== 'removed') ? `structure-change-${vector.changes.find(change => change.index === item.index && change.kind !== 'removed')!.kind}` : ''}`}
              title={`${item.index}: ${item.displayValue ?? item.value} (${STATE_LABEL[item.state]})`}
            >
              <span className="vector-index">{item.index}</span>
              <span className="vector-value">{item.displayValue ?? item.value}</span>
              {vector.changes?.filter(change => change.index === item.index && change.kind !== 'removed').slice(-1).map(change => <span className="vector-index" key={change.kind}>{CHANGE_LABELS[change.kind].symbol} {CHANGE_LABELS[change.kind].label}</span>)}
              {item.state !== 'default' && <span className="vector-index">{STATE_LABEL[item.state]}</span>}
            </div>
          ))}
        </div>
      )}
      {vector.changes?.some(change => change.kind === 'removed') && <div className="structure-removals" role="status">{vector.changes.filter(change => change.kind === 'removed').slice(0, 16).map(change => <span className="structure-change-removed" key={change.index}>− [{change.index}] {change.before}</span>)}</div>}
      {!!vector.truncated && <div className="vector-note">+{vector.truncated} elementos não capturados</div>}
      {view === 'cells' && pages > 1 && <div className="structure-pagination" aria-label={`Paginação do vetor ${vector.name}`}><button type="button" disabled={page === 0} onClick={() => setNavigation({ activeIndex, page: page - 1 })} aria-label={`Página anterior do vetor ${vector.name}`}>←</button><span>elementos {begin}–{begin + rendered.length - 1} de {vector.items.length} · página {page + 1} / {pages}</span><button type="button" disabled={page === pages - 1} onClick={() => setNavigation({ activeIndex, page: page + 1 })} aria-label={`Próxima página do vetor ${vector.name}`}>→</button></div>}
      {vector.caption && (
        <p className="vector-caption" role="status">
          {vector.caption}
        </p>
      )}
      {vector.result && (
        <p className="vector-result">
          resultado: {vector.result.slice(view === 'cells' ? begin : 0, (view === 'cells' ? begin : 0) + MAX_RENDERED_CELLS).map((value, index) => vector.items[index + (view === 'cells' ? begin : 0)]?.displayValue ?? value).join(', ')}
          {vector.result.length > MAX_RENDERED_CELLS ? ' …' : ''}
        </p>
      )}
    </div>
    </ResizablePanel>
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
    <ResizablePanel title="Vetores" className={`vectors-workspace ${solo ? 'vectors-workspace-solo' : ''}`} fill={solo}>
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
    </ResizablePanel>
  );
}
