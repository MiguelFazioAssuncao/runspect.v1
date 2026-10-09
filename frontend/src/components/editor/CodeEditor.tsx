'use client';

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { editor as MonacoEditor } from 'monaco-editor';
import { Settings2 } from 'lucide-react';
import { useEditorSettings } from '@/hooks/useEditorSettings';
import { ConfiguredMonacoEditor } from './ConfiguredMonacoEditor';

const EditorSettingsDialog = dynamic(() => import('./EditorSettingsDialog').then((module) => module.EditorSettingsDialog), { ssr: false });

interface CodeEditorProps {
  code: string;
  setCode: (code: string) => void;
  onRun: () => void;
  isLoading: boolean;
  output?: string;
  hasError?: boolean;
  logs?: string[];
  activeLine?: number | null;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  setCode,
  onRun,
  isLoading,
  output,
  hasError = false,
  logs = [],
  activeLine = null,
}) => {
  const { settings, status, updateSettings, resetSettings } = useEditorSettings();
  const [showSettings, setShowSettings] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);
  const activeLineRef = useRef<number | null>(activeLine);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);

  const updateDecoration = (editor: MonacoEditor.IStandaloneCodeEditor) => {
    const decorations = decorationsRef.current;
    const model = editor.getModel();
    const monaco = monacoRef.current;
    if (!decorations || !model || !monaco) return;

    const line = activeLineRef.current;
    if (line === null || !Number.isInteger(line) || line < 1 || line > model.getLineCount()) {
      decorations.clear();
      return;
    }

    decorations.set([{
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: 'exec-line',
        linesDecorationsClassName: 'exec-line-gutter',
      },
    }]);
    editor.revealLineInCenterIfOutsideViewport(line);
  };

  const handleEditorMount = (
    editor: MonacoEditor.IStandaloneCodeEditor,
    monaco: typeof import('monaco-editor')
  ) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    decorationsRef.current = editor.createDecorationsCollection();
    updateDecoration(editor);
  };

  useEffect(() => {
    activeLineRef.current = activeLine;
    const editor = editorRef.current;
    if (editor) updateDecoration(editor);
  }, [activeLine]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [logs.length]);

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-b border-slate-800">
        <span className="text-xs font-mono font-semibold text-slate-400">solution.cpp</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowSettings(true)} title="Personalizar editor" aria-label="Personalizar editor" aria-haspopup="dialog" className="editor-settings-trigger"><Settings2 size={15} /></button>
          <button
            type="button"
            onClick={onRun}
            disabled={isLoading}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Executando...' : 'Executar Algoritmo'}
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ConfiguredMonacoEditor
          settings={settings}
          height="100%"
          defaultLanguage="cpp"
          value={code}
          onChange={(val) => setCode(val || '')}
          onMount={handleEditorMount}
        />
      </div>
      {output && (
        <section className={`terminal-panel ${hasError ? 'terminal-panel-error' : ''}`} aria-label="Saída do terminal">
          <div className="terminal-header">
            <div className="traffic-lights" aria-hidden="true"><i /><i /><i /></div>
            <span>terminal</span>
            <span className="terminal-status">{hasError ? 'erro' : 'saída'}</span>
          </div>
          <pre ref={outputRef} className="terminal-output">
            {output}
            {logs.length > 0 && '\n' + logs.map((line) => `> ${line}`).join('\n')}
          </pre>
        </section>
      )}
      {showSettings && <EditorSettingsDialog settings={settings} status={status} onChange={updateSettings} onReset={resetSettings} onClose={() => setShowSettings(false)} />}
    </div>
  );
};
