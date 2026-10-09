import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

export const RECORDING_BG = '#070a0f';
export const RECORDING_FPS = 30;
export const MAX_RECORDING_SECONDS = 120;
export const MAX_ENCODED_BYTES = 96 << 20;
const MAX_QUEUE = 8;
const OPERATION_TIMEOUT = 15_000;

export interface RecordingPlan {
  width: number;
  height: number;
  steps: number;
  // Reference units at 30 fps; output uses variable-duration samples.
  framesPerStep: number;
  totalFrames: number;
  durationMs: number;
  speed: number;
}
export type RecordingPhase = 'idle' | 'preparing' | 'recording' | 'finalizing' | 'done' | 'error';
export interface RecordingStatus {
  phase: RecordingPhase;
  message: string;
  // Completed output samples, rather than submitted encoder input or elapsed video time.
  progress?: number;
}
export interface RecordingMetrics {
  prepareMs: number;
  captureMs: number;
  encodeMs: number;
  flushMs: number;
  exportMs: number;
  totalMs: number;
  captures: number;
  samples: number;
  encodedBytes: number;
}
export class RecordingStopped extends Error {
  constructor() { super('Gravação interrompida.'); this.name = 'RecordingStopped'; }
}
export function createRecordingPlan(steps: number, speed: number, width: number, height: number, pixelRatio = 1): RecordingPlan {
  if (!Number.isInteger(steps) || steps < 1 || !Number.isFinite(speed) || speed <= 0) throw new Error('Não há passos válidos para gravar.');
  if (![width, height, pixelRatio].every(value => Number.isFinite(value) && value > 0)) throw new Error('A área de gravação tem dimensões inválidas.');
  const scale = Math.min(pixelRatio, 2, 1920 / width, 1080 / height);
  const even = (value: number) => Math.max(2, Math.floor(value / 2) * 2);
  const framesPerStep = RECORDING_FPS / speed;
  const totalFrames = steps * framesPerStep + RECORDING_FPS;
  const durationMs = (steps / speed + 1) * 1000;
  if (durationMs > MAX_RECORDING_SECONDS * 1000) throw new Error(`O vídeo teria ${Math.ceil(durationMs / 1000)} s. O limite é ${MAX_RECORDING_SECONDS} s; aumente a velocidade ou reduza os passos.`);
  return { width: even(width * scale), height: even(height * scale), steps, speed, framesPerStep, totalFrames, durationMs };
}
export function frameTiming(index: number, count = 1) {
  const timestamp = Math.round(index * 1_000_000 / RECORDING_FPS);
  return { timestamp, duration: Math.round((index + count) * 1_000_000 / RECORDING_FPS) - timestamp };
}
export function stepTiming(plan: RecordingPlan, step: number) {
  const timestamp = Math.round(step * 1_000_000 / plan.speed);
  return { timestamp, duration: Math.round((step + 1) * 1_000_000 / plan.speed) - timestamp };
}
export function boundedOperation<T>(operation: Promise<T>, timeoutMs: number, signals: AbortSignal[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => { clearTimeout(timer); signals.forEach(signal => signal.removeEventListener('abort', abort)); };
    const finish = (action: () => void) => { if (settled) return; settled = true; cleanup(); action(); };
    const abort = () => { const signal = signals.find(item => item.aborted); if (signal) finish(() => reject(signal.reason ?? new Error('Gravação cancelada.'))); };
    const timer = setTimeout(() => finish(() => reject(new Error('A gravação excedeu o tempo de espera de uma operação.'))), timeoutMs);
    signals.forEach(signal => signal.addEventListener('abort', abort, { once: true }));
    operation.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
    abort();
  });
}
export function throwIfRecordingAborted(signals: AbortSignal[]) {
  const signal = signals.find(item => item.aborted);
  if (signal) throw signal.reason ?? new Error('Gravação cancelada.');
}
// Yield to input events without keeping a timer alive after cancellation.
async function yieldToInput(signals: AbortSignal[]) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await boundedOperation(new Promise<void>(resolve => { timer = setTimeout(resolve, 0); }), OPERATION_TIMEOUT, signals); }
  finally { clearTimeout(timer); }
}

// Retained for callers that need a browser paint; recording uses an explicit React commit.
export async function waitForCapturePaint(signals: AbortSignal[]) {
  let frame = 0;
  try {
    for (let i = 0; i < 2; i++) {
      throwIfRecordingAborted(signals);
      await boundedOperation(new Promise<void>(resolve => { frame = requestAnimationFrame(() => resolve()); }), OPERATION_TIMEOUT, signals);
    }
  } finally { cancelAnimationFrame(frame); }
}
type MuxerCodec = 'avc' | 'vp9' | 'av1';
interface EncoderChoice { config: VideoEncoderConfig; codec: MuxerCodec }
function encoderCandidates(plan: RecordingPlan): EncoderChoice[] {
  const base = {
    width: plan.width, height: plan.height, framerate: Math.min(RECORDING_FPS, plan.speed),
    bitrate: Math.max(2_000_000, Math.round(6_000_000 * plan.width * plan.height / (1920 * 1080))),
    latencyMode: 'realtime' as const,
  };
  const candidates: EncoderChoice[] = [];
  for (const hardwareAcceleration of ['no-preference', 'prefer-software'] as const) {
    for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42E028']) candidates.push({ codec: 'avc', config: { ...base, codec, hardwareAcceleration, avc: { format: 'avc' } } });
  }
  candidates.push({ codec: 'vp9', config: { ...base, codec: 'vp09.00.40.08' } });
  candidates.push({ codec: 'av1', config: { ...base, codec: 'av01.0.08M.08' } });
  return candidates;
}
function closeEncoder(encoder: VideoEncoder | null) {
  if (encoder && encoder.state !== 'closed') { try { encoder.close(); } catch { /* Preserve original failure. */ } }
}
async function pickEncoder(plan: RecordingPlan, canvas: HTMLCanvasElement, signals: AbortSignal[]): Promise<EncoderChoice> {
  for (const choice of encoderCandidates(plan)) {
    throwIfRecordingAborted(signals);
    let probe: VideoEncoder | null = null;
    let emitted = false;
    let failed = false;
    try {
      const support = await boundedOperation(VideoEncoder.isConfigSupported(choice.config), 2000, signals);
      if (!support.supported) continue;
      probe = new VideoEncoder({ output: () => { emitted = true; }, error: () => { failed = true; } });
      probe.configure(choice.config);
      const frame = new VideoFrame(canvas, frameTiming(0));
      try { probe.encode(frame, { keyFrame: true }); } finally { frame.close(); }
      await boundedOperation(probe.flush(), 3000, signals);
      if (emitted && !failed) return choice;
    } catch { throwIfRecordingAborted(signals); }
    finally { closeEncoder(probe); }
  }
  throw new Error('Nenhum encoder de vídeo compatível foi encontrado neste navegador.');
}
export async function waitForEncoderCapacity(encoder: VideoEncoder, signals: AbortSignal[]) {
  throwIfRecordingAborted(signals);
  if (encoder.encodeQueueSize < MAX_QUEUE) return;
  let onDequeue = () => {};
  const drained = new Promise<void>(resolve => {
    onDequeue = () => { if (encoder.encodeQueueSize < MAX_QUEUE) resolve(); };
    encoder.addEventListener('dequeue', onDequeue); onDequeue();
  });
  try { await boundedOperation(drained, OPERATION_TIMEOUT, signals); }
  finally { encoder.removeEventListener('dequeue', onDequeue); }
}
interface RecordingOptions {
  plan: RecordingPlan;
  capture: (step: number, signals: AbortSignal[]) => Promise<HTMLCanvasElement>;
  stop: AbortSignal;
  dispose: AbortSignal;
  onStatus: (status: RecordingStatus) => void;
}
export interface RecordingResult { blob: Blob; codec: MuxerCodec; partial: boolean; frames: number; metrics: RecordingMetrics }
export async function recordVisualization({ plan, capture, stop, dispose, onStatus }: RecordingOptions): Promise<RecordingResult | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') throw new Error('Seu navegador não suporta gravação em MP4 (WebCodecs).');
  for (const stage of ['prepare', 'capture', 'render', 'serialize', 'encode', 'flush', 'export', 'total']) performance.clearMeasures(`recording:${stage}`);
  const totalStart = performance.now();
  const metrics: RecordingMetrics = { prepareMs: 0, captureMs: 0, encodeMs: 0, flushMs: 0, exportMs: 0, totalMs: 0, captures: 0, samples: 0, encodedBytes: 0 };
  const measure = (stage: 'prepare' | 'capture' | 'encode' | 'flush' | 'export', start: number) => {
    metrics[`${stage}Ms`] += performance.now() - start;
    performance.measure(`recording:${stage}`, { start });
  };
  const failure = new AbortController();
  const captureSignals = [dispose, failure.signal, stop];
  const flushSignals = [dispose, failure.signal];
  let encoder: VideoEncoder | null = null;
  let frames = 0;
  let completed = 0;
  let finalizing = false;
  let expectedSamples = plan.steps + 2;
  let lastKeyTimestamp = -Infinity;
  // Some encoders omit the input duration in output chunks. Keep authoritative timing until output arrives.
  const timings = new Map<number, number>();
  const canvas = document.createElement('canvas');
  const release = (bitmap: HTMLCanvasElement) => { bitmap.width = 0; bitmap.height = 0; };
  try {
    canvas.width = plan.width; canvas.height = plan.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível criar o canvas de gravação.');
    ctx.fillStyle = RECORDING_BG; ctx.fillRect(0, 0, plan.width, plan.height);
    let choice: EncoderChoice;
    try {
      onStatus({ phase: 'preparing', message: 'Verificando encoder de vídeo…' });
      const start = performance.now();
      choice = await pickEncoder(plan, canvas, captureSignals); measure('prepare', start);
    } catch (error) {
      throwIfRecordingAborted([dispose]);
      if (error instanceof RecordingStopped) return null;
      throw error;
    }
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({ target, video: { codec: choice.codec, width: plan.width, height: plan.height }, fastStart: { expectedVideoChunks: plan.steps + 2 } });
    const report = () => onStatus({
      phase: finalizing ? 'finalizing' : 'recording',
      message: finalizing ? `Finalizando vídeo… ${completed} de ${frames} quadros codificados` : `Processando… ${metrics.captures} de ${plan.steps} passos; ${completed} quadros codificados`,
      // 100% belongs to the successfully exported Blob. Finalization has no predictable duration.
      progress: completed / (expectedSamples + 1),
    });
    const activeEncoder = new VideoEncoder({
      output: (chunk, metadata) => {
        if (failure.signal.aborted || dispose.aborted) return;
        try {
          metrics.encodedBytes += chunk.byteLength;
          if (metrics.encodedBytes > MAX_ENCODED_BYTES) throw new Error('O vídeo excedeu o limite de 96 MiB. Reduza os passos ou aumente a velocidade.');
          const duration = timings.get(chunk.timestamp);
          if (duration === undefined) throw new Error('O encoder retornou um quadro com timestamp inválido.');
          const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
          muxer.addVideoChunkRaw(data, chunk.type, chunk.timestamp, duration, metadata);
          timings.delete(chunk.timestamp); completed++; report();
        } catch (error) { failure.abort(error); }
      }, error: error => failure.abort(error),
    });
    encoder = activeEncoder; activeEncoder.configure(choice.config);
    const pushFrame = async (timing: ReturnType<typeof frameTiming>, signals = captureSignals) => {
      const start = performance.now();
      await waitForEncoderCapacity(activeEncoder, signals); throwIfRecordingAborted(signals);
      const frame = new VideoFrame(canvas, timing);
      try {
        const keyFrame = timing.timestamp - lastKeyTimestamp >= 2_000_000;
        timings.set(timing.timestamp, timing.duration);
        activeEncoder.encode(frame, { keyFrame });
        if (keyFrame) lastKeyTimestamp = timing.timestamp;
        frames++;
      } finally { frame.close(); measure('encode', start); }
    };
    try {
      for (let step = 0; step < plan.steps; step++) {
        throwIfRecordingAborted(captureSignals); report();
        const start = performance.now();
        let awaitingCapture = true;
        const pendingCapture = capture(step, captureSignals).then(bitmap => {
          if (!awaitingCapture || captureSignals.some(signal => signal.aborted)) release(bitmap);
          return bitmap;
        });
        let rendered: HTMLCanvasElement;
        try { rendered = await boundedOperation(pendingCapture, OPERATION_TIMEOUT, captureSignals); }
        finally { awaitingCapture = false; measure('capture', start); }
        try {
          throwIfRecordingAborted(captureSignals);
          if (!rendered.width || !rendered.height) throw new Error('A captura retornou um quadro vazio.');
          ctx.fillStyle = RECORDING_BG; ctx.fillRect(0, 0, plan.width, plan.height);
          ctx.drawImage(rendered, 0, 0, plan.width, plan.height); metrics.captures++;
        } finally { release(rendered); }
        await pushFrame(stepTiming(plan, step));
        await yieldToInput(captureSignals);
      }
      throwIfRecordingAborted(captureSignals);
      finalizing = true; report();
      // mp4-muxer derives its final stts delta from the preceding timestamp gap.
      // Two equal half-second holds preserve the full final second in all players.
      // Treat the pair as finalization, so Stop cannot leave half a hold behind.
      const end = Math.round(plan.steps * 1_000_000 / plan.speed);
      await pushFrame({ timestamp: end, duration: 500_000 }, flushSignals);
      await pushFrame({ timestamp: end + 500_000, duration: 500_000 }, flushSignals);
    } catch (error) {
      throwIfRecordingAborted(flushSignals);
      if (!(error instanceof RecordingStopped)) throw error;
      expectedSamples = frames;
    }
    if (frames === 0) return null;
    finalizing = true; report();
    const flushStart = performance.now();
    await boundedOperation(activeEncoder.flush(), OPERATION_TIMEOUT, flushSignals); measure('flush', flushStart);
    throwIfRecordingAborted(flushSignals);
    if (completed !== frames || timings.size) throw new Error('O encoder não concluiu todos os quadros do vídeo.');
    const exportStart = performance.now();
    muxer.finalize();
    const blob = new Blob([target.buffer], { type: 'video/mp4' }); measure('export', exportStart);
    metrics.samples = frames; metrics.totalMs = performance.now() - totalStart;
    return { blob, codec: choice.codec, partial: stop.aborted, frames, metrics };
  } finally {
    performance.measure('recording:total', { start: totalStart });
    failure.abort(new Error('A sessão de gravação foi encerrada.'));
    closeEncoder(encoder); timings.clear(); release(canvas);
  }
}
