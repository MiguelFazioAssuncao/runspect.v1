'use client';

import { useMemo, useState } from 'react';
import { BookOpen, Play, Search, X } from 'lucide-react';
import { documentationMethods, type DocumentationMethod } from '@/lib/documentation';
import { DOC_CATEGORY_EN, DOC_METHOD_EN, useLocale } from '@/lib/i18n';

interface DocumentationPanelProps {
  onClose: () => void;
  onLoad: (method: DocumentationMethod, execute: boolean) => void;
}

export function DocumentationPanel({ onClose, onLoad }: DocumentationPanelProps) {
  const { isEn, tr } = useLocale();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'Todas' | DocumentationMethod['category']>('Todas');
  const categories = ['Todas', ...new Set(documentationMethods.map((method) => method.category))] as const;
  const methods = useMemo(
    () =>
      documentationMethods.filter((method) => {
        const en = DOC_METHOD_EN[method.name];
        const text = `${method.name} ${method.signature} ${method.description} ${en?.description ?? ''}`.toLocaleLowerCase();
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
            <h2 id="docs-title"><BookOpen className="h-5 w-5" /> {tr('Documentação interativa', 'Interactive API reference')}</h2>
            <p>{tr('Todos os métodos do ', 'All methods in ')}<code>visualizer.h</code>{tr(', com exemplos que você pode carregar ou executar no laboratório.', ', with runnable C++17 examples.')}</p>
          </div>
          <button className="docs-close" type="button" onClick={onClose} aria-label={tr('Fechar documentação', 'Close documentation')}><X className="h-5 w-5" /></button>
        </header>
        <div className="docs-toolbar">
          <label className="docs-search"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('buscar método, assinatura ou descrição...', 'search method, signature, or description...')} /></label>
          <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} aria-label={tr('Filtrar métodos por categoria', 'Filter methods by category')}>
            {categories.map((item) => <option key={item} value={item}>{isEn ? DOC_CATEGORY_EN[item] ?? item : item}</option>)}
          </select>
          <span className="docs-count">{methods.length} {tr('de', 'of')} {documentationMethods.length} {tr('métodos', 'methods')}</span>
        </div>
        <div className="docs-list">
          {methods.map((method) => {
            const en = isEn ? DOC_METHOD_EN[method.name] : undefined;
            const catLabel = isEn ? DOC_CATEGORY_EN[method.category] ?? method.category : method.category;
            return (
              <article className="docs-card" key={method.name}>
                <div className="docs-card-heading">
                  <div>
                    <span className="docs-category">{catLabel}</span>
                    <h3>{method.name}</h3>
                  </div>
                  <div className="docs-actions">
                    <button type="button" onClick={() => onLoad(method, false)}>{tr('carregar no editor', 'load in editor')}</button>
                    <button className="docs-run" type="button" onClick={() => onLoad(method, true)}><Play className="h-3 w-3" /> {tr('executar', 'run')}</button>
                  </div>
                </div>
                <code className="docs-signature">{method.signature}</code>
                <p className="docs-description">{en?.description ?? method.description}</p>
                <pre className="docs-example"><code>{method.example}</code></pre>
                {(en?.notes ?? method.notes) && <p className="docs-note">{en?.notes ?? method.notes}</p>}
              </article>
            );
          })}
          {!methods.length && <div className="docs-empty">{tr('Nenhum método corresponde à busca.', 'No methods match your search.')}</div>}
        </div>
      </section>
    </div>
  );
}
