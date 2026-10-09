'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Activity, CircleHelp, Clock3, Code2, Network } from 'lucide-react';
import { flushSync } from 'react-dom';
import { createRecordingCapture } from '@/lib/recordingCapture';
import type { RecordingCapture } from '@/lib/recordingCapture';
import { DocumentationPanel } from '@/components/DocumentationPanel';
import type { DocumentationMethod } from '@/lib/documentation';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { GraphCanvas } from '@/components/visualizer/GraphCanvas';
import type { GraphLayout, GraphCanvasHandle } from '@/components/visualizer/GraphCanvas';
import { GraphToolbar } from '@/components/visualizer/GraphToolBar';
import { SvgExportDialog } from '@/components/visualizer/SvgExportDialog';
import { GraphLegend } from '@/components/visualizer/GraphLegend';
import { TimelineControls } from '@/components/visualizer/TimelineControls';
import { StructsPanel } from '@/components/visualizer/StructsPanel';
import { ProgramConsole } from '@/components/visualizer/ProgramConsole';
import { VectorSortPanel } from '@/components/visualizer/VectorSortPanel';
import { GraphAnalysisPanel } from '@/components/visualizer/GraphAnalysisPanel';
import { analyzeGraph } from '@/lib/graphAnalysis';
import { useVisualizerPlayer } from '@/hooks/useVisualizerPlayer';
import { examples } from '@/lib/examples';
import { DEFAULT_CPP_CODE } from '@/lib/cppTemplate';
import { convertToPureCpp } from '@/lib/codeConversion';
import { exportJson } from '@/lib/export';
import { terminalOutput } from '@/lib/terminalOutput';
import { captureSvgSnapshot, DEFAULT_SVG_OPTIONS } from '@/lib/svgExport';
import type { SvgExportOptions, SvgSnapshot } from '@/lib/svgExport';
import { boundedOperation, createRecordingPlan, recordVisualization, RecordingStopped, RECORDING_BG, throwIfRecordingAborted } from '@/lib/recording';
import type { RecordingPlan, RecordingStatus } from '@/lib/recording';
import { captureFontCSS } from '@/lib/captureFonts';
import type { ExecutionResult, TraceStep } from '@/types/visualizer';

type PlayerState = ReturnType<typeof useVisualizerPlayer>;
const NO_STEPS: TraceStep[] = [];
interface RecordingStage {
  w: number;
  h: number;
  plan: RecordingPlan;
  steps: TraceStep[];
  layout: GraphLayout;
  runId: number;
  index: number;
}
interface RecordingSession {
  stop: AbortController;
  dispose: AbortController;
}

type ExampleItem = (typeof examples)[number];

const filterExamples = (query: string, category: string): ExampleItem[] => {
  const normalizedQuery = query.toLocaleLowerCase();
  return examples.filter((example) => {
    const matchesQuery = `${example.name} ${example.description ?? ''} ${(example.tags ?? []).join(' ')}`
      .toLocaleLowerCase()
      .includes(normalizedQuery);
    return matchesQuery && (category === 'todas' || (example.category ?? 'Outros') === category);
  });
};

interface VisualizationStageProps {
  player: PlayerState;
  layout: GraphLayout;
  runId: number;
  hasSteps: boolean;
  graphRef?: React.Ref<GraphCanvasHandle>;
  staticRender?: boolean;
}

const VisualizationStage = React.memo(function VisualizationStage({ player, layout, runId, hasSteps, graphRef, staticRender = false }: VisualizationStageProps) {
  const analysisKey = JSON.stringify({
    directed: player.directed,
    nodes: player.graphState.nodes.map(node => ({ id: node.id, label: node.label })),
    edges: player.graphState.edges.map(edge => ({ source: typeof edge.source === 'number' ? edge.source : edge.source.id, target: typeof edge.target === 'number' ? edge.target : edge.target.id, weight: edge.weight })),
  });
  const graphAnalysis = useMemo(() => {
    const topology = JSON.parse(analysisKey) as { directed: boolean; nodes: PlayerState['graphState']['nodes']; edges: PlayerState['graphState']['edges'] };
    return topology.nodes.length ? analyzeGraph(topology.nodes, topology.edges, topology.directed) : null;
  }, [analysisKey]);
  const flowSummary = useMemo(() => {
    const message = [...player.logs].reverse().find((log) => /Fluxo:\s*\d+,\s*custo:\s*-?\d+/i.test(log));
    const match = message?.match(/Fluxo:\s*(\d+),\s*custo:\s*(-?\d+)/i);
    return match ? { flow: Number(match[1]), cost: Number(match[2]) } : null;
  }, [player.logs]);

  const hasGraph = player.graphState.nodes.length > 0;
  const hasVectors = player.vectors.length > 0;
  const visibleStructs = player.structs.filter(struct => struct.name !== 'Execução' && (struct.name !== 'Variáveis' || struct.items.length > 0));
  const hasStructs = visibleStructs.length > 0 || player.matrices.length > 0;
  const hasVisualization = hasGraph || hasVectors || hasStructs;
  const hasProgramConsole = !!player.programConsole.output || player.programConsole.warnings.length > 0;

  return (
    <>
      {!hasGraph && player.caption && <div className="frame-caption frame-caption-inline" role="status">{player.caption}</div>}
      <div className={`graph-stage ${!hasGraph && hasVisualization ? 'graph-stage-data-only' : ''} ${hasVectors && !hasGraph ? 'graph-stage-vector-only' : ''}`}>
        {hasGraph && (
          <div className="graph-panel">
            <GraphCanvas
              ref={graphRef}
              key={runId}
              nodes={player.graphState.nodes}
              edges={player.graphState.edges}
              directed={player.directed}
              weighted={player.weighted}
              layout={layout}
              staticRender={staticRender}
              bridgeEdgeIndexes={graphAnalysis?.bridgeEdgeIndexes}
              articulationNodeIds={graphAnalysis?.articulationNodeIds}
              stronglyConnectedComponentByNode={graphAnalysis?.stronglyConnectedComponentByNode}
              coloringByNode={graphAnalysis?.coloringByNode}
              negativeCycleEdgeIndexes={graphAnalysis?.negativeCycleEdgeIndexes}
              minCutEdgeIndexes={graphAnalysis?.minCutEdgeIndexes}
              minCutSide={graphAnalysis?.minCutSide}
            />
            {player.caption && <div className="frame-caption" role="status">{player.caption}</div>}
          </div>
        )}
        {!hasGraph && hasStructs && <StructsPanel structs={visibleStructs} matrices={player.matrices} primary solo={!hasVectors} />}
        <VectorSortPanel vectors={player.vectors} issues={player.vectorIssues} solo={!hasGraph} />
        {!hasVisualization && hasProgramConsole && <ProgramConsole output={player.programConsole.output} warnings={player.programConsole.warnings} />}
        {!hasVisualization && !hasProgramConsole && (
          <div className="graph-panel">
            <div className="graph-empty-state">
              <Network className="h-8 w-8" />
              {!hasSteps ? (
                <>
                  <strong>Nenhuma visualização para exibir</strong>
                  <span>Execute o algoritmo para visualizar os passos.</span>
                </>
              ) : (
                <>
                  <strong>Nenhum dado visual neste passo</strong>
                  <span>Avance na linha do tempo para acompanhar o algoritmo.</span>
                </>
              )}
            </div>
          </div>
        )}
        {hasGraph && <GraphLegend />}
      </div>
      {!staticRender && <GraphAnalysisPanel analysis={graphAnalysis} flowSummary={flowSummary} />}
      {hasGraph && <StructsPanel structs={player.structs} matrices={player.matrices} />}
      {hasVisualization && <ProgramConsole output={player.programConsole.output} warnings={player.programConsole.warnings} />}
    </>
  );
}, (previous, next) => previous.layout === next.layout && previous.runId === next.runId && previous.hasSteps === next.hasSteps && previous.graphRef === next.graphRef && previous.staticRender === next.staticRender &&
  (['graphState', 'vectors', 'vectorIssues', 'logs', 'programConsole', 'structs', 'matrices', 'caption', 'directed', 'weighted', 'multi'] as const).every(key => previous.player[key] === next.player[key]));

export default function Home() {
  const [code, setCode] = useState(DEFAULT_CPP_CODE);
  const [customCode, setCustomCode] = useState(DEFAULT_CPP_CODE);
  const [stdin, setStdin] = useState(examples[0].stdin ?? '');
  const [editorTab, setEditorTab] = useState<'custom' | 'examples'>('custom');
  const [selectedExampleId, setSelectedExampleId] = useState(examples[0].id);
  const [exampleQuery, setExampleQuery] = useState('');
  const [exampleCategory, setExampleCategory] = useState('todas');
  const [conversionNotice, setConversionNotice] = useState('');
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [runId, setRunId] = useState(0);
  const [layout, setLayout] = useState<GraphLayout>('force');
  const [output, setOutput] = useState('Aguardando uma execução...');
  const [untracedOutput, setUntracedOutput] = useState('');
  const [hasError, setHasError] = useState(false);
  const [traceMode, setTraceMode] = useState<ExecutionResult['trace_mode']>();
  const [isLoading, setIsLoading] = useState(false);
  const [showDocumentation, setShowDocumentation] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [fullscreen, setFullscreen] = useState(false);
  const [recordingStage, setRecordingStage] = useState<RecordingStage | null>(null);
  const [svgSnapshot, setSvgSnapshot] = useState<SvgSnapshot | null>(null);
  const [svgOptions, setSvgOptions] = useState<SvgExportOptions>(DEFAULT_SVG_OPTIONS);
  const [svgExportError, setSvgExportError] = useState('');
  const [recordingDownload, setRecordingDownload] = useState<{ url: string; filename: string } | null>(null);
  const [recording, setRecording] = useState<RecordingStatus>({
    phase: 'idle',
    message: '',
  });

  const player = useVisualizerPlayer(steps, traceMode === 'automatic');
  const recPlayer = useVisualizerPlayer(recordingStage?.steps ?? NO_STEPS, false, recordingStage?.index);

  const graphRef = useRef<GraphCanvasHandle>(null);
  const visualizerRef = useRef<HTMLDivElement>(null);
  const stageAreaRef = useRef<HTMLDivElement>(null);
  const recPlayerRef = useRef<PlayerState>(recPlayer);
  const recordingSessionRef = useRef<RecordingSession | null>(null);
  const runRequestRef = useRef(false);
  const visibleAreaRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    recPlayerRef.current = recPlayer;
  }, [recPlayer]);

  const isRecording = recording.phase === 'preparing' || recording.phase === 'recording' || recording.phase === 'finalizing';

  const categories = useMemo(
    () => ['todas', ...new Set(examples.map((example) => example.category ?? 'Outros'))],
    [],
  );
  const visibleExamples = useMemo(
    () => filterExamples(exampleQuery, exampleCategory),
    [exampleCategory, exampleQuery],
  );

  const selectExample = (example: ExampleItem) => {
    setSelectedExampleId(example.id);
    setCode(example.code);
    setStdin(example.stdin ?? '');
  };

  const changeExampleCategory = (category: string) => {
    setExampleCategory(category);
    const matches = filterExamples(exampleQuery, category);
    if (matches.length > 0) selectExample(matches[0]);
  };

  const changeExampleQuery = (query: string) => {
    setExampleQuery(query);
    const matches = filterExamples(query, exampleCategory);
    if (matches.length > 0 && !matches.some((example) => example.id === selectedExampleId)) {
      selectExample(matches[0]);
    }
  };

  const hasGraph = player.graphState.nodes.length > 0;
  const hasVectors = player.vectors.length > 0;
  const hasStructs = player.structs.some(struct => struct.name !== 'Execução' && (struct.name !== 'Variáveis' || struct.items.length > 0)) || player.matrices.length > 0;
  const hasVisualization = hasGraph || hasVectors || hasStructs;

  const playbackCompleted = player.totalSteps > 0 && player.currentStepIndex === player.totalSteps - 1;
  const terminalText = isLoading || hasError || steps.length === 0
    ? output
    : terminalOutput(player.programConsole.output || (playbackCompleted ? untracedOutput : ''), output, playbackCompleted);

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

  useEffect(() => {
    const onFullscreenChange = () => {
      if (document.fullscreenElement !== visualizerRef.current) setFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [fullscreen]);

  useEffect(() => {
    return () => {
      recordingSessionRef.current?.dispose.abort(new Error('A página de gravação foi fechada.'));
      recordingSessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (recordingDownload) URL.revokeObjectURL(recordingDownload.url);
    };
  }, [recordingDownload]);

  const toggleFullscreen = async () => {
    const visualizer = visualizerRef.current;
    if (fullscreen) {
      if (document.fullscreenElement === visualizer && document.exitFullscreen) {
        await document.exitFullscreen();
      } else {
        setFullscreen(false);
      }
      return;
    }

    if (visualizer?.requestFullscreen) {
      setFullscreen(true);
      try {
        await visualizer.requestFullscreen();
        return;
      } catch {
        setFullscreen(true);
      }
    }
    setFullscreen(true);
  };

  const stopRecording = () => {
    const session = recordingSessionRef.current;
    if (recording.phase === 'finalizing') session?.dispose.abort(new RecordingStopped());
    else session?.stop.abort(new RecordingStopped());
  };

  const startRecording = async () => {
    if (recordingSessionRef.current || runRequestRef.current) return;
    if (steps.length === 0 || player.totalSteps === 0 || !hasVisualization) {
      setRecording({ phase: 'error', message: 'Execute um algoritmo antes de gravar a visualização.' });
      return;
    }
    const rect = visibleAreaRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      setRecording({ phase: 'error', message: 'A área de visualização ainda não está pronta.' });
      return;
    }
    let plan: RecordingPlan;
    try {
      plan = createRecordingPlan(player.totalSteps, player.speed, rect.width, rect.height, window.devicePixelRatio || 1);
    } catch (error) {
      setRecording({ phase: 'error', message: error instanceof Error ? error.message : 'Não foi possível preparar a gravação.' });
      return;
    }

    const session: RecordingSession = { stop: new AbortController(), dispose: new AbortController() };
    recordingSessionRef.current = session;
    const ownsSession = () => recordingSessionRef.current === session;
    const activeSession = () => ownsSession() && !session.dispose.signal.aborted;
    player.setIsPlaying(false);
    setRecordingDownload(null);
    setRecording({ phase: 'preparing', message: 'Preparando gravação…', progress: 0 });
    let snapshotCapture: RecordingCapture | undefined;

    try {
      flushSync(() => setRecordingStage({ w: rect.width, h: rect.height, plan, steps, layout, runId, index: 0 }));
      const result = await recordVisualization({
        plan,
        stop: session.stop.signal,
        dispose: session.dispose.signal,
        onStatus: (status) => { if (activeSession()) setRecording(status); },
        capture: async (step, signals) => {
          throwIfRecordingAborted(signals);
          // Commit both the requested frame and the graph layout before reading DOM.
          // No animation-frame wait: background tabs must be able to export too.
          const renderStart = performance.now();
          flushSync(() => setRecordingStage(current => current && ownsSession() ? { ...current, index: step } : current));
          performance.measure('recording:render', { start: renderStart });
          const area = stageAreaRef.current;
          if (!activeSession() || !area || recPlayerRef.current.currentStepIndex !== step) {
            throw new Error('Não foi possível preparar o quadro da gravação.');
          }
          if (!snapshotCapture) {
            await boundedOperation(document.fonts.ready, 10_000, signals);
            const fontEmbedCSS = await boundedOperation(captureFontCSS(area, signals), 10_000, signals);
            throwIfRecordingAborted(signals);
            snapshotCapture = createRecordingCapture(rect.width, rect.height, plan.width, plan.height, fontEmbedCSS);
          }
          return snapshotCapture.capture(area, signals);
        },
      });
      if (!activeSession()) return;
      if (!result) {
        setRecording({ phase: 'done', message: 'Gravação interrompida antes do primeiro quadro; nenhum arquivo foi criado.' });
        return;
      }
      const url = URL.createObjectURL(result.blob);
      const filename = `runspect-visualizacao-${Date.now()}.mp4`;
      setRecordingDownload({ url, filename });
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      try { link.click(); } catch {
        // The explicit download link remains available if auto-download is blocked.
      } finally { link.remove(); }
      const codecNotice = result.codec === 'avc' ? '' : ` Codec ${result.codec.toUpperCase()}: a compatibilidade com outros aplicativos pode variar.`;
      setRecording({
        phase: 'done', progress: 1,
        message: (result.partial ? 'Gravação interrompida. MP4 parcial disponível.' : 'Gravação concluída. MP4 disponível.') + codecNotice + ` Gerado em ${(result.metrics.totalMs / 1000).toFixed(1)} s.`,
      });
    } catch (error) {
      if (ownsSession()) {
        setRecording(error instanceof RecordingStopped
          ? { phase: 'done', message: 'Gravação cancelada; nenhum arquivo novo foi criado.' }
          : { phase: 'error', message: `Falha na gravação: ${error instanceof Error ? error.message : 'erro desconhecido'}` });
      }
    } finally {
      snapshotCapture?.dispose();
      if (ownsSession()) {
        recordingSessionRef.current = null;
        setRecordingStage(null);
      }
    }
  };

  const runCode = async (source = code, input = stdin) => {
    if (recordingSessionRef.current || runRequestRef.current) return;
    runRequestRef.current = true;
    player.setIsPlaying(false);
    setSteps([]);
    setUntracedOutput('');
    setIsLoading(true);
    setHasError(false);
    setOutput('Compilando e executando...');
    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: source, stdin: input }),
      });
      const responseText = await response.text();
      let result: Partial<ExecutionResult> & { error?: string };
      try {
        result = JSON.parse(responseText) as Partial<ExecutionResult> & { error?: string };
      } catch {
        throw new Error(
          response.status === 502 || response.status === 504
            ? 'O frontend não conseguiu alcançar o backend. Inicie o servidor Go ou configure RUNSPECT_API_URL.'
            : `O servidor retornou uma resposta inválida (HTTP ${response.status}).`,
        );
      }
      setTraceMode(result.trace_mode);
      setRunId((id) => id + 1);
      if (!response.ok || !result.success) {
        setSteps([]);
        setHasError(true);
        const warnings = result.trace_warnings?.length ? `\n${result.trace_warnings.join('\n')}` : '';
        setOutput(`${result.errors || result.error || `A execução falhou (HTTP ${response.status}).`}${warnings}`);
      } else {
        setSteps(result.steps ?? []);
        setUntracedOutput(result.trace_mode === 'manual' ? result.output ?? '' : '');
        const warnings = result.trace_warnings?.length ? `\n${result.trace_warnings.join('\n')}` : '';
        setOutput(`Concluído em ${result.time_ms} ms (análise, compilação e execução).${warnings}`);
      }
    } catch (error) {
      setHasError(true);
      if (error instanceof TypeError) {
        setBackendStatus('disconnected');
        setOutput(`Não foi possível conectar ao servidor de execução. Verifique se o backend Go está rodando em http://127.0.0.1:8080. (${error.message || 'falha de rede'})`);
      } else {
        setOutput(error instanceof Error ? error.message : 'Não foi possível executar o código.');
      }
    } finally {
      runRequestRef.current = false;
      setIsLoading(false);
    }
  };

  const loadDocumentationExample = (method: DocumentationMethod, execute: boolean) => {
    setCode(method.example);
    setCustomCode(method.example);
    setStdin(method.stdin ?? '');
    setEditorTab('custom');
    if (execute) void runCode(method.example, method.stdin ?? '');
    setShowDocumentation(false);
  };

  const handleExportSvg = () => {
    if (recordingSessionRef.current || runRequestRef.current) return;
    try {
      player.setIsPlaying(false);
      const title = `Runspect · passo ${player.currentStepIndex + 1} de ${player.totalSteps}`;
      const summary = `${player.graphState.nodes.length} vértices · ${player.graphState.edges.length} arestas · ${player.directed ? 'direcionado' : 'não direcionado'}`;
      setSvgSnapshot(captureSvgSnapshot(graphRef.current?.getSvgElement() ?? null, title, [summary, player.caption].filter(Boolean).join(' — ')));
      setSvgExportError('');
    } catch (error) {
      setSvgExportError(error instanceof Error ? error.message : 'Não foi possível preparar a exportação SVG.');
    }
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
              <div className="example-controls">
                <input className="example-search" value={exampleQuery} onChange={(e) => changeExampleQuery(e.target.value)} placeholder="buscar exemplo..." aria-label="Buscar exemplos" />
                <select className="example-select" value={exampleCategory} onChange={(e) => changeExampleCategory(e.target.value)} aria-label="Filtrar exemplos por categoria">
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
                <select
                  className="example-select"
                  value={visibleExamples.some((ex) => ex.id === selectedExampleId) ? selectedExampleId : ''}
                  onChange={(e) => {
                    const ex = examples.find((x) => x.id === e.target.value);
                    if (ex) selectExample(ex);
                  }}
                  aria-label="Selecionar técnica de programação competitiva"
                >
                  {visibleExamples.length === 0 && <option value="">nenhuma técnica encontrada</option>}
                  {visibleExamples.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {editorTab === 'examples' && (() => {
            const example = examples.find((item) => item.id === selectedExampleId);
            if (!example) return null;
            return (
              <div className="example-info">
                <strong>{example.name}</strong>
                <span>{example.description}</span>
                <small>{example.category} · {example.timeComplexity} · memória {example.memoryComplexity} · {(example.tags ?? []).join(' · ')}</small>
                <button type="button" onClick={() => { setCode(example.code); setStdin(example.stdin ?? ''); }}>restaurar exemplo</button>
              </div>
            );
          })()}
          {editorTab === 'custom' && (
            <div className="editor-actions">
              <span className="text-xs text-slate-400">Cole C++17 comum para visualizar a execução.</span>
              <button
                className="convert-button"
                onClick={() => {
                  try {
                    const converted = convertToPureCpp(customCode);
                    const blob = new Blob([converted], { type: 'text/x-c++src;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'solucao.cpp';
                    link.click();
                    URL.revokeObjectURL(url);
                    setConversionNotice('Arquivo solucao.cpp baixado com C++ puro.');
                  } catch (error) {
                    setConversionNotice(error instanceof Error ? error.message : 'Falha na conversão.');
                  }
                  window.setTimeout(() => setConversionNotice(''), 3500);
                }}
                type="button"
              >
                baixar C++ puro
              </button>
              {conversionNotice && <span className="conversion-notice" role="status">{conversionNotice}</span>}
            </div>
          )}
          <div className="code-editor-wrap">
            <CodeEditor
              code={code}
              setCode={(nextCode) => {
                setCode(nextCode);
                if (editorTab === 'custom') setCustomCode(nextCode);
              }}
              onRun={() => void runCode()}
              isLoading={isLoading}
              output={terminalText}
              hasError={hasError}
              logs={player.logs}
              activeLine={player.line}
            />
          </div>
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

        <div
          ref={visualizerRef}
          data-has-graph={hasGraph}
          className={`visualizer-column ${fullscreen ? 'visualizer-fullscreen' : ''} ${isRecording ? 'visualizer-recording' : ''}`}
        >
          <div className="visualizer-header">
            <div className="panel-label"><Network className="h-3.5 w-3.5" /> visualização</div>
            {traceMode === 'automatic' && <span className="text-xs text-slate-400">automática</span>}
            <GraphToolbar
              layout={layout}
              onLayoutChange={setLayout}
              onExportSvg={handleExportSvg}
              onExportJson={() => exportJson(steps)}
              hasGraph={hasGraph}
              hasSteps={steps.length > 0}
              onZoomIn={() => graphRef.current?.zoomIn()}
              onZoomOut={() => graphRef.current?.zoomOut()}
              onFit={() => graphRef.current?.fit()}
              isFullscreen={fullscreen}
              onToggleFullscreen={() => void toggleFullscreen()}
              canRecord={!isLoading && steps.length > 0 && hasVisualization}
              isFinalizing={false}
              isRecording={isRecording}
              onStartRecording={() => void startRecording()}
              onStopRecording={stopRecording}
            />
          </div>

          {svgExportError && <p className="svg-export-error" role="alert">{svgExportError}</p>}

          {recording.phase !== 'idle' && (
            <div className={`recording-status recording-status-${recording.phase}`} role="status">
              {recording.phase === 'recording' && <span className="recording-dot" />}
              <span>{recording.message}</span>
              {recording.progress !== undefined && isRecording && <progress value={recording.progress} max={1} aria-label="Progresso da gravação" />}
              {recordingDownload && <a className="toolbar-button" href={recordingDownload.url} download={recordingDownload.filename}>Baixar MP4</a>}
            </div>
          )}

          <div ref={visibleAreaRef} className="recording-area">
            <VisualizationStage
              player={player}
              layout={layout}
              runId={runId}
              hasSteps={steps.length > 0}
              graphRef={graphRef}
            />
          </div>

          <TimelineControls
            disabled={isRecording}
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
          {svgSnapshot && <SvgExportDialog snapshot={svgSnapshot} options={svgOptions} onOptionsChange={setSvgOptions} filename={`runspect-grafo-passo-${player.currentStepIndex + 1}.svg`} onClose={() => setSvgSnapshot(null)} />}
        </div>
      </section>

      <footer className="workspace-footer">
        <span><Clock3 className="h-3.5 w-3.5" /> passo {player.totalSteps ? player.currentStepIndex + 1 : 0} de {player.totalSteps}</span>
        <span className="footer-divider" />
        <span>visualizações: vetores · grafos · estruturas</span>
        <button className="footer-action" onClick={() => setShowDocumentation(true)} type="button"><CircleHelp className="h-3.5 w-3.5" /> documentação da API</button>
      </footer>
      {showDocumentation && <DocumentationPanel onClose={() => setShowDocumentation(false)} onLoad={loadDocumentationExample} />}

      {recordingStage && (
        <div
          aria-hidden="true"
          inert
          className="visualizer-column visualizer-fullscreen recording-stage"
          style={{
            position: 'fixed',
            inset: 'auto',
            left: -100000,
            top: 0,
            width: recordingStage.w,
            height: recordingStage.h,
            padding: 0,
            gap: 0,
            zIndex: -1,
            pointerEvents: 'none',
          }}
        >
          <div
            ref={stageAreaRef}
            data-recording-step={recPlayer.currentStepIndex}
            data-recording-event={recPlayer.eventIndex}
            data-recording-line={recPlayer.line ?? ''}
            className="recording-area"
            style={{ background: RECORDING_BG, overflow: 'hidden' }}
          >
            <VisualizationStage
              player={recPlayer}
              layout={recordingStage.layout}
              runId={recordingStage.runId}
              hasSteps={recordingStage.steps.length > 0}
              staticRender
            />
          </div>
        </div>
      )}
    </main>
  );
}
