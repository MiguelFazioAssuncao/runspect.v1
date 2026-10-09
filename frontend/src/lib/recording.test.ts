import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  boundedOperation, createRecordingPlan, frameTiming, MAX_ENCODED_BYTES,
  recordVisualization, RecordingStopped, stepTiming, waitForEncoderCapacity,
} from './recording';

const muxers = vi.hoisted(() => ({ timings: [] as { timestamp: number; duration: number }[], options: [] as { fastStart: { expectedVideoChunks: number } }[], finalized: 0, chunks: 0 }));
vi.mock('mp4-muxer', () => ({
  ArrayBufferTarget: class { buffer = new ArrayBuffer(16); },
  Muxer: class {
    constructor(options: { fastStart: { expectedVideoChunks: number } }) { muxers.options.push(options); }
    addVideoChunkRaw(_data: Uint8Array, _type: string, timestamp: number, duration: number) { muxers.chunks++; muxers.timings.push({ timestamp, duration }); }
    finalize() { muxers.finalized++; }
  },
}));

class FakeFrame {
  static instances: FakeFrame[] = [];
  closed = false;
  constructor(readonly canvas: HTMLCanvasElement, readonly timing: VideoFrameInit) { FakeFrame.instances.push(this); }
  close() { this.closed = true; }
}

class FakeEncoder extends EventTarget {
  static instances: FakeEncoder[] = [];
  static mainEncode: ((encoder: FakeEncoder) => void) | null = null;
  static hangFlush = false;
  static unsupported = false;
  static isConfigSupported = async (config: VideoEncoderConfig) => ({ supported: !FakeEncoder.unsupported, config });
  state = 'unconfigured';
  encodeQueueSize = 0;
  frames = 0;
  readonly main: boolean;
  constructor(readonly callbacks: VideoEncoderInit) {
    super();
    this.main = FakeEncoder.instances.length === 1;
    FakeEncoder.instances.push(this);
  }
  configure() { this.state = 'configured'; }
  encode(frame: FakeFrame) {
    this.frames++;
    if (this.main) FakeEncoder.mainEncode?.(this);
    this.callbacks.output({ byteLength: 10, timestamp: frame.timing.timestamp, duration: frame.timing.duration, type: 'key', copyTo() {} } as unknown as EncodedVideoChunk, {});
  }
  flush() { return this.main && FakeEncoder.hangFlush ? new Promise<void>(() => {}) : Promise.resolve(); }
  close() { this.state = 'closed'; }
}

const canvas = () => ({ width: 100, height: 100, getContext: () => ({ fillStyle: '', fillRect() {}, drawImage() {} }) }) as unknown as HTMLCanvasElement;
function options() {
  const stop = new AbortController();
  const dispose = new AbortController();
  return {
    stopController: stop, disposeController: dispose,
    plan: createRecordingPlan(2, 4, 1280, 720),
    capture: vi.fn<(step: number, signals: AbortSignal[]) => Promise<HTMLCanvasElement>>(async () => canvas()),
    stop: stop.signal, dispose: dispose.signal,
    onStatus: vi.fn(),
  };
}

beforeEach(() => {
  muxers.options = [];
  muxers.timings = [];
  muxers.finalized = 0;
  muxers.chunks = 0;
  FakeEncoder.instances = [];
  FakeEncoder.mainEncode = null;
  FakeEncoder.hangFlush = false;
  FakeEncoder.unsupported = false;
  FakeFrame.instances = [];
  vi.stubGlobal('VideoEncoder', FakeEncoder);
  vi.stubGlobal('VideoFrame', FakeFrame);
  vi.stubGlobal('document', { createElement: () => canvas() });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('plano de gravação', () => {
  it('preserva proporções, limita a resolução e aceita dimensões pares', () => {
    const plan = createRecordingPlan(1, 1, 2560, 1440, 2);
    expect([plan.width, plan.height]).toEqual([1920, 1080]);
    const retina = createRecordingPlan(1, 1, 640, 360, 2);
    expect([retina.width, retina.height]).toEqual([1280, 720]);
    const portrait = createRecordingPlan(1, 1, 393, 851, 2);
    expect(portrait.width % 2).toBe(0);
    expect(portrait.height).toBeLessThanOrEqual(1080);
    expect(portrait.width / portrait.height).toBeCloseTo(393 / 851, 2);
  });

  it('usa a velocidade do player e um segundo de pausa final', () => {
    expect(createRecordingPlan(2, 1, 640, 360).durationMs).toBe(3000);
    expect(createRecordingPlan(2, 2, 640, 360).durationMs).toBe(2000);
  });

  it('rejeita vídeos longos antes de alocar encoders', () => {
    expect(() => createRecordingPlan(120, 1, 640, 360)).toThrow('limite');
    expect(FakeEncoder.instances).toHaveLength(0);
  });

  it('rejeita dimensões e tempos inválidos', () => {
    expect(() => createRecordingPlan(0, 1, 100, 100)).toThrow();
    expect(() => createRecordingPlan(1, NaN, 100, 100)).toThrow();
    expect(() => createRecordingPlan(1, 1, 0, 100)).toThrow();
  });

  it('mantém timestamps contínuos e duração exata sem arredondamento acumulado', () => {
    for (let index = 0; index < 3600; index++) {
      const frame = frameTiming(index);
      expect(frame.timestamp + frame.duration).toBe(frameTiming(index + 1).timestamp);
    }
    expect(frameTiming(30).timestamp).toBe(1_000_000);
  });
});

describe('esperas e fila do encoder', () => {
  it('interrompe uma operação que nunca resolve', async () => {
    vi.useFakeTimers();
    const result = boundedOperation(new Promise<void>(() => {}), 100);
    const assertion = expect(result).rejects.toThrow('tempo de espera');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it('cancela imediatamente e consome rejeições tardias', async () => {
    const controller = new AbortController();
    let rejectLate: (error: Error) => void = () => {};
    const operation = new Promise<void>((_, reject) => { rejectLate = reject; });
    const result = boundedOperation(operation, 1000, [controller.signal]);
    controller.abort(new RecordingStopped());
    await expect(result).rejects.toBeInstanceOf(RecordingStopped);
    rejectLate(new Error('tardia'));
    await Promise.resolve();
  });

  it('aguarda dequeue e remove o listener ao liberar a fila', async () => {
    const encoder = new FakeEncoder({ output() {}, error() {} });
    encoder.encodeQueueSize = 8;
    const remove = vi.spyOn(encoder, 'removeEventListener');
    const result = waitForEncoderCapacity(encoder as unknown as VideoEncoder, []);
    encoder.encodeQueueSize = 7;
    encoder.dispatchEvent(new Event('dequeue'));
    await result;
    expect(remove).toHaveBeenCalledWith('dequeue', expect.any(Function));
  });
});

describe('exportação MP4', () => {
  it('captura cada passo uma vez e fecha todos os frames e encoders', async () => {
    const input = options();
    const result = await recordVisualization(input);
    expect(input.capture.mock.calls.map(([step]) => step)).toEqual([0, 1]);
    expect(result?.blob.type).toBe('video/mp4');
    expect(result?.partial).toBe(false);
    expect(result?.frames).toBe(input.plan.steps + 2);
    expect(FakeFrame.instances.every((frame) => frame.closed)).toBe(true);
    expect(FakeEncoder.instances.every((encoder) => encoder.state === 'closed')).toBe(true);
    expect(muxers.options[0].fastStart.expectedVideoChunks).toBe(input.plan.steps + 2);
    expect(muxers.finalized).toBe(1);
  });

  it('preserva um arquivo parcial sem adicionar pausa após Parar', async () => {
    const input = options();
    FakeEncoder.mainEncode = (encoder) => { if (encoder.frames === 1) input.stopController.abort(new RecordingStopped()); };
    const result = await recordVisualization(input);
    expect(result?.partial).toBe(true);
    expect(result?.frames).toBe(1);
    expect(muxers.finalized).toBe(1);
  });

  it('Parar durante a preparação não produz arquivo nem erro', async () => {
    const input = options();
    input.stopController.abort(new RecordingStopped());
    expect(await recordVisualization(input)).toBeNull();
    expect(muxers.finalized).toBe(0);
  });

  it('sair da página durante captura cancela e fecha o encoder', async () => {
    const input = options();
    const bitmap = canvas();
    input.capture.mockImplementation(async () => {
      input.disposeController.abort(new Error('página fechada'));
      return bitmap;
    });
    await expect(recordVisualization(input)).rejects.toThrow('página fechada');
    expect([bitmap.width, bitmap.height]).toEqual([0, 0]);
    expect(muxers.finalized).toBe(0);
    expect(FakeEncoder.instances.every((encoder) => encoder.state === 'closed')).toBe(true);
  });

  it('libera um bitmap que termina de capturar após o cancelamento', async () => {
    const input = options();
    let finishCapture: (bitmap: HTMLCanvasElement) => void = () => {};
    let started: () => void = () => {};
    const capturing = new Promise<void>((resolve) => { started = resolve; });
    input.capture.mockImplementation(() => new Promise((resolve) => {
      finishCapture = resolve;
      started();
    }));
    const recording = recordVisualization(input);
    await capturing;
    input.disposeController.abort(new Error('página fechada'));
    await expect(recording).rejects.toThrow('página fechada');
    const bitmap = canvas();
    finishCapture(bitmap);
    await Promise.resolve();
    expect([bitmap.width, bitmap.height]).toEqual([0, 0]);
    expect(muxers.finalized).toBe(0);
  });

  it('fecha o VideoFrame mesmo quando encode lança uma exceção', async () => {
    FakeEncoder.mainEncode = () => { throw new Error('encode falhou'); };
    await expect(recordVisualization(options())).rejects.toThrow('encode falhou');
    expect(FakeFrame.instances.every((frame) => frame.closed)).toBe(true);
    expect(FakeEncoder.instances.every((encoder) => encoder.state === 'closed')).toBe(true);
  });

  it('não finaliza nem oferece arquivo após falha de captura', async () => {
    const input = options();
    input.capture.mockImplementation(async () => { throw new Error('captura falhou'); });
    await expect(recordVisualization(input)).rejects.toThrow('captura falhou');
    expect(muxers.finalized).toBe(0);
  });

  it('interrompe flush travado e libera recursos', async () => {
    vi.useFakeTimers();
    FakeEncoder.hangFlush = true;
    const assertion = expect(recordVisualization(options())).rejects.toThrow('tempo de espera');
    await vi.runAllTimersAsync();
    await assertion;
    expect(FakeEncoder.instances.every((encoder) => encoder.state === 'closed')).toBe(true);
    expect(muxers.finalized).toBe(0);
  });

  it('trata falta de WebCodecs sem criar um encoder', async () => {
    vi.stubGlobal('VideoEncoder', undefined);
    await expect(recordVisualization(options())).rejects.toThrow('WebCodecs');
    expect(FakeEncoder.instances).toHaveLength(0);
  });

  it('limita os dados codificados antes de repassar um chunk ao muxer', async () => {
    FakeEncoder.mainEncode = (encoder) => {
      encoder.callbacks.output({ byteLength: MAX_ENCODED_BYTES + 1 } as EncodedVideoChunk, {});
    };
    await expect(recordVisualization(options())).rejects.toThrow('96 MiB');
    expect(muxers.chunks).toBe(0);
    expect(muxers.finalized).toBe(0);
  });
});


describe('temporização e progresso reais', () => {
  it.each([0.5, 1, 2, 4, 8, 32, 128])('mantém todos os passos a %sx sem arredondamento por passo', async speed => {
    const input = options();
    input.plan = createRecordingPlan(7, speed, 640, 360);
    const result = await recordVisualization(input);
    expect(muxers.timings).toHaveLength(9);
    muxers.timings.slice(0, 7).forEach((timing, index) => expect(timing).toEqual(stepTiming(input.plan, index)));
    for (let index = 1; index < muxers.timings.length; index++) {
      const previous = muxers.timings[index - 1];
      expect(muxers.timings[index].timestamp).toBe(previous.timestamp + previous.duration);
    }
    const last = muxers.timings.at(-1)!;
    expect(last.timestamp + last.duration).toBe(Math.round((7 / speed + 1) * 1_000_000));
    expect(result?.metrics.captures).toBe(7);
    expect(result?.metrics.samples).toBe(9);
  });

  it('não anuncia 100% antes de flush e exportação', async () => {
    const input = options();
    await recordVisualization(input);
    const statuses = input.onStatus.mock.calls.map(([status]) => status);
    expect(statuses.some(status => status.phase === 'finalizing')).toBe(true);
    expect(statuses.every(status => status.progress === undefined || status.progress < 1)).toBe(true);
  });

  it('descarta flush pendente e permite outra sessão após cancelar a finalização', async () => {
    const input = options();
    FakeEncoder.hangFlush = true;
    input.onStatus.mockImplementation(status => {
      if (status.phase === 'finalizing') input.disposeController.abort(new RecordingStopped());
    });
    await expect(recordVisualization(input)).rejects.toBeInstanceOf(RecordingStopped);
    expect(muxers.finalized).toBe(0);
    expect(FakeEncoder.instances.every(encoder => encoder.state === 'closed')).toBe(true);
    FakeEncoder.instances = [];
    FakeEncoder.hangFlush = false;
    expect((await recordVisualization(options()))?.blob.size).toBeGreaterThan(0);
  });

  it('rejeita capturas vazias e ainda libera o canvas', async () => {
    const input = options(); const bitmap = canvas(); bitmap.width = 0;
    input.capture.mockResolvedValue(bitmap);
    await expect(recordVisualization(input)).rejects.toThrow('quadro vazio');
    expect(bitmap.height).toBe(0);
    expect(muxers.finalized).toBe(0);
  });

  it('não finaliza quando flush perde um quadro', async () => {
    const original = FakeEncoder.prototype.encode;
    const spy = vi.spyOn(FakeEncoder.prototype, 'encode').mockImplementation(function (this: FakeEncoder, frame: FakeFrame) {
      if (this.main && this.frames === 0) { this.frames++; return; }
      original.call(this, frame);
    });
    try { await expect(recordVisualization(options())).rejects.toThrow('não concluiu'); }
    finally { spy.mockRestore(); }
    expect(muxers.finalized).toBe(0);
  });
});

describe('falhas e limpeza de esperas', () => {
  it('rejeita codecs indisponíveis e permite iniciar novamente', async () => {
    FakeEncoder.unsupported = true;
    await expect(recordVisualization(options())).rejects.toThrow('Nenhum encoder');
    FakeEncoder.unsupported = false;
    expect((await recordVisualization(options()))?.frames).toBe(4);
  });
  it('libera o listener de dequeue ao cancelar uma fila saturada', async () => {
    const encoder = new FakeEncoder({output() {},error() {}}); encoder.encodeQueueSize = 8;
    const dispose = new AbortController(); const remove = vi.spyOn(encoder,'removeEventListener');
    const waiting = waitForEncoderCapacity(encoder as unknown as VideoEncoder,[dispose.signal]);
    dispose.abort(new RecordingStopped());
    await expect(waiting).rejects.toBeInstanceOf(RecordingStopped);
    expect(remove).toHaveBeenCalledWith('dequeue',expect.any(Function));
  });
  it('limita captura travada, fecha recursos e libera resultados tardios', async () => {
    vi.useFakeTimers();
    const input = options(); let finish: (bitmap: HTMLCanvasElement) => void = () => {};
    input.capture.mockImplementation(() => new Promise(resolve => {finish = resolve;}));
    const assertion = expect(recordVisualization(input)).rejects.toThrow('tempo de espera');
    await vi.runAllTimersAsync(); await assertion;
    const bitmap = canvas(); finish(bitmap); await Promise.resolve();
    expect([bitmap.width,bitmap.height]).toEqual([0,0]);
    expect(FakeEncoder.instances.every(encoder => encoder.state === 'closed')).toBe(true);
    expect(muxers.finalized).toBe(0);
  });
});

it('mantém o progresso monotônico quando os chunks chegam só no flush', async () => {
  const pending: FakeFrame[] = [];
  const originalEncode = FakeEncoder.prototype.encode;
  const originalFlush = FakeEncoder.prototype.flush;
  const encode = vi.spyOn(FakeEncoder.prototype,'encode').mockImplementation(function(this: FakeEncoder, frame: FakeFrame) {
    if(this.main) {this.frames++;pending.push(frame);} else originalEncode.call(this,frame);
  });
  const flush = vi.spyOn(FakeEncoder.prototype,'flush').mockImplementation(function(this: FakeEncoder) {
    if(this.main) for(const frame of pending) this.callbacks.output({byteLength:10,timestamp:frame.timing.timestamp,type:'key',copyTo() {}} as unknown as EncodedVideoChunk,{});
    return originalFlush.call(this);
  });
  const input = options();
  try {await recordVisualization(input);} finally {encode.mockRestore();flush.mockRestore();}
  const progress = input.onStatus.mock.calls.map(([status])=>status.progress).filter(value=>value!==undefined);
  for(let index=1;index<progress.length;index++) expect(progress[index]).toBeGreaterThanOrEqual(progress[index-1]);
  expect(progress.every(value=>value<1)).toBe(true);
});
