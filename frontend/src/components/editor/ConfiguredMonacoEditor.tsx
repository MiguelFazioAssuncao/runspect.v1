'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { EditorProps, OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { buildEditorOptions, buildEditorTheme, CUSTOM_EDITOR_THEME } from '@/lib/editorSettings';
import type { EditorSettings } from '@/lib/editorSettings';

const Editor = dynamic(async () => {
  const monacoModule = await import('@monaco-editor/react');
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');
  monacoModule.loader.config({ paths: { vs: `${basePath}/monaco/vs` } });
  return monacoModule.default;
}, { ssr: false });
interface Props extends Omit<EditorProps, 'options' | 'theme' | 'beforeMount' | 'onChange'> {
  settings: EditorSettings;
  onChange?: (value: string | undefined) => void;
}

export function ConfiguredMonacoEditor({ settings, onMount, ...props }: Props) {
  const [plainEditor, setPlainEditor] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const settingsRef = useRef(settings);
  const onMountRef = useRef(onMount);
  const advancedKeysRef = useRef<string[]>([]);
  const options = useMemo(() => buildEditorOptions(settings), [settings]);
  const theme = settings.customColors ? CUSTOM_EDITOR_THEME : settings.theme;

  const applySettings = useCallback((current: EditorSettings) => {
    const monaco = monacoRef.current;
    const instance = editorRef.current;
    if (!monaco || !instance) return;
    monaco.editor.defineTheme(CUSTOM_EDITOR_THEME, buildEditorTheme(current));
    monaco.editor.setTheme(current.customColors ? CUSTOM_EDITOR_THEME : current.theme);
    const registry = monaco.editor.EditorOptions as unknown as Record<string, { defaultValue: unknown }>;
    const defaults = Object.fromEntries(advancedKeysRef.current.filter((key) => registry[key]).map((key) => [key, registry[key].defaultValue]));
    instance.updateOptions(defaults);
    instance.updateOptions(buildEditorOptions(current));
    advancedKeysRef.current = Object.keys(current.advancedOptions);
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
    applySettings(settings);
  }, [settings, applySettings]);

  useEffect(() => { onMountRef.current = onMount; }, [onMount]);

  const handleMount: OnMount = (instance, monaco) => {
    editorRef.current = instance;
    monacoRef.current = monaco;
    applySettings(settingsRef.current);
    onMountRef.current?.(instance, monaco);
  };

  if (plainEditor) return <textarea className="editor-fallback" aria-label="Código C++ (editor simples)" spellCheck={false} value={props.value ?? ''} onChange={event => props.onChange?.(event.target.value)} readOnly={options.readOnly} />;

  return <Editor {...props} loading={<div className="editor-loading"><span>Carregando editor…</span><button type="button" onClick={() => setPlainEditor(true)}>Usar editor simples</button></div>} options={options} theme={theme} onMount={handleMount} beforeMount={(monaco) => monaco.editor.defineTheme(CUSTOM_EDITOR_THEME, buildEditorTheme(settingsRef.current))} />;
}
