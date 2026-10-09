'use client';

import React from 'react';

interface StructsPanelProps {
  structs: { name: string; items: string[] }[];
  matrices?: { name: string; rows: string[][] }[];
  primary?: boolean;
  solo?: boolean;
}

export const StructsPanel: React.FC<StructsPanelProps> = ({ structs, matrices = [], primary = false, solo = false }) => {
  if (structs.length === 0 && matrices.length === 0) return null;

  const renderStruct = (s: StructsPanelProps['structs'][number]) => (
        <div key={s.name} className={`struct-row${s.name === 'Variáveis' ? ' struct-row-variables' : ''}`}>
          <span className="struct-name">{s.name}</span>
          <div className="struct-items">
            {s.items.length === 0 ? (
              <span className="struct-empty">vazio</span>
            ) : (
              s.items.map((item, i) => {
                const separator = primary && s.name === 'Variáveis' ? item.indexOf(' = ') : -1;
                return separator < 0 ? (
                  <span key={i} className="struct-chip">{item}</span>
                ) : (
                  <span key={i} className="variable-card">
                    <span className="variable-name">{item.slice(0, separator)}</span>
                    <strong className="variable-value">{item.slice(separator + 3)}</strong>
                  </span>
                );
              })
            )}
          </div>
        </div>
  );
  const variables = primary ? structs.filter(s => s.name === 'Variáveis') : [];
  const cards = primary ? structs.filter(s => s.name !== 'Variáveis') : structs;

  return (
    <div className={`structs-panel${primary ? ' structs-panel-primary' : ''}${solo ? ' structs-panel-solo' : ''}`}>
      {variables.map(renderStruct)}
      {(cards.length > 0 || matrices.length > 0) && <div className="struct-grid">
      {cards.map(renderStruct)}
      {matrices.map((m) => {
        const columns = Math.max(0, ...m.rows.map(row => row.length));
        return (
        <div key={m.name} className="struct-row matrix-card">
          <div className="matrix-heading">
            <span className="struct-name">{m.name}</span>
            <span className="matrix-size" aria-label={`${m.rows.length} linhas, ${columns} colunas`}>{m.rows.length} × {columns}</span>
          </div>
          <div className="matrix-scroll" tabIndex={0} role="region" aria-label={`Matriz ${m.name}`}>
          {m.rows.length === 0 ? <span className="struct-empty">vazio</span> : <table className="matrix-table" aria-label={m.name}>
            <thead>
              <tr><th aria-hidden="true" />{Array.from({ length: columns }, (_, c) => <th key={c} scope="col">{c}</th>)}</tr>
            </thead>
            <tbody>
              {m.rows.map((row, r) => (
                <tr key={r}>
                  <th scope="row">{r}</th>
                  {row.map((cell, c) => (
                    <td key={c}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>}
          </div>
        </div>
        );
      })}
      </div>}
    </div>
  );
};
