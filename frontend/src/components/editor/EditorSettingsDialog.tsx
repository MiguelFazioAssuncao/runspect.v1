'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, RotateCcw, Search, Upload, X } from 'lucide-react';
import { COLOR_FIELDS, EDITOR_FIELDS, importEditorSettings, parseAdvancedOptions, serializeEditorSettings } from '@/lib/editorSettings';
import type { ColorKey, EditorFieldDefinition, EditorFieldKey, EditorSettings, SettingsSection } from '@/lib/editorSettings';
import { downloadFile } from '@/lib/export';
import { ConfiguredMonacoEditor } from './ConfiguredMonacoEditor';
import { buildCppProgram } from '@/lib/cppTemplate';

const sections: SettingsSection[] = ['Aparência', 'Layout', 'Edição', 'Cursor', 'Sugestões'];
const PREVIEW_CODE = buildCppProgram(`    // Experimente suas preferências aqui.
    vector<int> valores = {8, 3, 5, 1};
    for (int valor : valores) {
        cout << "Valor: " << valor << endl;
    }
`);

interface Props {
  settings: EditorSettings;
  status: 'saved' | 'unavailable' | 'recovered';
  onChange: (settings: EditorSettings) => void;
  onReset: () => void;
  onClose: () => void;
}

function SettingValueInput({ field, value, describedBy, onChange }: {
  field: EditorFieldDefinition;
  value: string | number;
  describedBy?: string;
  onChange: (value: string | number) => void;
}) {
  // Keep incomplete input locally (e.g. typing "2" on the way to "20"). Only
  // persist usable values; external imports/resets still update the field.
  const external = String(value);
  const [draft, setDraft] = useState({ external, source: external });
  if (draft.external !== external) setDraft({ external, source: external });
  return <input type={typeof value === 'number' ? 'number' : 'text'} value={draft.source} min={field.min} max={field.max} step={field.step} maxLength={300} aria-label={field.label} aria-describedby={describedBy}
    onChange={(event) => {
      const source = event.target.value;
      setDraft({ external, source });
      if (typeof value === 'number') {
        if (source !== '' && event.target.validity.valid) onChange(event.target.valueAsNumber);
      } else if (source.trim()) onChange(source);
    }} onBlur={() => setDraft({ external, source: external })} />;
}

export function EditorSettingsDialog({ settings, status, onChange, onReset, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<SettingsSection | 'Avançado'>('Aparência');
  const [advancedSource, setAdvancedSource] = useState(() => JSON.stringify(settings.advancedOptions, null, 2));
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const normalizedQuery = query.toLocaleLowerCase('pt-BR').trim();
  const visibleFields = Object.entries(EDITOR_FIELDS).filter(([, field]) => normalizedQuery
    ? `${field.label} ${field.section} ${'hint' in field ? field.hint : ''}`.toLocaleLowerCase('pt-BR').includes(normalizedQuery)
    : field.section === section);
  const showColors = (!normalizedQuery && section === 'Aparência') || (normalizedQuery && 'cores cor fundo texto palavras-chave strings números comentários cursor seleção linha'.includes(normalizedQuery));

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const changeField = (key: EditorFieldKey, value: string | number | boolean) => {
    onChange({ ...settings, [key]: value });
    setNotice('');
  };
  const reset = () => {
    onReset(); setAdvancedSource('{}'); setError(''); setNotice('Preferências padrão restauradas.');
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 100_000) throw new Error('Escolha um arquivo JSON com até 100 KB.');
      const imported = importEditorSettings(await file.text());
      onChange(imported);
      setAdvancedSource(JSON.stringify(imported.advancedOptions, null, 2));
      setError(''); setNotice('Preferências importadas e aplicadas.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível importar o arquivo.'); setNotice(''); }
    if (fileRef.current) fileRef.current.value = '';
  };
  const applyAdvanced = () => {
    try {
      const advancedOptions = parseAdvancedOptions(advancedSource);
      onChange({ ...settings, advancedOptions });
      setError(''); setNotice('Opções avançadas aplicadas.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'JSON inválido.'); setNotice(''); }
  };

  return (
    <dialog ref={dialogRef} className="editor-settings-dialog" aria-labelledby="editor-settings-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header className="editor-settings-header">
        <div><h2 id="editor-settings-title">Personalizar editor</h2><p>Seu editor, do seu jeito. As alterações são aplicadas na hora.</p></div>
        <button type="button" className="editor-settings-icon" aria-label="Fechar preferências do editor" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="editor-settings-body">
        <div className="editor-settings-controls">
          <label className="editor-settings-search"><Search size={16} aria-hidden="true" /><input autoFocus aria-label="Buscar configurações do editor" placeholder="Buscar configurações..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <nav className="editor-settings-tabs" aria-label="Categorias das preferências">
            {[...sections, 'Avançado' as const].map((item) => <button type="button" key={item} aria-pressed={section === item && !normalizedQuery} onClick={() => { setSection(item); setQuery(''); }}>{item}</button>)}
          </nav>
          <div className="editor-settings-fields">
            {visibleFields.map(([rawKey, field]) => {
              const key = rawKey as EditorFieldKey;
              const value = settings[key];
              const hint = 'hint' in field ? field.hint : undefined;
              const hintId = hint ? `editor-setting-hint-${key}` : undefined;
              return (
                <label key={key} className={`editor-setting-field ${typeof value === 'boolean' ? 'editor-setting-toggle' : ''}`}>
                  <span>{field.label}{normalizedQuery && <small>{field.section}</small>}</span>
                  {typeof value === 'boolean'
                    ? <input type="checkbox" checked={value} aria-label={field.label} aria-describedby={hintId} onChange={(event) => changeField(key, event.target.checked)} />
                    : 'choices' in field && field.choices
                      ? <select value={String(value)} aria-label={field.label} aria-describedby={hintId} onChange={(event) => changeField(key, event.target.value)}>{field.choices.map(([option, label]) => <option key={option} value={option}>{label}</option>)}</select>
                      : <SettingValueInput field={field} value={value} describedBy={hintId} onChange={(next) => changeField(key, next)} />}
                  {hint && <small id={hintId}>{hint}</small>}
                </label>
              );
            })}
            {showColors && <fieldset className="editor-settings-colors" disabled={!settings.customColors}>
              <legend>Paleta personalizada</legend>
              <p>Ative “Usar minhas cores” para editar a paleta sobre o tema base.</p>
              <div>{(Object.entries(COLOR_FIELDS) as [ColorKey, string][]).map(([key, label]) => <label key={key}><input type="color" value={settings.colors[key]} onChange={(event) => onChange({ ...settings, colors: { ...settings.colors, [key]: event.target.value } })} /><span>{label}<small>{settings.colors[key]}</small></span></label>)}</div>
            </fieldset>}
            {!normalizedQuery && section === 'Avançado' && <div className="editor-settings-advanced">
              <h3>Opções extras do Monaco</h3>
              <p>Adicione opções em JSON. Elas têm prioridade sobre os controles do painel. Apague uma opção e aplique para voltar ao valor do painel.</p>
              <a href="https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor_editor_api.editor.IStandaloneEditorConstructionOptions.html" target="_blank" rel="noreferrer">Consultar opções disponíveis</a>
              <label htmlFor="editor-advanced-json">Opções em JSON</label>
              <textarea id="editor-advanced-json" value={advancedSource} spellCheck={false} onChange={(event) => setAdvancedSource(event.target.value)} />
              <p>Exemplo: <code>{'{ "mouseWheelScrollSensitivity": 2, "minimap": { "maxColumn": 80 } }'}</code></p>
              <p>Modelo, linguagem, tema, dimensões e modo de edição são gerenciados pelo Runspect. Apenas opções serializáveis em JSON são aceitas.</p>
              <button type="button" className="editor-settings-button editor-settings-primary" onClick={applyAdvanced}>Aplicar JSON</button>
            </div>}
            {normalizedQuery && visibleFields.length === 0 && !showColors && <p className="editor-settings-empty">Nenhuma configuração encontrada.</p>}
          </div>
        </div>
        <aside className="editor-settings-preview">
          <div className="editor-settings-preview-heading"><strong>Prévia ao vivo</strong><span>Experimente digitar aqui</span></div>
          <div className="editor-settings-preview-code"><ConfiguredMonacoEditor height="100%" defaultLanguage="cpp" defaultValue={PREVIEW_CODE} settings={settings} /></div>
          <p>As preferências ficam neste navegador e neste endereço do Runspect. Exporte o JSON para usá-las em outro navegador.</p>
          {Object.keys(settings.advancedOptions).length > 0 && <p className="editor-settings-override">Há opções avançadas ativas; elas podem substituir os controles do painel.</p>}
        </aside>
      </div>
      <footer className="editor-settings-footer">
        <div className="editor-settings-status" role="status">
          {status === 'unavailable' ? 'Armazenamento indisponível. As alterações valem apenas nesta sessão.' : status === 'recovered' ? 'Preferências salvas inválidas. Usando os padrões.' : 'Preferências salvas automaticamente neste navegador.'}
          {notice && <span>{notice}</span>}
        </div>
        {error && <p className="editor-settings-error" role="alert">{error}</p>}
        <div className="editor-settings-actions">
          <button type="button" className="editor-settings-button" onClick={reset}><RotateCcw size={14} /> Restaurar padrões</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-label="Arquivo de preferências" onChange={(event) => { void importFile(event.target.files?.[0]); }} />
          <button type="button" className="editor-settings-button" onClick={() => fileRef.current?.click()}><Upload size={14} /> Importar</button>
          <button type="button" className="editor-settings-button" onClick={() => {
            try { downloadFile(new Blob([serializeEditorSettings(settings)], { type: 'application/json' }), 'runspect-editor.json'); setError(''); setNotice('Exportação solicitada.'); }
            catch { setError('Não foi possível exportar as preferências.'); }
          }}><Download size={14} /> Exportar</button>
          <button type="button" className="editor-settings-button editor-settings-primary" onClick={onClose}>Concluir</button>
        </div>
      </footer>
    </dialog>
  );
}
