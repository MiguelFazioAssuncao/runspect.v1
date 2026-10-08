'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, CircleHelp, Clock3, Code2, Network } from 'lucide-react';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { GraphCanvas } from '@/components/visualizer/GraphCanvas';
import type { GraphLayout } from '@/components/visualizer/GraphCanvas';
import { GraphToolbar } from '@/components/visualizer/GraphToolBar';
import { GraphLegend } from '@/components/visualizer/GraphLegend';
import { TimelineControls } from '@/components/visualizer/TimelineControls';
import { StructsPanel } from '@/components/visualizer/StructsPanel';
import { GraphAnalysisPanel } from '@/components/visualizer/GraphAnalysisPanel';
import { analyzeGraph } from '@/lib/graphAnalysis';
import { useVisualizerPlayer } from '@/hooks/useVisualizerPlayer';
import { examples } from '@/lib/examples';
import { convertToPureCpp } from '@/lib/codeConversion';
import { exportJson, exportSvg } from '@/lib/export';
import type { ExecutionResult, TraceStep } from '@/types/visualizer';

const DEFAULT_CUSTOM_CODE = `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    // Leia a entrada com cin e implemente sua solução aqui.
    // Use os métodos viz:: comentados no catálogo para visualizar o algoritmo.
    return 0;
}`;

export default function Home() {
  const [code, setCode] = useState(DEFAULT_CUSTOM_CODE);
  const [customCode, setCustomCode] = useState(DEFAULT_CUSTOM_CODE);
  const [stdin, setStdin] = useState(examples[0].stdin ?? '');
  const [editorTab, setEditorTab] = useState<'custom' | 'examples'>('custom');
  const [selectedExampleId, setSelectedExampleId] = useState(examples[0].id);
  const [conversionNotice, setConversionNotice] = useState('');
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [runId, setRunId] = useState(0);
  const [layout, setLayout] = useState<GraphLayout>('force');
  const [output, setOutput] = useState('Aguardando uma execução...');
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const player = useVisualizerPlayer(steps);
  const graphAnalysis = useMemo(
    () => player.graphState.nodes.length
      ? analyzeGraph(player.graphState.nodes, player.graphState.edges, player.directed)
      : null,
    [player.graphState.nodes, player.graphState.edges, player.directed],
  );
  const flowSummary = useMemo(() => {
    const message = [...player.logs].reverse().find((log) => /Fluxo:\s*\d+,\s*custo:\s*-?\d+/i.test(log));
    const match = message?.match(/Fluxo:\s*(\d+),\s*custo:\s*(-?\d+)/i);
    return match ? { flow: Number(match[1]), cost: Number(match[2]) } : null;
  }, [player.logs]);

  useEffect(() => {
    let active = true;

    const checkBackend = async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 3000);

      try {
        const response = await fetch('/healthz', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (active) setBackendStatus(response.ok ? 'connected' : 'disconnected');
      } catch {
        if (active) setBackendStatus('disconnected');
      } finally {
        window.clearTimeout(timeout);
      }
    };

    void checkBackend();
    const interval = window.setInterval(checkBackend, 15000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const runCode = async () => {
    setIsLoading(true);
    setHasError(false);
    setOutput('Compilando e executando...');
    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, stdin }),
      });
      const result = (await response.json()) as ExecutionResult;
      setSteps(result.steps ?? []);
      setRunId((id) => id + 1);
      if (!response.ok || !result.success) {
        setHasError(true);
        setOutput(result.errors || 'Não foi possível executar o código.');
      } else {
        setOutput(`${result.steps.length} eventos capturados em ${result.time_ms} ms.`);
      }
    } catch {
      setHasError(true);
      setOutput('Não foi possível conectar ao servidor de execução.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportSvg = () => {
    exportSvg(document.querySelector<SVGSVGElement>('.graph-panel svg'));
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="flex items-center gap-3">
          <div className="brand-mark"><Network className="h-4 w-4" /></div>
          <div><p className="brand-name">RUNSPECT</p><p className="brand-subtitle">algorithms lab</p></div>
        </div>
        <div className="topbar-context">
          <span className={`status-dot status-dot-${backendStatus}`} />
          backend {backendStatus === 'connected' ? 'conectado' : backendStatus === 'checking' ? 'verificando...' : 'desconectado'}
          <span className="text-slate-700">•</span> C++17
        </div>
      </header>

      <section className="workspace-heading">
        <div><p className="section-kicker">Interactive execution workspace</p><h1>Observe the algorithm, step by step.</h1></div>
        <div className="run-state"><Activity className="h-3.5 w-3.5" /> {isLoading ? 'executando' : 'pronto para executar'}</div>
      </section>

      <section className="workspace-grid">
        <div className="editor-column">
          <div className="editor-header">
            <div className="panel-label"><Code2 className="h-3.5 w-3.5" /> código-fonte</div>
            <div className="editor-tabs" role="tablist" aria-label="Fonte do código">
              <button
                className={`editor-tab ${editorTab === 'custom' ? 'editor-tab-active' : ''}`}
                onClick={() => {
                  setCode(customCode);
                  setEditorTab('custom');
                }}
                role="tab"
                aria-selected={editorTab === 'custom'}
              >
                seu código
              </button>
              <button
                className={`editor-tab ${editorTab === 'examples' ? 'editor-tab-active' : ''}`}
                onClick={() => {
                  const example = examples.find((item) => item.id === selectedExampleId) ?? examples[0];
                  setCode(example.code);
                  setStdin(example.stdin ?? '');
                  setEditorTab('examples');
                }}
                role="tab"
                aria-selected={editorTab === 'examples'}
              >
                técnicas
              </button>
            </div>
            {editorTab === 'examples' && (
              <select
                className="example-select"
                value={selectedExampleId}
                onChange={(e) => {
                  const ex = examples.find((x) => x.id === e.target.value);
                  if (ex) {
                    setSelectedExampleId(ex.id);
                    setCode(ex.code);
                    setStdin(ex.stdin ?? '');
                  }
                }}
                aria-label="Selecionar técnica de programação competitiva"
              >
                {examples.map((ex) => (
                  <option key={ex.id} value={ex.id}>{ex.name}</option>
                ))}
              </select>
            )}
          </div>
          {editorTab === 'custom' && (
            <div className="editor-actions">
              <button
                className="convert-button"
                onClick={() => {
                  const converted = convertToPureCpp(customCode);
                  const blob = new Blob([converted], { type: 'text/x-c++src;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = 'solucao.cpp';
                  link.click();
                  URL.revokeObjectURL(url);
                  setConversionNotice('Arquivo solucao.cpp baixado com C++ puro.');
                  window.setTimeout(() => setConversionNotice(''), 3500);
                }}
                type="button"
              >
                baixar C++ puro
              </button>
              {conversionNotice && <span className="conversion-notice" role="status">{conversionNotice}</span>}
            </div>
          )}
          <CodeEditor
            code={code}
            setCode={(nextCode) => {
              setCode(nextCode);
              if (editorTab === 'custom') setCustomCode(nextCode);
            }}
            onRun={runCode}
            isLoading={isLoading}
            output={output}
            hasError={hasError}
            logs={player.logs}
            activeLine={player.line}
          />
          <details className="stdin-panel">
            <summary>entrada (stdin)</summary>
            <textarea
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              spellCheck={false}
              placeholder="Dados lidos por cin..."
              aria-label="Entrada padrão do programa"
            />
          </details>
        </div>

        <div className="visualizer-column">
          <div className="visualizer-header">
            <div className="panel-label"><Network className="h-3.5 w-3.5" /> visualização do grafo</div>
            <GraphToolbar
              layout={layout}
              onLayoutChange={setLayout}
              onExportSvg={handleExportSvg}
              onExportJson={() => exportJson(steps)}
              hasGraph={player.graphState.nodes.length > 0}
              hasSteps={steps.length > 0}
            />
          </div>
          <div className="graph-stage">
            <div className="graph-panel">
              <GraphCanvas
                key={runId}
                nodes={player.graphState.nodes}
                edges={player.graphState.edges}
                directed={player.directed}
                weighted={player.weighted}
                layout={layout}
                bridgeEdgeIndexes={graphAnalysis?.bridgeEdgeIndexes}
                articulationNodeIds={graphAnalysis?.articulationNodeIds}
                stronglyConnectedComponentByNode={graphAnalysis?.stronglyConnectedComponentByNode}
                coloringByNode={graphAnalysis?.coloringByNode}
                negativeCycleEdgeIndexes={graphAnalysis?.negativeCycleEdgeIndexes}
                minCutEdgeIndexes={graphAnalysis?.minCutEdgeIndexes}
                minCutSide={graphAnalysis?.minCutSide}
              />
              {player.caption && <div className="frame-caption" role="status">{player.caption}</div>}
              {player.graphState.nodes.length === 0 && (
                <div className="graph-empty-state">
                  <Network className="h-8 w-8" />
                  <strong>Nenhum grafo para exibir</strong>
                  <span>Execute o algoritmo para visualizar os eventos.</span>
                </div>
              )}
            </div>
            {player.graphState.nodes.length > 0 && <GraphLegend />}
          </div>
          <GraphAnalysisPanel analysis={graphAnalysis} flowSummary={flowSummary} />
          <StructsPanel structs={player.structs} matrices={player.matrices} />
          <TimelineControls
            currentStep={player.currentStepIndex}
            totalSteps={player.totalSteps}
            isPlaying={player.isPlaying}
            speed={player.speed}
            onPlayToggle={() => player.setIsPlaying(!player.isPlaying)}
            onNext={player.nextStep}
            onPrev={player.prevStep}
            onSeek={player.seek}
            onSpeedChange={player.setSpeed}
          />
        </div>
      </section>

      <footer className="workspace-footer">
        <span><Clock3 className="h-3.5 w-3.5" /> passo {player.totalSteps ? player.currentStepIndex + 1 : 0} de {player.totalSteps}</span>
        <span className="footer-divider" />
        <span>viz: add_node · add_edge · remove_node · remove_edge · set_weight · highlight · highlight_edge · highlight_path · set_label · set_color · reset_colors · set_directed · set_weighted · set_multigraph · set_badge · set_edge_style · set_edge_label · step · show · show_matrix · print</span>
        <button className="footer-action"><CircleHelp className="h-3.5 w-3.5" /> como funciona</button>
      </footer>
    </main>
  );
}