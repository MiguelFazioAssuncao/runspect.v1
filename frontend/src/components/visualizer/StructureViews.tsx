'use client';

import React, { useState } from 'react';
import { ResizablePanel } from '@/components/workspace/ResizablePanel';
import {
  binaryTree, CHANGE_LABELS, inferStructureView, mapEntry, MATRIX_PAGE_COLUMNS,
  MATRIX_PAGE_ROWS, matrixShape, pairFields, parentForest, recordEntry,
  STRUCTURE_PAGE_SIZE, STRUCTURE_VIEWS, structureSize,
} from '@/lib/structureViews';
import type {
  CallFrame, MatrixSnapshot, StructureChange, StructureSnapshot,
  StructureView as StructureViewKind, TreeItem,
} from '@/lib/structureViews';

const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max));

function ChangeBadge({ change }: { change?: StructureChange }) {
  if (!change) return null;
  const { symbol, label } = CHANGE_LABELS[change.kind];
  return <span className={`structure-change-symbol change-${change.kind}`} aria-label={label} title={label}>{symbol}</span>;
}

function Changes({ changes = [] }: { changes?: StructureChange[] }) {
  if (!changes.length) return null;
  const counts = changes.reduce((summary, change) => {
    summary[change.kind] = (summary[change.kind] ?? 0) + 1;
    return summary;
  }, {} as Partial<Record<StructureChange['kind'], number>>);
  const removed = changes.filter(change => change.kind === 'removed');
  return <div className="structure-diff" aria-label="Mudanças neste passo">
    <div className="structure-change-summary">{Object.entries(counts).map(([kind, count]) => {
      const label = CHANGE_LABELS[kind as StructureChange['kind']];
      return <span key={kind} className={`change-${kind}`}>{label.symbol} {count} {label.label}{count !== 1 ? 's' : ''}</span>;
    })}</div>
    {removed.length > 0 && <div className="structure-removed">{removed.slice(0, 8).map((change, index) => <span key={index}>− [{change.key ?? change.index}] <del>{change.before}</del></span>)}{removed.length > 8 && <span>+{removed.length - 8} removidos</span>}</div>}
  </div>;
}

function Pagination({ page, count, onPage, label = 'elementos' }: { page: number; count: number; onPage: (page: number) => void; label?: string }) {
  const pages = Math.ceil(count / STRUCTURE_PAGE_SIZE);
  if (pages <= 1) return null;
  return <div className="structure-pagination" aria-label={`Paginação de ${label}`}>
    <button type="button" onClick={() => onPage(page - 1)} disabled={page === 0} aria-label={`Página anterior de ${label}`}>←</button>
    <span>página {page + 1} / {pages}</span>
    <button type="button" onClick={() => onPage(page + 1)} disabled={page === pages - 1} aria-label={`Próxima página de ${label}`}>→</button>
  </div>;
}

function TreeDiagram({ items, name, changes }: { items: TreeItem[]; name: string; changes: Map<number, StructureChange> }) {
  if (!items.length) return null;
  const levelGroups = new Map<number, TreeItem[]>();
  items.forEach(item => levelGroups.set(item.depth, [...(levelGroups.get(item.depth) ?? []), item]));
  const levels = [...levelGroups.keys()].sort((a, b) => a - b);
  const maxWidth = Math.max(...Array.from(levelGroups.values(), row => row.length));
  const width = Math.max(280, maxWidth * 116);
  const height = Math.max(80, levels.length * 86);
  const positions = new Map<number, { x: number; y: number }>();
  levels.forEach((level, rowIndex) => levelGroups.get(level)!.forEach((item, index, row) => positions.set(item.index, { x: width * (index + 0.5) / row.length, y: 40 + rowIndex * 86 })));
  return <>
    <div className="structure-tree-scroll" tabIndex={0} role="region" aria-label={`Árvore de ${name}`}>
      <svg className="structure-tree" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Árvore de ${name}; relação pai e filho detalhada abaixo`}>
        {items.map(item => {
          const child = positions.get(item.index)!;
          const parent = item.parent !== null ? positions.get(item.parent) : undefined;
          return parent && <path key={`edge-${item.index}`} d={`M${parent.x},${parent.y + 22}V${child.y - 35}H${child.x}V${child.y - 22}`} fill="none" stroke="#94a3b8" strokeWidth="2" />;
        })}
        {items.map(item => {
          const point = positions.get(item.index)!;
          const change = changes.get(item.index);
          return <g key={item.index} transform={`translate(${point.x},${point.y})`} className={change ? `change-${change.kind}` : ''}>
            <title>{`[${item.index}] ${item.value}; ${item.parent === null ? 'raiz' : `pai [${item.parent}]`}${change ? `; ${CHANGE_LABELS[change.kind].label}` : ''}`}</title>
            <rect x="-49" y="-22" width="98" height="44" rx="8" fill="#13243b" stroke={change?.kind === 'inserted' ? '#22c55e' : change?.kind === 'changed' ? '#f97316' : '#60a5fa'} strokeWidth="2" />
            <text textAnchor="middle" y="-4" fill="#cbd5e1" fontSize="10">[{item.index}] {item.parent === null ? 'raiz' : `↑${item.parent}`}</text>
            <text textAnchor="middle" y="13" fill="#f8fafc" fontSize="12">{change ? `${CHANGE_LABELS[change.kind].symbol} ` : ''}{item.value.length > 10 ? `${item.value.slice(0, 8)}…` : item.value}</text>
          </g>;
        })}
      </svg>
    </div>
    <div className="structure-tree-values" aria-label={`Valores completos de ${name}`}>{items.map(item => <span key={item.index}>[{item.index}] = {item.value} · {item.parent === null ? 'raiz' : `pai [${item.parent}]`}</span>)}</div>
  </>;
}

interface StructureViewProps {
  snapshot: StructureSnapshot;
  view?: StructureViewKind | 'auto';
  showSelector?: boolean;
}

/** Also used by numeric vectors when users select a semantic presentation. */
export function StructureView({ snapshot, view: controlledView, showSelector = true }: StructureViewProps) {
  const [selectedView, setSelectedView] = useState<StructureViewKind | 'auto'>('auto');
  const [selectedPage, setPage] = useState(0);
  const choice = controlledView ?? selectedView;
  const view = choice === 'auto' ? inferStructureView(snapshot) : choice;
  let allItems = snapshot.items;
  if (snapshot.opaque && view === 'priority') allItems = allItems.filter(item => !/^tamanho\s*=/.test(item)).map(item => item.replace(/^topo\s*=\s*/, ''));
  if (view === 'string' || view === 'bits') allItems = Array.from(snapshot.items.join(''));
  if (view === 'record' && snapshot.kind === 'pair' && allItems.length === 1) allItems = pairFields(allItems[0]) ?? allItems;
  const actualSize = Math.max(structureSize(snapshot), allItems.length);
  const page = clamp(selectedPage, Math.max(0, Math.ceil(allItems.length / STRUCTURE_PAGE_SIZE) - 1));
  const begin = page * STRUCTURE_PAGE_SIZE;
  const visibleItems = allItems.slice(begin, begin + STRUCTURE_PAGE_SIZE);
  const changes = new Map((snapshot.changes ?? []).filter(change => change.kind !== 'removed').map(change => [change.index, change]));
  const trees = view === 'union-find' ? parentForest(allItems) : view === 'binary-tree' ? binaryTree(allItems) : null;
  const omitted = Math.max(0, actualSize - visibleItems.length);
  const capturedTruncated = actualSize > allItems.length || snapshot.truncated === true;
  const empty = snapshot.initialized === false ? 'ainda não inicializado' : actualSize === 0 ? 'vazio (size 0)' : 'elementos não capturados';

  return <ResizablePanel title={`Variável ${snapshot.name}`}><section className={`structure-view structure-view-${view}`} aria-label={`Variável ${snapshot.name}`} data-kind={snapshot.kind ?? 'unknown'}>
    <div className="structure-view-heading">
      <strong className="struct-name">{snapshot.name}</strong>
      <span className="structure-type">{snapshot.kind ?? 'estrutura'} · size {actualSize}</span>
      {showSelector && <select value={choice} onChange={event => { setSelectedView(event.target.value as StructureViewKind | 'auto'); setPage(0); }} aria-label={`Visualização de ${snapshot.name}`}>
        <option value="auto">Automática</option>
        {STRUCTURE_VIEWS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>}
    </div>
    {visibleItems.length === 0 || snapshot.initialized === false ? <span className="struct-empty">{empty}</span> : <>
      {view === 'stack' && <p className="structure-direction">↓ topo: primeiro elemento · remoção pelo topo</p>}
      {view === 'queue' && <p className="structure-direction">saída ← frente · fim ← entrada</p>}
      {view === 'deque' && <p className="structure-direction">↔ inserção e remoção pelas duas pontas</p>}
      {view === 'priority' && <p className="structure-direction">{snapshot.opaque ? 'Somente topo capturado; comparador personalizado' : '★ topo: primeiro elemento · ordem de remoção por prioridade'}</p>}
      {view === 'union-find' && trees && <p className="structure-direction">{new Set(trees.map(item => item.root)).size} conjuntos · cada seta liga um elemento a seu pai</p>}
      {view === 'binary-tree' && <p className="structure-direction">índice 0: raiz · filhos de i: 2i + 1 e 2i + 2</p>}
      {view === 'union-find' && !trees && <p className="structure-view-warning" role="status">Este vetor não forma uma floresta de pais válida. Índices começam em 0; raízes apontam para si ou têm valor negativo.</p>}
      {(view === 'union-find' || view === 'binary-tree') && trees ? <TreeDiagram items={trees.filter(item => item.index >= begin && item.index < begin + STRUCTURE_PAGE_SIZE)} name={snapshot.name} changes={changes} /> : <div className={`structure-elements ${view === 'stack' ? 'structure-elements-stack' : ''} ${view === 'set' ? 'structure-elements-set' : ''}`}>
        {visibleItems.map((item, offset) => {
          const index = begin + offset;
          const change = changes.get(index);
          const map = view === 'map' ? mapEntry(item, index) : null;
          const field = view === 'record' ? recordEntry(item, index, snapshot.kind) : null;
          const pair = view === 'sequence' ? pairFields(item) : null;
          const key = map?.key ?? field?.key ?? (view === 'set' ? 'valor' : String(index));
          const value = map?.value ?? field?.value ?? item;
          return <div key={index} className={`structure-element struct-chip ${change ? `change-${change.kind}` : ''}`} aria-label={`${snapshot.name}[${key}] = ${value}${change ? `, ${CHANGE_LABELS[change.kind].label}` : ''}`}>
            <span className="structure-element-key">{(view === 'stack' || view === 'priority') && index === 0 ? '★ topo' : view === 'queue' || view === 'deque' ? `${index === 0 ? 'frente · ' : index === allItems.length - 1 ? 'fim · ' : ''}[${key}]` : view === 'map' || view === 'record' ? key : view === 'set' ? `#${index}` : `[${key}]`}</span>
            <strong className="structure-element-value"><ChangeBadge change={change} />{value}</strong>
            {pair && <span className="structure-pair-fields"><span>first: {pair[0]}</span><span>second: {pair[1]}</span></span>}
            {change?.kind === 'changed' && change.before !== undefined && <small className="structure-previous">antes: {change.before}</small>}
          </div>;
        })}
      </div>}
    </>}
    <Changes changes={snapshot.changes} />
    {omitted > 0 && <p className="structure-overflow">+{omitted} elementos · {snapshot.opaque ? 'conteúdo interno indisponível para este comparador' : capturedTruncated ? `${allItems.length} capturados de ${actualSize}; os demais foram limitados na execução` : `mostrando ${begin + 1}–${begin + visibleItems.length} de ${actualSize}`}</p>}
    {snapshot.truncated === true && actualSize === allItems.length && <p className="structure-overflow">Captura limitada; total original indisponível neste arquivo.</p>}
    <Pagination page={page} count={allItems.length} onPage={setPage} label={snapshot.name} />
  </section></ResizablePanel>;
}

export function MatrixView({ snapshot }: { snapshot: MatrixSnapshot }) {
  const [choice, setChoice] = useState<'auto' | 'grid' | 'dp'>('auto');
  const activeKey = snapshot.active ? `${snapshot.active.row}:${snapshot.active.col}` : '';
  const [navigation, setNavigation] = useState({ activeKey, row: Math.floor((snapshot.active?.row ?? 0) / MATRIX_PAGE_ROWS), col: Math.floor((snapshot.active?.col ?? 0) / MATRIX_PAGE_COLUMNS) });
  const capturedRows = snapshot.rows.length;
  const capturedCols = Math.max(0, ...snapshot.rows.map(row => row.length));
  const shape = matrixShape(snapshot);
  const rowPages = Math.max(1, Math.ceil(capturedRows / MATRIX_PAGE_ROWS));
  const colPages = Math.max(1, Math.ceil(capturedCols / MATRIX_PAGE_COLUMNS));
  const followsActive = navigation.activeKey !== activeKey;
  const rowPage = clamp(followsActive ? Math.floor((snapshot.active?.row ?? 0) / MATRIX_PAGE_ROWS) : navigation.row, rowPages - 1);
  const colPage = clamp(followsActive ? Math.floor((snapshot.active?.col ?? 0) / MATRIX_PAGE_COLUMNS) : navigation.col, colPages - 1);
  const rowStart = rowPage * MATRIX_PAGE_ROWS;
  const colStart = colPage * MATRIX_PAGE_COLUMNS;
  const cols = Array.from({ length: Math.min(MATRIX_PAGE_COLUMNS, Math.max(0, capturedCols - colStart)) }, (_, index) => colStart + index);
  const rows = snapshot.rows.slice(rowStart, rowStart + MATRIX_PAGE_ROWS);
  const view = choice === 'auto' ? snapshot.kind === 'dp' || /^(dp|memo|table|tabela)(\b|_)/i.test(snapshot.name) ? 'dp' : 'grid' : choice;
  const count = snapshot.rows.reduce((total, row) => total + row.length, 0);
  const total = typeof snapshot.size === 'number' ? Math.max(count, snapshot.size) : Math.max(count, shape.rows * shape.cols);
  const visible = rows.reduce((total, row) => total + row.slice(colStart, colStart + MATRIX_PAGE_COLUMNS).length, 0);
  const changes = new Map(snapshot.changes?.filter(change => change.kind !== 'removed').map(change => [change.index, change]));
  const dependencies = snapshot.dependencies ?? [];
  const navigate = (row: number, col: number) => setNavigation({ activeKey, row, col });
  const active = snapshot.active;

  return <ResizablePanel title={`Matriz ${snapshot.name}`}><section className={`structure-view matrix-card structure-matrix-${view}`} aria-label={`Matriz ${snapshot.name}`}>
    <div className="structure-view-heading">
      <strong className="struct-name">{snapshot.name}</strong>
      <span className="matrix-size" aria-label={`${shape.rows} linhas, ${shape.cols} colunas`}>{shape.rows} × {shape.cols}</span>
      <select value={choice} onChange={event => setChoice(event.target.value as typeof choice)} aria-label={`Visualização de ${snapshot.name}`}><option value="auto">Automática</option><option value="grid">Matriz / grid</option><option value="dp">Tabela de DP</option></select>
    </div>
    {snapshot.initialized === false ? <span className="struct-empty">ainda não inicializado</span> : capturedRows === 0 ? <span className="struct-empty">vazio (size 0)</span> : <div className="matrix-scroll" tabIndex={0} role="region" aria-label={`Células de ${snapshot.name}`}>
      <table className="matrix-table" aria-label={`${snapshot.name}, ${view === 'dp' ? 'tabela de DP' : 'matriz'}`}>
        <thead><tr><th aria-hidden="true" />{cols.map(col => <th key={col} scope="col">{col}</th>)}</tr></thead>
        <tbody>{rows.map((row, offset) => {
          const r = rowStart + offset;
          return <tr key={r}><th scope="row">{r}</th>{cols.map(c => {
            const value = row[c];
            if (value === undefined) return <td key={c} className="matrix-cell-missing" aria-label={`[${r}][${c}] ausente`}>—</td>;
            const isActive = active?.row === r && active.col === c;
            const dependency = dependencies.some(cell => (cell.name === undefined || cell.name === snapshot.name) && cell.row === r && cell.col === c);
            const change = changes.get(r * shape.cols + c);
            const description = `${snapshot.name}[${r}][${c}] = ${value}${isActive ? `, ${active.access === 'write' ? 'escrita' : 'leitura'} atual` : ''}${dependency ? ', dependência' : ''}${change ? `, ${CHANGE_LABELS[change.kind].label}` : ''}`;
            return <td key={c} className={`${isActive ? 'matrix-cell-active ' : ''}${dependency ? 'matrix-cell-dependency ' : ''}${change ? `change-${change.kind}` : ''}`} aria-label={description} title={description}>
              {isActive ? <span className="matrix-cell-symbol" aria-label={active.access === 'write' ? 'escrita' : 'leitura'}>{active.access === 'write' ? '✎' : '◉'}</span> : dependency ? <span className="matrix-cell-symbol" aria-label="dependência">↗</span> : <ChangeBadge change={change} />}{value}
            </td>;
          })}</tr>;
        })}</tbody>
      </table>
    </div>}
    {active && <p className="structure-direction">{active.access === 'write' ? '✎ escrita' : '◉ leitura'}: {snapshot.name}[{active.row}][{active.col}]</p>}
    {dependencies.length > 0 && <p className="structure-dependencies">dependências: {dependencies.slice(0, 16).map((cell, index) => <span key={index}>{index > 0 ? ' + ' : ''}↗ {cell.name ?? snapshot.name}[{cell.row}][{cell.col}]</span>)} {active && '→ célula atual'}{dependencies.length > 16 && ` +${dependencies.length - 16} células`}</p>}
    {view === 'dp' && dependencies.length === 0 && <p className="structure-direction">Modo DP · dependências aparecem quando acessos a células são capturados.</p>}
    <Changes changes={snapshot.changes} />
    {total > visible && <p className="structure-overflow">+{total - visible} células · {count < total ? `${count} capturadas de ${total}` : `linhas ${rowStart}–${rowStart + rows.length - 1}, colunas ${colStart}–${colStart + cols.length - 1}`}</p>}
    {(rowPages > 1 || colPages > 1) && <div className="matrix-pagination">
      <button type="button" disabled={rowPage === 0} onClick={() => navigate(rowPage - 1, colPage)} aria-label={`Linhas anteriores de ${snapshot.name}`}>↑ linhas</button>
      <button type="button" disabled={rowPage === rowPages - 1} onClick={() => navigate(rowPage + 1, colPage)} aria-label={`Próximas linhas de ${snapshot.name}`}>↓ linhas</button>
      <button type="button" disabled={colPage === 0} onClick={() => navigate(rowPage, colPage - 1)} aria-label={`Colunas anteriores de ${snapshot.name}`}>← colunas</button>
      <button type="button" disabled={colPage === colPages - 1} onClick={() => navigate(rowPage, colPage + 1)} aria-label={`Próximas colunas de ${snapshot.name}`}>→ colunas</button>
    </div>}
  </section></ResizablePanel>;
}

export function CallTree({ calls }: { calls: CallFrame[] }) {
  const [selectedPage, setPage] = useState<number | null>(null);
  if (!calls.length) return null;
  const pages = Math.max(1, Math.ceil(calls.length / STRUCTURE_PAGE_SIZE));
  const page = selectedPage === null ? pages - 1 : clamp(selectedPage, pages - 1);
  const visible = calls.slice(page * STRUCTURE_PAGE_SIZE, (page + 1) * STRUCTURE_PAGE_SIZE);
  const active = calls.filter(call => call.status === 'active').sort((a, b) => b.depth - a.depth || b.id - a.id);
  const shownStack = active.slice(0, STRUCTURE_PAGE_SIZE);
  return <ResizablePanel title="Chamadas recursivas"><section className="structure-view call-panel" aria-label="Árvore de chamadas e pilha">
    <div className="structure-view-heading"><strong>Chamadas recursivas</strong><span className="structure-type">{calls.length} chamadas · profundidade {Math.max(...calls.map(call => call.depth))}</span></div>
    <div className="call-panels">
      <ResizablePanel title="Pilha de chamadas"><div><h3>Pilha de chamadas · topo primeiro</h3>{shownStack.length ? <ol className="call-stack">{shownStack.map((call, index) => <li key={call.id} className="call-entry call-entry-active"><span className="call-symbol">{index === 0 ? '▶ topo' : '│'}</span><strong>{call.function}</strong><span>#{call.id} · linha {call.line}</span></li>)}</ol> : <p className="struct-empty">pilha vazia: todas as chamadas retornaram</p>}{active.length > shownStack.length && <p className="structure-overflow">+{active.length - shownStack.length} quadros na pilha</p>}</div>
      </ResizablePanel><ResizablePanel title="Árvore de chamadas"><div><h3>Árvore de chamadas</h3><ol className="call-history">{visible.map(call => <li key={call.id} className={`call-entry call-entry-${call.status}`} style={{ marginInlineStart: Math.min(8, call.depth) * 12 }}><span className="call-symbol" aria-label={call.status === 'active' ? 'chamada ativa' : 'retornou'}>{call.status === 'active' ? '▶' : '✓'}</span><strong>{call.function}</strong><span>#{call.id} · linha {call.line} · nível {call.depth}{call.parent != null ? ` · pai #${call.parent}` : ' · raiz'}</span></li>)}</ol>{calls.length > visible.length && <p className="structure-overflow">+{calls.length - visible.length} chamadas em outras páginas</p>}<Pagination page={page} count={calls.length} onPage={setPage} label="chamadas" /></div></ResizablePanel>
    </div>
  </section></ResizablePanel>;
}
