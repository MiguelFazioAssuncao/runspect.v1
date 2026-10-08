'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CircleHelp, Clock3, Code2, Network } from 'lucide-react';
import { getFontEmbedCSS, toCanvas } from 'html-to-image';
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { DocumentationPanel } from '@/components/DocumentationPanel';
import type { DocumentationMethod } from '@/lib/documentation';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { GraphCanvas } from '@/components/visualizer/GraphCanvas';
import type { GraphLayout, GraphCanvasHandle } from '@/components/visualizer/GraphCanvas';
import { GraphToolbar } from '@/components/visualizer/GraphToolBar';
import { GraphLegend } from '@/components/visualizer/GraphLegend';
import { TimelineControls } from '@/components/visualizer/TimelineControls';
import { StructsPanel } from '@/components/visualizer/StructsPanel';
import { VectorSortPanel } from '@/components/visualizer/VectorSortPanel';
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
    return 0;
}`;

type RecordingPhase = 'idle' | 'recording' | 'finalizing' | 'done' | 'error';
type PlayerState = ReturnType<typeof useVisualizerPlayer>;

const RECORDING_BG = '#070a0f';
const BASE_FRAME_MS = 900;
const SETTLE_MS = 350;
const RECORDING_FPS = 30;
const RECORDING_BITRATE = 6_000_000;
const KEYFRAME_EVERY = RECORDING_FPS * 2;
const END_HOLD_MS = 1000;
const MAX_ENCODE_QUEUE = 8;
const MAX_RECORDING_WIDTH = 1920;
const MAX_RECORDING_HEIGHT = 1080;
const AVC_CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42E028'];
const NO_STEPS: TraceStep[] = [];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const waitForPaint = async () => {
  await nextFrame();
  await nextFrame();
  await sleep(SETTLE_MS);
};
const evenSize = (value: number) => Math.max(2, Math.floor(value / 2) * 2);

type MuxerCodec = 'avc' | 'vp9' | 'av1';

interface EncoderChoice {
  config: VideoEncoderConfig;
  muxerCodec: MuxerCodec;
}

const buildCandidates = (width: number, height: number): EncoderChoice[] => {
  const base = { width, height, bitrate: RECORDING_BITRATE, framerate: RECORDING_FPS };
  const list: EncoderChoice[] = [];
  for (const hardwareAcceleration of ['no-preference', 'prefer-software'] as const) {
    for (const codec of AVC_CODECS) {
      list.push({
        muxerCodec: 'avc',
        config: { ...base, codec, hardwareAcceleration, avc: { format: 'avc' } },
      });
    }
  }
  list.push({ muxerCodec: 'vp9', config: { ...base, codec: 'vp09.00.40.08' } });
  list.push({ muxerCodec: 'av1', config: { ...base, codec: 'av01.0.08M.08' } });
  return list;
};

const probeEncoder = async (config: VideoEncoderConfig, width: number, height: number) => {
  let failed = false;
  let probe: VideoEncoder | null = null;
  try {
    const support = await VideoEncoder.isConfigSupported(config);
    if (!support.supported) return false;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.fillStyle = RECORDING_BG;
    ctx.fillRect(0, 0, width, height);

    probe = new VideoEncoder({
      output: () => undefined,
      error: () => {
        failed = true;
      },
    });
    probe.configure(config);
    const frame = new VideoFrame(canvas, { timestamp: 0 });
    probe.encode(frame, { keyFrame: true });
    frame.close();
    await probe.flush();
    return !failed;
  } catch {
    return false;
  } finally {
    const pending = probe as VideoEncoder | null;
    if (pending && pending.state !== 'closed') {
      try {
        pending.close();
      } catch {
        failed = true;
      }
    }
  }
};

const pickEncoder = async (width: number, height: number) => {
  for (const candidate of buildCandidates(width, height)) {
    if (await probeEncoder(candidate.config, width, height)) return candidate;
  }
  return null;
};

interface VisualizationStageProps {
  player: PlayerState;
  layout: GraphLayout;
  runId: number;
  hasSteps: boolean;
  graphRef?: React.Ref<GraphCanvasHandle>;
}

function VisualizationStage({ player, layout, runId, hasSteps, graphRef }: VisualizationStageProps) {
  const graphAnalysis = useMemo(
    () =>
      player.graphState.nodes.length
        ? analyzeGraph(player.graphState.nodes, player.graphState.edges, player.directed)
        : null,
    [player.graphState.nodes, player.graphState.edges, player.directed],
  );
  const flowSummary = useMemo(() => {
    const message = [...player.logs].reverse().find((log) => /Fluxo:\s*\d+,\s*custo:\s*-?\d+/i.test(log));
    const match = message?.match(/Fluxo:\s*(\d+),\s*custo:\s*(-?\d+)/i);
    return match ? { flow: Number(match[1]), cost: Number(match[2]) } : null;
  }, [player.logs]);

  const hasGraph = player.graphState.nodes.length > 0;
  const hasVectors = player.vectors.length > 0;
  const hasStructs = player.structs.length > 0 || player.matrices.length > 0;
  const hasVisualization = hasGraph || hasVectors || hasStructs;

  return (
    <>
      <div className={`graph-stage ${hasVectors && !hasGraph ? 'graph-stage-vector-only' : ''}`}>
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
        <VectorSortPanel vectors={player.vectors} issues={player.vectorIssues} solo={!hasGraph} />
        {!hasVisualization && (
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
                  <strong>Este algoritmo não possui visualização compatível</strong>
                  <span>A saída do programa continua disponível no terminal.</span>
                </>
              )}
            </div>
          </div>
        )}
        {hasGraph && <GraphLegend />}
      </div>
      <GraphAnalysisPanel analysis={graphAnalysis} flowSummary={flowSummary} />
      <StructsPanel structs={player.structs} matrices={player.matrices} />
    </>
  );
}

export default function Home() {
  const [code, setCode] = useState(DEFAULT_CUSTOM_CODE);
  const [customCode, setCustomCode] = useState(DEFAULT_CUSTOM_CODE);
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
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showDocumentation, setShowDocumentation] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [fullscreen, setFullscreen] = useState(false);
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null);
  const [recording, setRecording] = useState<{ phase: RecordingPhase; message: string }>({
    phase: 'idle',
    message: '',
  });

  const player = useVisualizerPlayer(steps);
  const recPlayer = useVisualizerPlayer(stageSize ? steps : NO_STEPS);

  const graphRef = useRef<GraphCanvasHandle>(null);
  const visualizerRef = useRef<HTMLDivElement>(null);
  const stageAreaRef = useRef<HTMLDivElement>(null);
  const recPlayerRef = useRef<PlayerState>(recPlayer);
  const cancelRecordingRef = useRef(false);

  recPlayerRef.current = recPlayer;

  const isRecording = recording.phase === 'recording' || recording.phase === 'finalizing';

  const categories = useMemo(
    () => ['todas', ...new Set(examples.map((example) => example.category ?? 'Outros'))],
    [],
  );
  const visibleExamples = useMemo(
    () =>
      examples.filter((example) => {
        const matchesQuery = `${example.name} ${example.description ?? ''} ${(example.tags ?? []).join(' ')}`
          .toLocaleLowerCase()
          .includes(exampleQuery.toLocaleLowerCase());
        return matchesQuery && (exampleCategory === 'todas' || (example.category ?? 'Outros') === exampleCategory);
      }),
    [exampleCategory, exampleQuery],
  );

  const hasGraph = player.graphState.nodes.length > 0;
  const hasVectors = player.vectors.length > 0;
  const hasStructs = player.structs.length > 0 || player.matrices.length > 0;
  const hasVisualization = hasGraph || hasVectors || hasStructs;

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
    if (recording.phase !== 'done') return;
    const timer = window.setTimeout(() => setRecording({ phase: 'idle', message: '' }), 6000);
    return () => window.clearTimeout(timer);
  }, [recording.phase]);

  useEffect(() => {
    return () => {
      cancelRecordingRef.current = true;
    };
  }, []);

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
    cancelRecordingRef.current = true;
  };

  const startRecording = async () => {
    if (isRecording) return;
    const fail = (message: string) => setRecording({ phase: 'error', message });

    if (steps.length === 0 || player.totalSteps === 0 || !hasVisualization) {
      fail('Execute um algoritmo antes de gravar a visualização.');
      return;
    }
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
      fail('Seu navegador não suporta gravação em MP4 (WebCodecs). Use Chrome, Edge ou Safari atualizados.');
      return;
    }

    const total = player.totalSteps;
    const frameMs = BASE_FRAME_MS / Math.max(0.25, player.speed);
    const framesPerStep = Math.max(1, Math.round((frameMs / 1000) * RECORDING_FPS));
    const screenW = window.screen.width || window.innerWidth;
    const screenH = window.screen.height || window.innerHeight;
    const ratio = Math.min(1, MAX_RECORDING_WIDTH / screenW, MAX_RECORDING_HEIGHT / screenH);
    const width = evenSize(screenW * ratio);
    const height = evenSize(screenH * ratio);

    cancelRecordingRef.current = false;
    player.setIsPlaying(false);
    setRecording({ phase: 'recording', message: 'Preparando gravação…' });
    setStageSize({ w: width, h: height });

    let encoder: VideoEncoder | null = null;
    let encoderError: Error | null = null;
    let renderError: string | null = null;
    let frameIndex = 0;

    try {
      await waitForPaint();
      const area = stageAreaRef.current;
      if (!area) {
        fail('Não foi possível preparar a área de gravação.');
        return;
      }

      setRecording({ phase: 'recording', message: 'Verificando encoder de vídeo…' });
      const choice = await pickEncoder(width, height);
      if (!choice) {
        fail('Nenhum encoder de vídeo compatível foi encontrado neste navegador. Use Chrome ou Edge.');
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        fail('Não foi possível criar o canvas de gravação.');
        return;
      }
      ctx.fillStyle = RECORDING_BG;
      ctx.fillRect(0, 0, width, height);

      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: { codec: choice.muxerCodec, width, height, frameRate: RECORDING_FPS },
        fastStart: 'in-memory',
      });

      const activeEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => {
          encoderError = e;
        },
      });
      encoder = activeEncoder;
      activeEncoder.configure(choice.config);

      const pushFrame = async () => {
        const frame = new VideoFrame(canvas, {
          timestamp: Math.round((frameIndex * 1_000_000) / RECORDING_FPS),
          duration: Math.round(1_000_000 / RECORDING_FPS),
        });
        activeEncoder.encode(frame, { keyFrame: frameIndex % KEYFRAME_EVERY === 0 });
        frame.close();
        frameIndex++;
        while (activeEncoder.encodeQueueSize > MAX_ENCODE_QUEUE && !encoderError) await sleep(5);
      };

      let fontEmbedCSS: string | undefined;
      try {
        fontEmbedCSS = await getFontEmbedCSS(area);
      } catch {
        fontEmbedCSS = undefined;
      }
      const options = { pixelRatio: 1, backgroundColor: RECORDING_BG, cacheBust: false, fontEmbedCSS };

      recPlayerRef.current.seek(0);
      await waitForPaint();

      for (let i = 0; i < total; i++) {
        if (cancelRecordingRef.current || encoderError) break;
        setRecording({ phase: 'recording', message: `Gravando… passo ${i + 1} de ${total}` });

        if (i > 0) {
          recPlayerRef.current.seek(i);
          await waitForPaint();
        }

        let rendered: HTMLCanvasElement;
        try {
          if (i === 0) await toCanvas(area, options);
          rendered = await toCanvas(area, options);
        } catch (error) {
          renderError = `Erro ao renderizar o passo ${i + 1}: ${error instanceof Error ? error.message : 'falha desconhecida'}`;
          break;
        }

        ctx.fillStyle = RECORDING_BG;
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(rendered, 0, 0, width, height);

        for (let k = 0; k < framesPerStep; k++) await pushFrame();
      }

      if (frameIndex > 0 && !renderError && !encoderError) {
        const holdFrames = Math.round((END_HOLD_MS / 1000) * RECORDING_FPS);
        for (let k = 0; k < holdFrames; k++) await pushFrame();
      }

      setRecording({ phase: 'finalizing', message: 'Finalizando vídeo…' });
      if (!encoderError) await activeEncoder.flush();
      if (activeEncoder.state !== 'closed') activeEncoder.close();

      if (encoderError) {
        fail(`Falha no encoder: ${(encoderError as Error).message}`);
        return;
      }
      if (renderError) {
        fail(renderError);
        return;
      }
      if (frameIndex === 0) {
        fail('Nenhum frame foi gravado.');
        return;
      }

      muxer.finalize();
      const blob = new Blob([target.buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `runspect-visualizacao-${Date.now()}.mp4`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);

      const codecNotice =
        choice.muxerCodec === 'avc'
          ? ''
          : ` Codec ${choice.muxerCodec.toUpperCase()} usado (H.264 indisponível); algumas redes sociais podem não aceitar. Use Chrome ou Edge para H.264.`;
      setRecording({
        phase: 'done',
        message:
          (cancelRecordingRef.current
            ? 'Gravação interrompida. Arquivo parcial baixado (MP4).'
            : 'Gravação concluída. Download do MP4 iniciado.') + codecNotice,
      });
    } catch (error) {
      setRecording({
        phase: 'error',
        message: `Falha na gravação: ${error instanceof Error ? error.message : 'erro desconhecido'}`,
      });
    } finally {
      const pending = encoder as VideoEncoder | null;
      if (pending && pending.state !== 'closed') pending.close();
      cancelRecordingRef.current = false;
      setStageSize(null);
    }
  };

  const runCode = async (source = code, input = stdin) => {
    if (isRecording) return;
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
      setSteps(result.steps ?? []);
      setRunId((id) => id + 1);
      if (!response.ok || !result.success) {
        setHasError(true);
        setOutput(result.errors || result.error || `A execução falhou (HTTP ${response.status}).`);
      } else {
        setOutput(`${result.output ? `${result.output}\n` : ''}Executado em ${result.time_ms} ms.`);
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
              <div className="example-controls">
                <input className="example-search" value={exampleQuery} onChange={(e) => setExampleQuery(e.target.value)} placeholder="buscar exemplo..." aria-label="Buscar exemplos" />
                <select className="example-select" value={exampleCategory} onChange={(e) => setExampleCategory(e.target.value)} aria-label="Filtrar exemplos por categoria">
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
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
              output={output}
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
          className={`visualizer-column ${fullscreen ? 'visualizer-fullscreen' : ''} ${isRecording ? 'visualizer-recording' : ''}`}
        >
          <div className="visualizer-header">
            <div className="panel-label"><Network className="h-3.5 w-3.5" /> visualização</div>
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
              canRecord={steps.length > 0 && hasVisualization}
              isRecording={isRecording}
              onStartRecording={() => void startRecording()}
              onStopRecording={stopRecording}
            />
          </div>

          {recording.phase !== 'idle' && (
            <div className={`recording-status recording-status-${recording.phase}`} role="status">
              {recording.phase === 'recording' && <span className="recording-dot" />}
              {recording.message}
            </div>
          )}

          <div className="recording-area">
            <VisualizationStage
              player={player}
              layout={layout}
              runId={runId}
              hasSteps={steps.length > 0}
              graphRef={graphRef}
            />
          </div>

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
        <span>visualizações: vetores · grafos · estruturas</span>
        <button className="footer-action" onClick={() => setShowDocumentation(true)} type="button"><CircleHelp className="h-3.5 w-3.5" /> documentação da API</button>
      </footer>
      {showDocumentation && <DocumentationPanel onClose={() => setShowDocumentation(false)} onLoad={loadDocumentationExample} />}

      {stageSize && (
        <div
          aria-hidden="true"
          className="visualizer-column visualizer-fullscreen"
          style={{
            position: 'fixed',
            inset: 'auto',
            left: -100000,
            top: 0,
            width: stageSize.w,
            height: stageSize.h,
            padding: 0,
            gap: 0,
            zIndex: -1,
            pointerEvents: 'none',
          }}
        >
          <div
            ref={stageAreaRef}
            className="recording-area"
            style={{ padding: '16px 24px 20px', background: RECORDING_BG }}
          >
            <VisualizationStage
              player={recPlayer}
              layout={layout}
              runId={runId}
              hasSteps={steps.length > 0}
            />
          </div>
        </div>
      )}
    </main>
  );
}