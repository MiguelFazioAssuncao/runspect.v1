'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { EditorProps, OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { buildEditorOptions, buildEditorTheme, CUSTOM_EDITOR_THEME } from '@/lib/editorSettings';
import type { EditorSettings } from '@/lib/editorSettings';

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });
interface Props extends Omit<EditorProps, 'options' | 'theme' | 'beforeMount'> {
  settings: EditorSettings;
}

export function ConfiguredMonacoEditor({ settings, onMount, ...props }: Props) {
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
    // Monaco retains absent updateOptions keys. Restore defaults before applying
    // the new overrides, including when nested advanced properties are removed.
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

  return <Editor {...props} options={options} theme={theme} onMount={handleMount} beforeMount={(monaco) => monaco.editor.defineTheme(CUSTOM_EDITOR_THEME, buildEditorTheme(settingsRef.current))} />;
}
