'use client';

import React from 'react';

interface StructsPanelProps {
  structs: { name: string; items: string[] }[];
  matrices?: { name: string; rows: string[][] }[];
}

export const StructsPanel: React.FC<StructsPanelProps> = ({ structs, matrices = [] }) => {
  if (structs.length === 0 && matrices.length === 0) return null;

  return (
    <div className="structs-panel">
      {structs.map((s) => (
        <div key={s.name} className="struct-row">
          <span className="struct-name">{s.name}</span>
          <div className="struct-items">
            {s.items.length === 0 ? (
              <span className="struct-empty">vazio</span>
            ) : (
              s.items.map((item, i) => (
                <span key={`${item}-${i}`} className="struct-chip">{item}</span>
              ))
            )}
          </div>
        </div>
      ))}
      {matrices.map((m) => (
        <div key={m.name} className="struct-row">
          <span className="struct-name">{m.name}</span>
          <table className="matrix-table">
            <tbody>
              {m.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};