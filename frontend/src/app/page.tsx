'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CircleHelp, Clock3, Network, SlidersHorizontal } from 'lucide-react';
import { LearningPanel } from '@/components/LearningPanel';
import { StudyPaths } from '@/components/StudyPaths';
import type { SampleRun } from '@/components/LearningPanel';
import { useStudyProject } from '@/hooks/useStudyProject';
import { CATEGORY_EN, EXAMPLE_EN, localizedVisualizationSelectionLabel, useLocale } from '@/lib/i18n';
import { MAX_PROJECT_BYTES, normalizeSearch, parseStudyProject, serializeStudyProject, validateProgram } from '@/lib/studyProject';
import type { ProgramDraft } from '@/lib/studyProject';
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
import { DEFAULT_VISUALIZATION_SELECTION, selectVisualizationContent, traceVisualizationKeys } from '@/lib/visualizationSelection';
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
    const en = EXAMPLE_EN[example.id];
    const catEn = CATEGORY_EN[example.category ?? 'Outros'] ?? '';
    const searchable = normalizeSearch(`${example.name} ${example.description} ${en?.name ?? ''} ${en?.description ?? ''} ${catEn} ${example.tags.join(' ')}`);
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
  const { tr } = useLocale();
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

  const consoleOutput = player.programConsole.output || (player.totalSteps === 0 || player.currentStepIndex === player.totalSteps - 1 ? fallbackOutput : '');
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
                  <strong>{tr('Somente o terminal está ativo', 'Terminal only')}</strong>
                  <span>{tr('Use “Alterar visualizações” para escolher painéis.', 'Use "Change panels" to enable visualizers.')}</span>
                </>
              ) : !hasSteps ? (
                <>
                  <strong>{tr('Escolha o que acompanhar', 'Nothing running yet')}</strong>
                  <span>{tr('Ao executar, selecione as visualizações desejadas.', 'Run a C++17 program and select the panels to inspect.')}</span>
                </>
              ) : (
                <>
                  <strong>{tr('Nenhum dado dos painéis selecionados neste passo', 'No data for the selected panels at this step')}</strong>
                  <span>{tr('Avance na linha do tempo ou altere as visualizações.', 'Step forward on the timeline or change active panels.')}</span>
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
  const { locale, setLocale, isEn, tr } = useLocale();
  const { project, status: saveStatus, error: saveError, updateProject } = useStudyProject();
  const [selectedExampleId, setSelectedExampleId] = useState(examples[0].id);
  const selectedExample = examples.find(example => example.id === selectedExampleId) ?? examples[0];
  const exampleDraft = project.exampleDrafts?.[selectedExampleId] ?? selectedExample;
  const [tracePreset, setTracePreset] = useState<TracePreset>('standard');
  const [editorTab, setEditorTab] = useState<'custom' | 'examples'>('custom');
  const code = editorTab === 'custom' ? project.code : exampleDraft.code;
  const stdin = editorTab === 'custom' ? project.stdin : exampleDraft.stdin;
  const editExample = (update: Partial<ProgramDraft>) => {
    const draft = { code: exampleDraft.code, stdin: exampleDraft.stdin, ...update };
    const exampleDrafts = { ...project.exampleDrafts };
    if (draft.code === selectedExample.code && draft.stdin === selectedExample.stdin) delete exampleDrafts[selectedExampleId];
    else exampleDrafts[selectedExampleId] = draft;
    updateProject({ exampleDrafts });
  };
  const setCode = (value: string) => editorTab === 'custom' ? updateProject({ code: value }) : editExample({ code: value });
  const setStdin = (value: string) => editorTab === 'custom' ? updateProject({ stdin: value }) : editExample({ stdin: value });
  const [projectNotice, setProjectNotice] = useState('');
  const [sampleRun, setSampleRun] = useState<SampleRun | null>(null);
  const [executedCode, setExecutedCode] = useState('');
  const [executedInput, setExecutedInput] = useState('');
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
  };

  const openExample = (id: string) => {
    const example = examples.find(item => item.id === id);
    if (!example) return;
    setExampleCategory('todas');
    setExampleQuery('');
    setEditorTab('examples');
    selectExample(example);
  };

  const restoreExample = () => {
    const exampleDrafts = { ...project.exampleDrafts };
    delete exampleDrafts[selectedExampleId];
    updateProject({ exampleDrafts });
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
  const rawTerminalText = isLoading || hasError || steps.length === 0
    ? output
    : terminalOutput(player.programConsole.output || (playbackCompleted ? untracedOutput : ''), output, playbackCompleted);
  const terminalText = isEn && rawTerminalText === 'Aguardando uma execução...' ? 'Waiting for execution...' : rawTerminalText;

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
      setTraceMode(result.trace_mode);
      setRunId((id) => id + 1);
      const capturedSteps = result.steps ?? [];
      const warnings = result.trace_warnings?.length ? `\n${result.trace_warnings.join('\n')}` : '';
      setExecutedCode(source);
      setExecutedInput(input);
      setSteps(capturedSteps);
      setUntracedOutput(result.trace_mode === 'manual' ? result.output ?? '' : '');
      if (!response.ok || !result.success) {
        setHasError(true);
        setOutput(terminalOutput(result.output ?? '', `${result.errors || result.error || tr(`A execução falhou (HTTP ${response.status}).`, `Execution failed (HTTP ${response.status}).`)}${warnings}`, true));
      } else {
        if (editorTab === 'examples') setSampleRun({ exampleId: selectedExampleId, code: source, stdin: input, output: result.output ?? '' });
        const status = tr(`Concluído em ${result.time_ms} ms (análise, compilação e execução).${warnings}`, `Completed in ${result.time_ms} ms (analysis, compilation, and execution).${warnings}`);
        setOutput(capturedSteps.length ? status : terminalOutput(result.output ?? '', status, true));
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setHasError(timedOut);
        setOutput(timedOut ? tr('O servidor demorou mais que o esperado. Tente novamente com uma entrada menor.', 'The server took longer than expected. Try again with a smaller input.') : tr('Execução cancelada. Seu código foi preservado.', 'Execution cancelled. Your code was preserved.'));
        return;
      }
      setHasError(true);
      if (error instanceof TypeError) {
        setOutput(tr('Não foi possível conectar ao servidor de execução. Seu código está disponível no editor. Verifique sua conexão e tente novamente em alguns instantes.', 'Could not connect to the execution server. Your code is still saved in the editor. Check your connection and try again.'));
      } else {
        setOutput(error instanceof Error ? error.message : tr('Não foi possível executar o código.', 'Could not execute the code.'));
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
      updateProject({ ...imported, exampleDrafts: imported.exampleDrafts ?? {} });
      setEditorTab('custom');
      setProjectNotice('Projeto aberto. Código, entrada, rascunhos e progresso foram restaurados.');
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
        <div className="topbar-brand">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
              <path d="M6 8l4 4-4 4M12 16h6" stroke="currentColor" strokeLinecap="square" strokeWidth="2.2" />
            </svg>
          </div>
          <span className="brand-name">runspect</span>
          <span className="topbar-sep" aria-hidden="true">/</span>
          <span className="topbar-tag">c++17</span>
        </div>
        <div className="locale-switch" role="group" aria-label={tr('Idioma', 'Language')}>
          <button
            type="button"
            className={`locale-btn ${locale === 'pt' ? 'locale-btn-active' : ''}`}
            aria-pressed={locale === 'pt'}
            onClick={() => setLocale('pt')}
          >
            PT
          </button>
          <button
            type="button"
            className={`locale-btn ${locale === 'en' ? 'locale-btn-active' : ''}`}
            aria-pressed={locale === 'en'}
            onClick={() => setLocale('en')}
          >
            EN
          </button>
        </div>
      </header>

      <WorkspaceSplit>
        <div className="editor-column">
          <div className="editor-header">
            <div className="editor-tabs" role="tablist" aria-label={tr('Fonte do código', 'Code source')} onKeyDown={event => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const tab = event.key === 'Home' ? 'custom' : event.key === 'End' ? 'examples' : editorTab === 'custom' ? 'examples' : 'custom';
              setEditorTab(tab);
              event.currentTarget.querySelector<HTMLButtonElement>(`#source-tab-${tab}`)?.focus();
            }}>
              <button
                className={`editor-tab ${editorTab === 'custom' ? 'editor-tab-active' : ''}`}
                onClick={() => setEditorTab('custom')}
                role="tab"
                id="source-tab-custom"
                aria-controls="source-workspace"
                tabIndex={editorTab === 'custom' ? 0 : -1}
                aria-selected={editorTab === 'custom'}
              >
                {tr('seu código', 'your code')}
              </button>
              <button
                className={`editor-tab ${editorTab === 'examples' ? 'editor-tab-active' : ''}`}
                onClick={() => setEditorTab('examples')}
                role="tab"
                id="source-tab-examples"
                aria-controls="source-workspace"
                tabIndex={editorTab === 'examples' ? 0 : -1}
                aria-selected={editorTab === 'examples'}
              >
                {tr('técnicas', 'techniques')}
              </button>
            </div>
            {editorTab === 'examples' && (
              <div className="example-controls">
                <input className="example-search" value={exampleQuery} onChange={(e) => changeExampleQuery(e.target.value)} placeholder={tr('buscar exemplo...', 'search technique...')} aria-label={tr('Buscar exemplos', 'Search techniques')} />
                <select className="example-select" value={exampleCategory} onChange={(e) => changeExampleCategory(e.target.value)} aria-label={tr('Filtrar exemplos por categoria', 'Filter techniques by category')}>
                  {categories.map((category) => <option key={category} value={category}>{isEn ? CATEGORY_EN[category] ?? category : category}</option>)}
                </select>
                <select
                  className="example-select"
                  value={visibleExamples.some((ex) => ex.id === selectedExampleId) ? selectedExampleId : ''}
                  onChange={(e) => {
                    const ex = examples.find((x) => x.id === e.target.value);
                    if (ex) selectExample(ex);
                  }}
                  aria-label={tr('Selecionar técnica de programação competitiva', 'Select competitive programming technique')}
                >
                  {visibleExamples.length === 0 && <option value="">{tr('nenhuma técnica encontrada', 'no matching techniques')}</option>}
                  {visibleExamples.map((ex) => <option key={ex.id} value={ex.id}>{project.completed.includes(ex.id) ? '✓ ' : ''}{isEn ? EXAMPLE_EN[ex.id]?.name ?? ex.name : ex.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div id="source-workspace" role="tabpanel" aria-labelledby={`source-tab-${editorTab}`} className="editor-tab-panel">
          <StudyPaths completed={project.completed} onSelect={openExample} />
          {editorTab === 'examples' && visibleExamples.length === 0 && <div className="example-empty" role="status">
            <span>{tr('Nenhuma técnica corresponde aos filtros.', 'No techniques match the active filters.')}</span>
            <button type="button" onClick={() => { setExampleQuery(''); setExampleCategory('todas'); }}>{tr('Limpar filtros', 'Clear filters')}</button>
          </div>}
          {editorTab === 'examples' && (() => {
            const example = examples.find((item) => item.id === selectedExampleId);
            if (!example) return null;
            return <LearningPanel example={example} code={code} stdin={stdin} sampleRun={sampleRun} completed={project.completed}
              onRestore={restoreExample}
              onComplete={() => updateProject({ completed: project.completed.includes(example.id) ? project.completed.filter(id => id !== example.id) : [...project.completed, example.id] })}
              onSelect={openExample} />;
          })()}
          {editorTab === 'custom' && (
            <div className="editor-actions">
              <span className="editor-actions-hint">{tr('Cole C++17 comum para visualizar a execução.', 'Paste standard C++17 code to trace execution.')}</span>
              <button
                className="convert-button"
                onClick={() => {
                  try {
                    const converted = convertToPureCpp(project.code);
                    downloadFile(new Blob([converted], { type: 'text/x-c++src;charset=utf-8' }), 'solucao.cpp');
                    setConversionNotice(tr('Arquivo solucao.cpp baixado com C++ puro.', 'Downloaded solucao.cpp with plain C++17.'));
                  } catch (error) {
                    setConversionNotice(error instanceof Error ? error.message : tr('Falha na conversão.', 'Conversion failed.'));
                  }
                  window.setTimeout(() => setConversionNotice(''), 3500);
                }}
                type="button"
              >
                {tr('baixar C++ puro', 'download plain C++')}
              </button>
              {conversionNotice && <span className="conversion-notice" role="status">{conversionNotice}</span>}
            </div>
          )}
          <div className="project-actions">
            <span role="status">{saveStatus === 'saving' ? tr('Salvando…', 'Saving…') : saveStatus === 'unavailable' ? saveError ? `${tr('Não foi possível salvar.', 'Could not save.')} ${saveError}` : tr('Não foi possível salvar neste navegador. Baixe o projeto para guardar suas alterações.', 'Local storage unavailable. Download the project to keep your changes.') : saveStatus === 'recovered' ? tr('Não foi possível recuperar o rascunho salvo.', 'Could not recover saved draft.') : editorTab === 'custom' ? tr('Código e entrada salvos neste navegador', 'Code and input saved in this browser') : tr('Rascunhos das técnicas salvos neste navegador', 'Technique drafts saved in this browser')}</span>
            <button type="button" onClick={() => {
              try {
                validateProgram(code, stdin);
                downloadFile(new Blob([serializeStudyProject({ ...project, code, stdin })], { type: 'application/json;charset=utf-8' }), 'runspect-projeto.json');
                setProjectNotice(tr('Projeto baixado com código, entrada, rascunhos e progresso.', 'Project downloaded with code, input, drafts, and progress.'));
              } catch (error) { setProjectNotice(error instanceof Error ? error.message : tr('Não foi possível baixar o projeto.', 'Could not download project.')); }
            }}>{tr('Baixar projeto', 'Download project')}</button>
            <button type="button" onClick={() => importRef.current?.click()} disabled={isLoading || isRecording}>{tr('Abrir projeto', 'Open project')}</button>
            <input ref={importRef} type="file" accept=".json,application/json" hidden aria-label={tr('Arquivo de projeto', 'Project file')} onChange={event => { void importProject(event.target.files?.[0]); event.target.value = ''; }} />
            {projectNotice && <p role="status">{projectNotice}</p>}
          </div>
          {steps.length > 0 && (code !== executedCode || stdin !== executedInput) && <p className="execution-notice" role="status">{tr('O código ou a entrada mudou. Execute novamente para atualizar a visualização.', 'Code or input changed. Run again to refresh the trace.')}</p>}
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
              placeholder={tr('Dados lidos por cin...', 'Input read by cin...')}
              aria-label={tr('Entrada padrão do programa', 'Standard input (stdin)')}
            />
          </div>
          </ResizablePanel>
          <div className="trace-capture-settings"><label htmlFor="trace-capture-limit">{tr('Captura da visualização', 'Trace capture limit')}</label><select id="trace-capture-limit" value={tracePreset} disabled={isLoading || isRecording} onChange={event => setTracePreset(event.target.value as TracePreset)}>{Object.entries(TRACE_PRESETS).map(([key, value]) => <option key={key} value={key}>{isEn ? value.label.replace('Padrão', 'Standard').replace('Detalhada', 'Detailed').replace('Completa', 'Full').replace('passos', 'steps') : value.label}</option>)}</select><small>{tr('Capturas maiores podem levar mais tempo.', 'Higher limits may increase run time.')}</small></div>
          </div>
        </div>

        <div
          ref={visualizerRef}
          data-has-graph={hasGraph}
          className={`visualizer-column ${fullscreen ? 'visualizer-fullscreen' : ''} ${isRecording ? 'visualizer-recording' : ''}`}
        >
          <div className="visualizer-header">
            <button type="button" className="visualization-selection-trigger" aria-label={tr('Alterar visualizações', 'Change panels')} aria-haspopup="dialog" disabled={isRecording || isLoading} onClick={() => setVisualizationPicker({ source: code, input: stdin, execute: false, available: steps.length ? traceVisualizationKeys(steps, untracedOutput) : undefined })}>
              <SlidersHorizontal size={14} /><span>{localizedVisualizationSelectionLabel(visualizationSelection, locale)}</span><small>{tr('alterar', 'change')}</small>
            </button>
            {traceMode === 'automatic' && <span className="trace-mode-badge">{tr('automática', 'auto')}</span>}
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
              {recording.progress !== undefined && isRecording && <progress value={recording.progress} max={1} aria-label={tr('Progresso da gravação', 'Recording progress')} />}
              {recordingDownload && <a className="toolbar-button" href={recordingDownload.url} download={recordingDownload.filename}>{tr('Baixar MP4', 'Download MP4')}</a>}
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
        <span><Clock3 className="h-3.5 w-3.5" /> {tr('passo', 'step')} {player.totalSteps ? player.currentStepIndex + 1 : 0} {tr('de', 'of')} {player.totalSteps}</span>
        <span className="footer-divider" />
        <span className="footer-visualization-selection">{tr('visualizações', 'panels')}: {localizedVisualizationSelectionLabel(visualizationSelection, locale)}</span>
        <button className="footer-action" onClick={() => setShowDocumentation(true)} type="button"><CircleHelp className="h-3.5 w-3.5" /> {tr('documentação da API', 'API reference')}</button>
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
