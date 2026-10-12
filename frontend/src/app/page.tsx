'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Activity, CircleHelp, Clock3, Network, SlidersHorizontal } from 'lucide-react';
import { LearningPanel } from '@/components/LearningPanel';
import type { SampleRun } from '@/components/LearningPanel';
import { useStudyProject } from '@/hooks/useStudyProject';
import { MAX_PROJECT_BYTES, normalizeSearch, parseStudyProject, serializeStudyProject, validateProgram } from '@/lib/studyProject';
import { WorkspaceSplit } from '@/components/workspace/WorkspaceSplit';
import { PanelInteractionContext, ResizablePanel } from '@/components/workspace/ResizablePanel';
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
import { VisualizationPicker } from '@/components/visualizer/VisualizationPicker';
import { DEFAULT_VISUALIZATION_SELECTION, selectVisualizationContent, traceVisualizationKeys, visualizationSelectionLabel } from '@/lib/visualizationSelection';
import type { VisualizationKey, VisualizationSelection } from '@/lib/visualizationSelection';
import { analyzeGraph } from '@/lib/graphAnalysis';
import { useVisualizerPlayer } from '@/hooks/useVisualizerPlayer';
import { examples } from '@/lib/examples';
import { convertToPureCpp } from '@/lib/codeConversion';
import { downloadFile, exportJson } from '@/lib/export';
import { terminalOutput } from '@/lib/terminalOutput';
import { runspectApiUrl } from '@/lib/runspectApiUrl';
import { captureSvgSnapshot, DEFAULT_SVG_OPTIONS } from '@/lib/svgExport';
import type { SvgExportOptions, SvgSnapshot } from '@/lib/svgExport';
import { boundedOperation, createRecordingPlan, recordVisualization, RecordingStopped, RECORDING_BG, throwIfRecordingAborted } from '@/lib/recording';
import type { RecordingPlan, RecordingStatus } from '@/lib/recording';
import { captureFontCSS } from '@/lib/captureFonts';
import type { ExecutionResult, TraceStep } from '@/types/visualizer';
import { TRACE_PRESETS } from '@/lib/traceLimits';
import type { TracePreset } from '@/lib/traceLimits';

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
  selection: VisualizationSelection;
  fallbackOutput: string;
}
interface RecordingSession {
  stop: AbortController;
  dispose: AbortController;
}

type ExampleItem = (typeof examples)[number];

const filterExamples = (query: string, category: string): ExampleItem[] => {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  return examples.filter((example) => {
    const searchable = normalizeSearch(`${example.name} ${example.description} ${example.tags.join(' ')}`);
    const matchesQuery = terms.every(term => searchable.includes(term));
    return matchesQuery && (category === 'todas' || (example.category ?? 'Outros') === category);
  });
};

interface VisualizationStageProps {
  player: PlayerState;
  layout: GraphLayout;
  runId: number;
  hasSteps: boolean;
  selection: VisualizationSelection;
  fallbackOutput?: string;
  graphRef?: React.Ref<GraphCanvasHandle>;
  staticRender?: boolean;
}

const VisualizationStage = React.memo(function VisualizationStage({ player, layout, runId, hasSteps, selection, fallbackOutput = '', graphRef, staticRender = false }: VisualizationStageProps) {
  const analysisKey = JSON.stringify({
    directed: player.directed,
    nodes: player.graphState.nodes.map(node => ({ id: node.id, label: node.label })),
    edges: player.graphState.edges.map(edge => ({ source: typeof edge.source === 'number' ? edge.source : edge.source.id, target: typeof edge.target === 'number' ? edge.target : edge.target.id, weight: edge.weight })),
  });
  const graphAnalysis = useMemo(() => {
    const topology = JSON.parse(analysisKey) as { directed: boolean; nodes: PlayerState['graphState']['nodes']; edges: PlayerState['graphState']['edges'] };
    return topology.nodes.length && (selection.graph || selection.analysis) ? analyzeGraph(topology.nodes, topology.edges, topology.directed) : null;
  }, [analysisKey, selection.graph, selection.analysis]);
  const flowSummary = useMemo(() => {
    const message = [...player.logs].reverse().find((log) => /Fluxo:\s*\d+,\s*custo:\s*-?\d+/i.test(log));
    const match = message?.match(/Fluxo:\s*(\d+),\s*custo:\s*(-?\d+)/i);
    return match ? { flow: Number(match[1]), cost: Number(match[2]) } : null;
  }, [player.logs]);

  const consoleOutput = player.programConsole.output || (player.totalSteps > 0 && player.currentStepIndex === player.totalSteps - 1 ? fallbackOutput : '');
  const { hasGraph, hasVectors, hasStructs, hasVisualization, hasConsole, hasAnalysis, hasContent, structs: visibleStructs, matrices, calls, references } = selectVisualizationContent({ ...player, programConsole: { ...player.programConsole, output: consoleOutput } }, selection);
  const hasSelection = Object.values(selection).some(Boolean);

  return (
    <PanelInteractionContext.Provider value={!staticRender}>
      {!hasGraph && hasVisualization && player.caption && <ResizablePanel title="Descrição do passo"><div className="frame-caption frame-caption-inline" role="status">{player.caption}</div></ResizablePanel>}
      <div className={`graph-stage ${!hasGraph && hasVisualization ? 'graph-stage-data-only' : ''} ${hasVectors && !hasGraph ? 'graph-stage-vector-only' : ''}`}>
        {hasGraph && (
          <ResizablePanel title="Grafo" className="graph-workspace" fill>
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
          </ResizablePanel>
        )}
        {!hasGraph && hasStructs && <StructsPanel structs={visibleStructs} matrices={matrices} calls={calls} references={references} primary solo={!hasVectors} />}
        {hasVectors && <VectorSortPanel vectors={player.vectors} issues={player.vectorIssues} solo={!hasGraph} />}
        {hasConsole && <ProgramConsole output={consoleOutput} warnings={player.programConsole.warnings} />}
        {!hasContent && (
          <div className="graph-panel">
            <div className="graph-empty-state">
              <Network className="h-8 w-8" />
              {!hasSelection ? (
                <>
                  <strong>Somente o terminal está ativo</strong>
                  <span>Use “Alterar visualizações” para escolher painéis.</span>
                </>
              ) : !hasSteps ? (
                <>
                  <strong>Escolha o que acompanhar</strong>
                  <span>Ao executar, selecione as visualizações desejadas.</span>
                </>
              ) : (
                <>
                  <strong>Nenhum dado dos painéis selecionados neste passo</strong>
                  <span>Avance na linha do tempo ou altere as visualizações.</span>
                </>
              )}
            </div>
          </div>
        )}
        {hasGraph && selection.legend && <ResizablePanel title="Legenda"><GraphLegend /></ResizablePanel>}
        {hasAnalysis && <GraphAnalysisPanel analysis={graphAnalysis} flowSummary={flowSummary} />}
      </div>
      {hasGraph && hasStructs && <StructsPanel structs={visibleStructs} matrices={matrices} calls={calls} references={references} />}
    </PanelInteractionContext.Provider>
  );
}, (previous, next) => previous.layout === next.layout && previous.runId === next.runId && previous.hasSteps === next.hasSteps && previous.selection === next.selection && previous.fallbackOutput === next.fallbackOutput && previous.graphRef === next.graphRef && previous.staticRender === next.staticRender &&
  (!next.fallbackOutput || (previous.player.currentStepIndex === next.player.currentStepIndex && previous.player.totalSteps === next.player.totalSteps)) &&
  (['graphState', 'vectors', 'vectorIssues', 'logs', 'programConsole', 'structs', 'matrices', 'calls', 'references', 'caption', 'directed', 'weighted', 'multi'] as const).every(key => previous.player[key] === next.player[key]));

export default function Home() {
  const { project, status: saveStatus, updateProject } = useStudyProject();
  const [exampleCode, setExampleCode] = useState(examples[0].code);
  const [exampleStdin, setExampleStdin] = useState(examples[0].stdin);
  const [tracePreset, setTracePreset] = useState<TracePreset>('standard');
  const [editorTab, setEditorTab] = useState<'custom' | 'examples'>('custom');
  const code = editorTab === 'custom' ? project.code : exampleCode;
  const stdin = editorTab === 'custom' ? project.stdin : exampleStdin;
  const setCode = (value: string) => editorTab === 'custom' ? updateProject({ code: value }) : setExampleCode(value);
  const setStdin = (value: string) => editorTab === 'custom' ? updateProject({ stdin: value }) : setExampleStdin(value);
  const [projectNotice, setProjectNotice] = useState('');
  const [sampleRun, setSampleRun] = useState<SampleRun | null>(null);
  const [executedCode, setExecutedCode] = useState('');
  const [executedInput, setExecutedInput] = useState('');
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
  const [visualizationSelection, setVisualizationSelection] = useState(DEFAULT_VISUALIZATION_SELECTION);
  const [visualizationPicker, setVisualizationPicker] = useState<{ source: string; input: string; execute: boolean; available?: VisualizationKey[] } | null>(null);
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
  const runControllerRef = useRef<AbortController | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
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
    setExampleCode(example.code);
    setExampleStdin(example.stdin);
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

  const { hasGraph, hasContent } = selectVisualizationContent(player, visualizationSelection);
  const hasVisualization = hasContent || (visualizationSelection.output && !!untracedOutput);

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
        const response = await fetch(runspectApiUrl('/healthz'), {
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
      runControllerRef.current?.abort();
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
      flushSync(() => setRecordingStage({ w: rect.width, h: rect.height, plan, steps, layout, runId, index: 0, selection: visualizationSelection, fallbackOutput: untracedOutput }));
      const result = await recordVisualization({
        plan,
        stop: session.stop.signal,
        dispose: session.dispose.signal,
        onStatus: (status) => { if (activeSession()) setRecording(status); },
        capture: async (step, signals) => {
          throwIfRecordingAborted(signals);
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
      try { link.click(); } catch {} finally { link.remove(); }
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
    const controller = new AbortController();
    runControllerRef.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 120_000);
    player.setIsPlaying(false);
    setSteps([]);
    setUntracedOutput('');
    setIsLoading(true);
    setHasError(false);
    setTraceMode(undefined);
    setSampleRun(null);
    setOutput('Compilando e executando...');
    try {
      const response = await fetch(runspectApiUrl('/api/run'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ code: source, stdin: input, trace_options: { max_steps: TRACE_PRESETS[tracePreset].max_steps, max_items: TRACE_PRESETS[tracePreset].max_items } }),
      });
      const responseText = await response.text();
      let result: Partial<ExecutionResult> & { error?: string };
      try {
        result = JSON.parse(responseText) as Partial<ExecutionResult> & { error?: string };
      } catch {
        throw new Error(
          response.status === 502 || response.status === 504
            ? 'O servidor de execução está indisponível no momento. Aguarde alguns instantes e tente novamente.'
            : `O servidor retornou uma resposta inválida (HTTP ${response.status}).`,
        );
      }
      if (controller.signal.aborted) return;
      setBackendStatus('connected');
      setTraceMode(result.trace_mode);
      setRunId((id) => id + 1);
      if (!response.ok || !result.success) {
        setSteps([]);
        setHasError(true);
        const warnings = result.trace_warnings?.length ? `\n${result.trace_warnings.join('\n')}` : '';
        setOutput(`${result.errors || result.error || `A execução falhou (HTTP ${response.status}).`}${warnings}`);
      } else {
        setExecutedCode(source);
        setExecutedInput(input);
        if (editorTab === 'examples') setSampleRun({ exampleId: selectedExampleId, code: source, stdin: input, output: result.output ?? '' });
        setSteps(result.steps ?? []);
        setUntracedOutput(result.trace_mode === 'manual' ? result.output ?? '' : '');
        const warnings = result.trace_warnings?.length ? `\n${result.trace_warnings.join('\n')}` : '';
        setOutput(`Concluído em ${result.time_ms} ms (análise, compilação e execução).${warnings}`);
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setHasError(timedOut);
        setOutput(timedOut ? 'O servidor demorou mais que o esperado. Tente novamente com uma entrada menor.' : 'Execução cancelada. Seu código foi preservado.');
        return;
      }
      setHasError(true);
      if (error instanceof TypeError) {
        setBackendStatus('disconnected');
        setOutput('Não foi possível conectar ao servidor de execução. Seu código está disponível no editor. Verifique sua conexão e tente novamente em alguns instantes.');
      } else {
        setOutput(error instanceof Error ? error.message : 'Não foi possível executar o código.');
      }
    } finally {
      window.clearTimeout(timeout);
      runControllerRef.current = null;
      runRequestRef.current = false;
      setIsLoading(false);
    }
  };

  const requestRun = (source = code, input = stdin) => {
    if (recordingSessionRef.current || runRequestRef.current) return;
    try {
      validateProgram(source, input);
      if (!source.trim()) throw new Error('Escreva um programa C++ antes de executar.');
    } catch (error) {
      setHasError(true);
      setOutput(error instanceof Error ? error.message : 'Código inválido.');
      return;
    }
    setVisualizationPicker({ source, input, execute: true });
  };

  const loadDocumentationExample = (method: DocumentationMethod, execute: boolean) => {
    updateProject({ code: method.example, stdin: method.stdin ?? '' });
    setEditorTab('custom');
    if (execute) requestRun(method.example, method.stdin ?? '');
    setShowDocumentation(false);
  };

  const importProject = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > MAX_PROJECT_BYTES) throw new Error('O projeto excede 512 KiB.');
      const imported = parseStudyProject(await file.text());
      updateProject(imported);
      setEditorTab('custom');
      setProjectNotice('Projeto aberto. Código, entrada e progresso foram restaurados.');
    } catch (error) { setProjectNotice(error instanceof Error ? error.message : 'Não foi possível abrir o projeto.'); }
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
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" fill="none" className="h-5 w-5">
              <path d="M21 47V17h13a10 10 0 0 1 0 20H21m13 0 11 10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="6" />
              <circle cx="21" cy="17" r="3" fill="#22d3ee" />
              <circle cx="45" cy="47" r="3" fill="#60a5fa" />
            </svg>
          </div>
          <div><p className="brand-name">RUNSPECT</p><p className="brand-subtitle">algorithms lab</p></div>
        </div>
        <div className="topbar-context">
          <span className={`status-dot status-dot-${backendStatus}`} />
          backend {backendStatus === 'connected' ? 'conectado' : backendStatus === 'checking' ? 'verificando...' : 'desconectado'}
          <span className="text-slate-700">•</span> C++17
        </div>
      </header>

      <section className="workspace-heading">
        <div><p className="section-kicker">Laboratório de programação competitiva</p><h1>Entenda cada passo do algoritmo.</h1></div>
        <div className="run-state"><Activity className="h-3.5 w-3.5" /> {isLoading ? 'executando' : 'pronto para executar'}</div>
      </section>

      <WorkspaceSplit>
        <div className="editor-column">
          <div className="editor-header">
            <div className="editor-tabs" role="tablist" aria-label="Fonte do código">
              <button
                className={`editor-tab ${editorTab === 'custom' ? 'editor-tab-active' : ''}`}
                onClick={() => setEditorTab('custom')}
                role="tab"
                aria-selected={editorTab === 'custom'}
              >
                seu código
              </button>
              <button
                className={`editor-tab ${editorTab === 'examples' ? 'editor-tab-active' : ''}`}
                onClick={() => setEditorTab('examples')}
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
                  {visibleExamples.map((ex) => <option key={ex.id} value={ex.id}>{project.completed.includes(ex.id) ? '✓ ' : ''}{ex.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {editorTab === 'examples' && (() => {
            const example = examples.find((item) => item.id === selectedExampleId);
            if (!example) return null;
            return <LearningPanel example={example} code={code} stdin={stdin} sampleRun={sampleRun} completed={project.completed}
              onRestore={() => selectExample(example)}
              onComplete={() => updateProject({ completed: project.completed.includes(example.id) ? project.completed.filter(id => id !== example.id) : [...project.completed, example.id] })}
              onSelect={id => { const next = examples.find(item => item.id === id); if (next) { setExampleCategory('todas'); setExampleQuery(''); selectExample(next); } }} />;
          })()}
          {editorTab === 'custom' && (
            <div className="editor-actions">
              <span className="text-xs text-slate-400">Cole C++17 comum para visualizar a execução.</span>
              <button
                className="convert-button"
                onClick={() => {
                  try {
                    const converted = convertToPureCpp(project.code);
                    downloadFile(new Blob([converted], { type: 'text/x-c++src;charset=utf-8' }), 'solucao.cpp');
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
          <div className="project-actions">
            <span role="status">{saveStatus === 'saving' ? 'Salvando…' : saveStatus === 'unavailable' ? 'Não foi possível salvar neste navegador. Baixe o projeto para guardar suas alterações.' : saveStatus === 'recovered' ? 'Não foi possível recuperar o rascunho salvo.' : editorTab === 'custom' ? 'Código e entrada salvos neste navegador' : 'Baixe o projeto para guardar suas edições do exemplo.'}</span>
            <button type="button" onClick={() => {
              try {
                validateProgram(code, stdin);
                downloadFile(new Blob([serializeStudyProject({ ...project, code, stdin })], { type: 'application/json;charset=utf-8' }), 'runspect-projeto.json');
                setProjectNotice('Projeto baixado com código, entrada e progresso.');
              } catch (error) { setProjectNotice(error instanceof Error ? error.message : 'Não foi possível baixar o projeto.'); }
            }}>Baixar projeto</button>
            <button type="button" onClick={() => importRef.current?.click()} disabled={isLoading || isRecording}>Abrir projeto</button>
            <input ref={importRef} type="file" accept=".json,application/json" hidden aria-label="Arquivo de projeto" onChange={event => { void importProject(event.target.files?.[0]); event.target.value = ''; }} />
            {projectNotice && <p role="status">{projectNotice}</p>}
          </div>
          {steps.length > 0 && (code !== executedCode || stdin !== executedInput) && <p className="execution-notice" role="status">O código ou a entrada mudou. Execute novamente para atualizar a visualização.</p>}
          <div className="code-editor-wrap">
            <CodeEditor
              code={code}
              setCode={setCode}
              onRun={() => requestRun()}
              onCancel={() => runControllerRef.current?.abort()}
              disabled={isRecording}
              isLoading={isLoading}
              output={terminalText}
              hasError={hasError}
              logs={player.logs}
              activeLine={code === executedCode ? player.line : null}
            />
          </div>
          <ResizablePanel title="Entrada (stdin)" defaultCollapsed className="stdin-workspace">
          <div className="stdin-panel">
            <textarea
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              spellCheck={false}
              placeholder="Dados lidos por cin..."
              aria-label="Entrada padrão do programa"
            />
          </div>
          </ResizablePanel>
          <div className="trace-capture-settings"><label htmlFor="trace-capture-limit">Captura da visualização</label><select id="trace-capture-limit" value={tracePreset} disabled={isLoading || isRecording} onChange={event => setTracePreset(event.target.value as TracePreset)}>{Object.entries(TRACE_PRESETS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select><small>Capturas maiores podem levar mais tempo.</small></div>
        </div>

        <div
          ref={visualizerRef}
          data-has-graph={hasGraph}
          className={`visualizer-column ${fullscreen ? 'visualizer-fullscreen' : ''} ${isRecording ? 'visualizer-recording' : ''}`}
        >
          <div className="visualizer-header">
            <button type="button" className="visualization-selection-trigger" aria-label="Alterar visualizações" aria-haspopup="dialog" disabled={isRecording || isLoading} onClick={() => setVisualizationPicker({ source: code, input: stdin, execute: false, available: steps.length ? traceVisualizationKeys(steps, untracedOutput) : undefined })}>
              <SlidersHorizontal size={14} /><span>{visualizationSelectionLabel(visualizationSelection)}</span><small>alterar</small>
            </button>
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
              selection={visualizationSelection}
              fallbackOutput={untracedOutput}
              graphRef={graphRef}
            />
          </div>

          {Object.values(visualizationSelection).some(Boolean) && <ResizablePanel title="Linha do tempo">
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
          </ResizablePanel>}
          {svgSnapshot && <SvgExportDialog snapshot={svgSnapshot} options={svgOptions} onOptionsChange={setSvgOptions} filename={`runspect-grafo-passo-${player.currentStepIndex + 1}.svg`} onClose={() => setSvgSnapshot(null)} />}
        </div>
      </WorkspaceSplit>

      <footer className="workspace-footer">
        <span><Clock3 className="h-3.5 w-3.5" /> passo {player.totalSteps ? player.currentStepIndex + 1 : 0} de {player.totalSteps}</span>
        <span className="footer-divider" />
        <span className="footer-visualization-selection">visualizações: {visualizationSelectionLabel(visualizationSelection)}</span>
        <button className="footer-action" onClick={() => setShowDocumentation(true)} type="button"><CircleHelp className="h-3.5 w-3.5" /> documentação da API</button>
      </footer>
      {showDocumentation && <DocumentationPanel onClose={() => setShowDocumentation(false)} onLoad={loadDocumentationExample} />}
      {visualizationPicker && <VisualizationPicker selection={visualizationSelection} source={visualizationPicker.source} available={visualizationPicker.available} execute={visualizationPicker.execute} onClose={() => setVisualizationPicker(null)} onConfirm={selection => {
        setVisualizationSelection(selection);
        setVisualizationPicker(null);
        if (visualizationPicker.execute) void runCode(visualizationPicker.source, visualizationPicker.input);
      }} />}

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
              selection={recordingStage.selection}
              fallbackOutput={recordingStage.fallbackOutput}
              staticRender
            />
          </div>
        </div>
      )}
    </main>
  );
}
