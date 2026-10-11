'use client';

import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ResizablePanel } from '@/components/workspace/ResizablePanel';
import { referenceLayers } from '@/lib/references';
import type { ReferenceObject, ReferenceSnapshot } from '@/lib/references';
import { STRUCTURE_PAGE_SIZE } from '@/lib/structureViews';

const labels = { observed: 'observado', unobserved: 'conteúdo não observado', released: 'liberado' };
const short = (text: string, size = 26) => text.length > size ? `${text.slice(0, size - 1)}…` : text;
const FIELD_PAGE_SIZE = 128;

function ObjectCard({ object, fieldsView, link }: { object: ReferenceObject; fieldsView: boolean; link: (id: number | null, text?: string) => ReactNode }) {
  const [selectedPage, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(object.fields.length / FIELD_PAGE_SIZE));
  const page = Math.min(selectedPage, pages - 1);
  const first = page * FIELD_PAGE_SIZE;
  return <details open={fieldsView} className={`reference-object reference-object-${object.status}`}>
    <summary>@{object.id} · {object.type} · {labels[object.status]} · {object.fields.length} campos</summary>
    <dl>{object.fields.slice(first, first + FIELD_PAGE_SIZE).map((field, index) => <div key={first + index} className={field.changed ? 'change-changed' : ''}><dt>{field.name}</dt><dd>{field.target !== undefined ? link(field.target, field.value) : field.value}{field.changed && <span aria-label="alterado"> ↻</span>}</dd></div>)}</dl>
    {object.status === 'unobserved' && <p className="structure-direction">O destino está identificado; seus campos não foram capturados neste passo.</p>}
    {object.status === 'released' && <p className="structure-direction">Este objeto foi liberado. A referência ainda existe.</p>}
    {pages > 1 && <div className="structure-pagination" aria-label={`Paginação de campos de @${object.id}`}>
      <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label={`Página anterior de campos do objeto @${object.id}`}>←</button>
      <span>campos {first + 1}–{Math.min(first + FIELD_PAGE_SIZE, object.fields.length)} de {object.fields.length} · página {page + 1} / {pages}</span>
      <button type="button" disabled={page === pages - 1} onClick={() => setPage(page + 1)} aria-label={`Próxima página de campos do objeto @${object.id}`}>→</button>
    </div>}
  </details>;
}

function diagramLayout(objects: ReferenceObject[], layers: Map<number, number>) {
  const rows = new Map<number, ReferenceObject[]>();
  objects.forEach(object => {
    const level = layers.get(object.id) ?? 0;
    rows.set(level, [...(rows.get(level) ?? []), object]);
  });
  const positions = new Map<number, { x: number; y: number }>();
  let row = 0;
  for (const [, objects] of [...rows].sort(([a], [b]) => a - b)) {
    objects.forEach((object, index) => positions.set(object.id, { x: 140 + (index % 4) * 270, y: 80 + (row + Math.floor(index / 4)) * 190 }));
    row += Math.ceil(objects.length / 4);
  }
  return { positions, width: Math.max(340, ...[...positions.values()].map(position => position.x + 220)), height: Math.max(180, row * 190) };
}

export function ReferenceView({ snapshot }: { snapshot: ReferenceSnapshot }) {
  const [selectedPage, setPage] = useState(0);
  const [view, setView] = useState<'connections' | 'fields'>('connections');
  const marker = `reference-arrow-${useId().replaceAll(':', '')}`;
  const pages = Math.max(1, Math.ceil(snapshot.objects.length / STRUCTURE_PAGE_SIZE));
  const page = Math.min(selectedPage, pages - 1);
  const objects = snapshot.objects.slice(page * STRUCTURE_PAGE_SIZE, (page + 1) * STRUCTURE_PAGE_SIZE);
  const layers = useMemo(() => referenceLayers(snapshot), [snapshot]);
  const { positions, width, height } = diagramLayout(objects, layers);
  const navigate = (id: number) => {
    const index = snapshot.objects.findIndex(object => object.id === id);
    if (index >= 0) setPage(Math.floor(index / STRUCTURE_PAGE_SIZE));
  };
  const link = (id: number | null, text?: string) => id === null ? <span>{text ?? 'nullptr'}</span> : <button type="button" className="reference-link" onClick={() => navigate(id)} aria-label={`Mostrar objeto @${id}`}>{text ?? `@${id}`}</button>;

  return <ResizablePanel title="Objetos e ponteiros"><section className="structure-view reference-view" aria-label="Objetos e ponteiros">
    <div className="structure-view-heading"><strong>Objetos e ponteiros</strong><span className="structure-type">{snapshot.objects.length} objetos</span>
      <select value={view} onChange={event => setView(event.target.value as typeof view)} aria-label="Visualização dos objetos"><option value="connections">Ligações</option><option value="fields">Campos completos</option></select>
    </div>
    {snapshot.roots.length > 0 && <div className="reference-roots" aria-label="Referências das variáveis">{snapshot.roots.map((root, index) => <span key={`${root.name}:${index}`}>{root.name} → {link(root.target)}</span>)}</div>}
    {snapshot.objects.length === 0 ? <p className="struct-empty">Nenhum objeto referenciado neste passo.</p> : <>
      {view === 'connections' && <div className="reference-diagram-scroll" tabIndex={0} role="region" aria-label="Diagrama de objetos e ligações">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Ligações entre objetos; valores e destinos completos abaixo">
          <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" /></marker></defs>
          <g data-reference-edges>{objects.flatMap(object => object.fields.flatMap((field, index) => {
            if (!field.target) return [];
            const from = positions.get(object.id)!;
            const to = positions.get(field.target);
            if (!to) return [];
            const loop = object.id === field.target;
            const offset = (index % 8) * 7;
            const d = loop ? `M${from.x + 110},${from.y}C${from.x + 155 + offset},${from.y - 70} ${from.x + 155 + offset},${from.y + 75} ${from.x + 110},${from.y + 35}` : `M${from.x},${from.y + 60}C${from.x + offset},${from.y + 105} ${to.x + offset},${to.y - 105} ${to.x},${to.y - 60}`;
            return <g key={`${object.id}:${index}`}><title>{`@${object.id}.${field.name} → @${field.target}`}</title><path d={d} fill="none" stroke={field.changed ? '#f97316' : '#94a3b8'} strokeWidth="2" markerEnd={`url(#${marker})`} /><text x={loop ? from.x + 125 : (from.x + to.x) / 2 + offset} y={loop ? from.y - 38 : (from.y + to.y) / 2} fill="#cbd5e1" fontSize="11" textAnchor="middle">{short(field.name, 16)}</text></g>;
          }))}</g>
          <g data-reference-nodes>{objects.map(object => {
            const point = positions.get(object.id)!;
            const fields = object.fields.slice(0, 3);
            return <g key={object.id} transform={`translate(${point.x},${point.y})`}>
              <title>{`@${object.id} ${object.type}; ${labels[object.status]}; ${object.fields.map(field => `${field.name} = ${field.value}`).join('; ')}`}</title>
              <rect x="-110" y="-60" width="220" height="120" rx="10" fill="#13243b" stroke={object.status === 'released' ? '#ef4444' : object.changed ? '#f97316' : '#60a5fa'} strokeWidth="2" strokeDasharray={object.status !== 'observed' ? '5 3' : undefined} />
              <text textAnchor="middle" y="-37" fill="#f8fafc" fontSize="13">@{object.id} · {short(object.type, 20)}</text>
              {object.status === 'observed' ? fields.map((field, index) => <text key={index} textAnchor="middle" y={-10 + index * 20} fill={field.changed ? '#fdba74' : '#cbd5e1'} fontSize="11">{short(`${field.name} = ${field.value}`, 30)}</text>) : <text textAnchor="middle" y="6" fill="#cbd5e1" fontSize="12">{labels[object.status]}</text>}
              {object.fields.length > fields.length && <text textAnchor="middle" y="48" fill="#94a3b8" fontSize="10">+{object.fields.length - fields.length} campos</text>}
            </g>;
          })}</g>
        </svg>
      </div>}
      <div className="reference-object-cards">{objects.map(object => <ObjectCard key={object.id} object={object} fieldsView={view === 'fields'} link={link} />)}</div>
    </>}
    {pages > 1 && <div className="structure-pagination" aria-label="Paginação de objetos"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Página anterior de objetos">←</button><span>página {page + 1} / {pages}</span><button type="button" disabled={page === pages - 1} onClick={() => setPage(page + 1)} aria-label="Próxima página de objetos">→</button></div>}
  </section></ResizablePanel>;
}
