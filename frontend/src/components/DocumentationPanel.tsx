'use client';

import { useMemo, useState } from 'react';
import { BookOpen, Play, Search, X } from 'lucide-react';
import { documentationMethods, type DocumentationMethod } from '@/lib/documentation';

interface DocumentationPanelProps {
  onClose: () => void;
  onLoad: (method: DocumentationMethod, execute: boolean) => void;
}

export function DocumentationPanel({ onClose, onLoad }: DocumentationPanelProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'Todas' | DocumentationMethod['category']>('Todas');
  const categories = ['Todas', ...new Set(documentationMethods.map((method) => method.category))] as const;
  const methods = useMemo(
    () =>
      documentationMethods.filter((method) => {
        const text = `${method.name} ${method.signature} ${method.description}`.toLocaleLowerCase();
        return text.includes(query.toLocaleLowerCase()) && (category === 'Todas' || method.category === category);
      }),
    [category, query],
  );

  return (
    <div className="docs-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="docs-panel" role="dialog" aria-modal="true" aria-labelledby="docs-title">
        <header className="docs-header">
          <div>
            <p className="section-kicker">Runspect API · C++17</p>
            <h2 id="docs-title"><BookOpen className="h-5 w-5" /> Documentação interativa</h2>
            <p>Todos os métodos do <code>visualizer.h</code>, com exemplos que você pode carregar ou executar no laboratório.</p>
          </div>
          <button className="docs-close" type="button" onClick={onClose} aria-label="Fechar documentação"><X className="h-5 w-5" /></button>
        </header>
        <div className="docs-toolbar">
          <label className="docs-search"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="buscar método, assinatura ou descrição..." /></label>
          <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} aria-label="Filtrar métodos por categoria">
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <span className="docs-count">{methods.length} de {documentationMethods.length} métodos</span>
        </div>
        <div className="docs-list">
          {methods.map((method) => (
            <article className="docs-card" key={method.name}>
              <div className="docs-card-heading">
                <div>
                  <span className="docs-category">{method.category}</span>
                  <h3>{method.name}</h3>
                </div>
                <div className="docs-actions">
                  <button type="button" onClick={() => onLoad(method, false)}>carregar no editor</button>
                  <button className="docs-run" type="button" onClick={() => onLoad(method, true)}><Play className="h-3 w-3" /> executar</button>
                </div>
              </div>
              <code className="docs-signature">{method.signature}</code>
              <p className="docs-description">{method.description}</p>
              <pre className="docs-example"><code>{method.example}</code></pre>
              {method.notes && <p className="docs-note">{method.notes}</p>}
            </article>
          ))}
          {!methods.length && <div className="docs-empty">Nenhum método corresponde à busca.</div>}
        </div>
      </section>
    </div>
  );
}
