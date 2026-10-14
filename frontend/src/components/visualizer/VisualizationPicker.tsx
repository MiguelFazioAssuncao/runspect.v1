'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { runspectApiUrl } from '@/lib/runspectApiUrl';
import { availableVisualizationKeys, constrainVisualizationSelection, VISUALIZATION_OPTIONS } from '@/lib/visualizationSelection';
import type { VisualizationKey, VisualizationSelection } from '@/lib/visualizationSelection';

export function VisualizationPicker({ selection, source, available, execute, onConfirm, onClose }: {
  selection: VisualizationSelection;
  source: string;
  available?: VisualizationKey[];
  execute: boolean;
  onConfirm: (selection: VisualizationSelection) => void;
  onClose: () => void;
}) {
  const [analysis, setAnalysis] = useState<{ status: 'loading' | 'ready' | 'error'; keys: VisualizationKey[] }>({ status: available ? 'ready' : 'loading', keys: available ?? [] });
  const [draft, setDraft] = useState(() => constrainVisualizationSelection(selection, available ?? []));
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const description = useId();

  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (available) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 35000);
    let active = true;
    void (async () => {
      try {
        const response = await fetch(runspectApiUrl('/api/analyze'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: source }), signal: controller.signal });
        const result = await response.json() as { success?: boolean; capabilities?: unknown };
        if (!response.ok || !result.success || !Array.isArray(result.capabilities) || !result.capabilities.every(key => typeof key === 'string')) throw new Error('Análise indisponível');
        if (!active) return;
        const keys = availableVisualizationKeys(result.capabilities);
        setDraft(constrainVisualizationSelection(selection, keys));
        setAnalysis({ status: 'ready', keys });
      } catch {
        if (active) setAnalysis({ status: 'error', keys: [] });
      } finally { window.clearTimeout(timeout); }
    })();
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [source, available, selection]);

  return <dialog ref={dialog} className="visualization-picker" aria-labelledby={title} aria-describedby={description} onCancel={onClose}>
    <div className="visualization-picker-header">
      <div>
        <h2 id={title}>Escolha o que visualizar</h2>
        <p id={description}>{execute ? 'Selecione os painéis antes de executar o código.' : 'Altere os painéis desta execução.'} A lista mostra apenas as visualizações disponíveis para este programa.</p>
      </div>
      <button type="button" aria-label="Fechar seleção de visualizações" onClick={onClose}><X size={18} /></button>
    </div>
    {analysis.status === 'loading' && <p className="visualization-picker-message" role="status">Identificando as visualizações do código…</p>}
    {analysis.status === 'error' && <p className="visualization-picker-message" role="alert">Não foi possível analisar este código. Você pode executar e acompanhar a saída pelo terminal.</p>}
    {analysis.status === 'ready' && analysis.keys.length === 0 && <p className="visualization-picker-message" role="status">Este programa não tem dados compatíveis com os painéis. A execução ficará disponível no terminal.</p>}
    {analysis.status === 'ready' && analysis.keys.length > 0 && <fieldset className="visualization-picker-options">
      <legend className="sr-only">Painéis da visualização</legend>
      {VISUALIZATION_OPTIONS.filter(option => analysis.keys.includes(option.key)).map(option => <label key={option.key} className="visualization-picker-option">
        <input type="checkbox" checked={draft[option.key]} disabled={option.key === 'legend' && !draft.graph} onChange={event => {
          const checked = event.target.checked;
          setDraft(previous => ({ ...previous, [option.key]: checked, ...(option.key === 'graph' && !checked ? { legend: false } : {}) }));
        }} />
        <span><strong>{option.label}</strong><small>{option.key === 'legend' && !draft.graph ? 'Selecione Grafo para exibir a legenda.' : option.description}</small></span>
      </label>)}
    </fieldset>}
    <div className="visualization-picker-footer">
      <p>{Object.values(draft).some(Boolean) ? 'O terminal do editor continua disponível.' : 'Sem painéis selecionados: a saída aparecerá apenas no terminal.'}</p>
      <div>
        <button type="button" className="toolbar-button" onClick={onClose}>Cancelar</button>
        <button type="button" className="visualization-picker-confirm" disabled={analysis.status === 'loading'} onClick={() => onConfirm(draft)}>{execute ? 'Executar com seleção' : 'Aplicar seleção'}</button>
      </div>
    </div>
  </dialog>;
}
