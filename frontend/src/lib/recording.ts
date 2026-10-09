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
  framesPerStep: number;
  totalFrames: number;
  durationMs: number;
}

export type RecordingPhase = 'idle' | 'preparing' | 'recording' | 'finalizing' | 'done' | 'error';
export interface RecordingStatus {
  phase: RecordingPhase;
  message: string;
  progress?: number;
}

export class RecordingStopped extends Error {
  constructor() {
    super('Gravação interrompida.');
    this.name = 'RecordingStopped';
  }
}

export function createRecordingPlan(steps: number, speed: number, width: number, height: number, pixelRatio = 1): RecordingPlan {
  if (!Number.isInteger(steps) || steps < 1 || !Number.isFinite(speed) || speed <= 0) {
    throw new Error('Não há passos válidos para gravar.');
  }
  if (![width, height, pixelRatio].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('A área de gravação tem dimensões inválidas.');
  }
  const scale = Math.min(pixelRatio, 2, 1920 / width, 1080 / height);
  const even = (value: number) => Math.max(2, Math.floor(value / 2) * 2);
  const framesPerStep = Math.max(1, Math.round(RECORDING_FPS / speed));
  const totalFrames = steps * framesPerStep + RECORDING_FPS;
  const durationMs = totalFrames * 1000 / RECORDING_FPS;
  if (durationMs > MAX_RECORDING_SECONDS * 1000) {
    throw new Error(`O vídeo teria ${Math.ceil(durationMs / 1000)} s. O limite é ${MAX_RECORDING_SECONDS} s; aumente a velocidade ou reduza os passos.`);
  }
  return { width: even(width * scale), height: even(height * scale), steps, framesPerStep, totalFrames, durationMs };
}

export function frameTiming(index: number) {
  const timestamp = Math.round(index * 1_000_000 / RECORDING_FPS);
  return { timestamp, duration: Math.round((index + 1) * 1_000_000 / RECORDING_FPS) - timestamp };
}

export function boundedOperation<T>(operation: Promise<T>, timeoutMs: number, signals: AbortSignal[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signals.forEach((signal) => signal.removeEventListener('abort', abort));
    };
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      action();
    };
    const abort = () => {
      const signal = signals.find((item) => item.aborted);
      if (signal) finish(() => reject(signal.reason ?? new Error('Gravação cancelada.')));
    };
    const timer = setTimeout(() => finish(() => reject(new Error('A gravação excedeu o tempo de espera de uma operação.'))), timeoutMs);
    signals.forEach((signal) => signal.addEventListener('abort', abort, { once: true }));
    // Attach handlers even when already aborted, so late rejections are consumed.
    operation.then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)));
    abort();
  });
}

function throwIfAborted(signals: AbortSignal[]) {
  const signal = signals.find((item) => item.aborted);
  if (signal) throw signal.reason ?? new Error('Gravação cancelada.');
}

export async function waitForCapturePaint(signals: AbortSignal[]) {
  let frame = 0;
  try {
    for (let i = 0; i < 2; i++) {
      throwIfAborted(signals);
      await boundedOperation(new Promise<void>((resolve) => {
        frame = requestAnimationFrame(() => resolve());
      }), OPERATION_TIMEOUT, signals);
    }
  } finally {
    cancelAnimationFrame(frame);
  }
}

type MuxerCodec = 'avc' | 'vp9' | 'av1';
interface EncoderChoice { config: VideoEncoderConfig; codec: MuxerCodec }

function encoderCandidates(plan: RecordingPlan): EncoderChoice[] {
  const base = {
    width: plan.width, height: plan.height, framerate: RECORDING_FPS,
    bitrate: Math.max(2_000_000, Math.round(6_000_000 * plan.width * plan.height / (1920 * 1080))),
    latencyMode: 'realtime' as const,
  };
  const candidates: EncoderChoice[] = [];
  for (const hardwareAcceleration of ['no-preference', 'prefer-software'] as const) {
    for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42E028']) {
      candidates.push({ codec: 'avc', config: { ...base, codec, hardwareAcceleration, avc: { format: 'avc' } } });
    }
  }
  candidates.push({ codec: 'vp9', config: { ...base, codec: 'vp09.00.40.08' } });
  candidates.push({ codec: 'av1', config: { ...base, codec: 'av01.0.08M.08' } });
  return candidates;
}

function closeEncoder(encoder: VideoEncoder | null) {
  if (encoder && encoder.state !== 'closed') {
    try { encoder.close(); } catch { /* Cleanup must not mask the original failure. */ }
  }
}

async function pickEncoder(plan: RecordingPlan, canvas: HTMLCanvasElement, signals: AbortSignal[]): Promise<EncoderChoice> {
  for (const choice of encoderCandidates(plan)) {
    throwIfAborted(signals);
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
    } catch {
      throwIfAborted(signals);
    } finally {
      closeEncoder(probe);
    }
  }
  throw new Error('Nenhum encoder de vídeo compatível foi encontrado neste navegador.');
}

export async function waitForEncoderCapacity(encoder: VideoEncoder, signals: AbortSignal[]) {
  throwIfAborted(signals);
  if (encoder.encodeQueueSize < MAX_QUEUE) return;
  let onDequeue = () => {};
  const drained = new Promise<void>((resolve) => {
    onDequeue = () => { if (encoder.encodeQueueSize < MAX_QUEUE) resolve(); };
    encoder.addEventListener('dequeue', onDequeue);
    onDequeue();
  });
  try {
    await boundedOperation(drained, OPERATION_TIMEOUT, signals);
  } finally {
    encoder.removeEventListener('dequeue', onDequeue);
  }
}

interface RecordingOptions {
  plan: RecordingPlan;
  capture: (step: number, signals: AbortSignal[]) => Promise<HTMLCanvasElement>;
  stop: AbortSignal;
  dispose: AbortSignal;
  onStatus: (status: RecordingStatus) => void;
}

export interface RecordingResult { blob: Blob; codec: MuxerCodec; partial: boolean; frames: number }

export async function recordVisualization({ plan, capture, stop, dispose, onStatus }: RecordingOptions): Promise<RecordingResult | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error('Seu navegador não suporta gravação em MP4 (WebCodecs).');
  }
  const failure = new AbortController();
  const captureSignals = [dispose, failure.signal, stop];
  const flushSignals = [dispose, failure.signal];
  let encoder: VideoEncoder | null = null;
  let frames = 0;
  let encodedBytes = 0;
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível criar o canvas de gravação.');
  ctx.fillStyle = RECORDING_BG;
  ctx.fillRect(0, 0, plan.width, plan.height);

  try {
    let choice: EncoderChoice;
    try {
      onStatus({ phase: 'preparing', message: 'Verificando encoder de vídeo…' });
      choice = await pickEncoder(plan, canvas, captureSignals);
    } catch (error) {
      throwIfAborted([dispose]);
      if (error instanceof RecordingStopped) return null;
      throw error;
    }
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: choice.codec, width: plan.width, height: plan.height, frameRate: RECORDING_FPS },
      // Reserve metadata space instead of retaining a second copy of all chunks.
      fastStart: { expectedVideoChunks: plan.totalFrames },
    });
    const activeEncoder = new VideoEncoder({
      output: (chunk, metadata) => {
        if (failure.signal.aborted || dispose.aborted) return;
        try {
          encodedBytes += chunk.byteLength;
          if (encodedBytes > MAX_ENCODED_BYTES) throw new Error('O vídeo excedeu o limite de 96 MiB. Reduza os passos ou aumente a velocidade.');
          muxer.addVideoChunk(chunk, metadata);
        } catch (error) {
          failure.abort(error);
        }
      },
      error: (error) => failure.abort(error),
    });
    encoder = activeEncoder;
    activeEncoder.configure(choice.config);

    const pushFrame = async () => {
      await waitForEncoderCapacity(activeEncoder, captureSignals);
      throwIfAborted(captureSignals);
      const frame = new VideoFrame(canvas, frameTiming(frames));
      try {
        activeEncoder.encode(frame, { keyFrame: frames % (RECORDING_FPS * 2) === 0 });
        frames++;
      } finally {
        frame.close();
      }
    };

    try {
      for (let step = 0; step < plan.steps; step++) {
        throwIfAborted(captureSignals);
        onStatus({ phase: 'recording', message: `Gravando… passo ${step + 1} de ${plan.steps}`, progress: step / plan.steps });
        let awaitingCapture = true;
        const pendingCapture = capture(step, captureSignals).then((bitmap) => {
          // DOM capture may finish after its wait was cancelled or timed out.
          if (!awaitingCapture || captureSignals.some((signal) => signal.aborted)) {
            bitmap.width = 0;
            bitmap.height = 0;
          }
          return bitmap;
        });
        let rendered: HTMLCanvasElement;
        try {
          rendered = await boundedOperation(pendingCapture, OPERATION_TIMEOUT, captureSignals);
        } finally {
          awaitingCapture = false;
        }
        try {
          throwIfAborted(captureSignals);
          ctx.fillStyle = RECORDING_BG;
          ctx.fillRect(0, 0, plan.width, plan.height);
          ctx.drawImage(rendered, 0, 0, plan.width, plan.height);
        } finally {
          // The capture callback transfers ownership of its temporary bitmap.
          rendered.width = 0;
          rendered.height = 0;
        }
        for (let i = 0; i < plan.framesPerStep; i++) await pushFrame();
        // Yield between steps even with a synchronous software encoder.
        await boundedOperation(new Promise<void>((resolve) => setTimeout(resolve, 25)), OPERATION_TIMEOUT, captureSignals);
      }
      for (let i = 0; i < RECORDING_FPS; i++) await pushFrame();
    } catch (error) {
      throwIfAborted(flushSignals);
      if (!(error instanceof RecordingStopped)) throw error;
    }

    if (frames === 0) return null;
    onStatus({ phase: 'finalizing', message: 'Finalizando vídeo…', progress: 1 });
    await boundedOperation(activeEncoder.flush(), OPERATION_TIMEOUT, flushSignals);
    throwIfAborted(flushSignals);
    muxer.finalize();
    return { blob: new Blob([target.buffer], { type: 'video/mp4' }), codec: choice.codec, partial: stop.aborted, frames };
  } finally {
    failure.abort(new Error('A sessão de gravação foi encerrada.'));
    closeEncoder(encoder);
    canvas.width = 0;
    canvas.height = 0;
  }
}
