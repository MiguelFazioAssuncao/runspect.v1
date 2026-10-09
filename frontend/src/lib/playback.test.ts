import { describe, expect, it, vi } from 'vitest';
import { startPlayback } from './playback';

function player(speed: number, totalSteps = 2000) {
  let index = 0;
  let time = 0;
  let nextId = 0;
  const pending = new Map<number, FrameRequestCallback>();
  const onIndex = vi.fn((value: number) => { index = value; });
  const onFinish = vi.fn();
  const stop = startPlayback({ speed, totalSteps, getIndex: () => index, onIndex, onFinish }, {
    now: () => time,
    request: (callback) => { pending.set(++nextId, callback); return nextId; },
    cancel: (id) => { pending.delete(id); },
  });
  return {
    index: () => index, seek: (value: number) => { index = value; },
    onIndex, onFinish, stop, pending,
    tick: (value: number) => {
      time = value;
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => callback(time));
    },
  };
}

describe('reprodução por tempo decorrido', () => {
  it('mantém a duração em telas lentas e avança vários passos por renderização', () => {
    const playback = player(128);
    playback.tick(16);
    expect(playback.index()).toBe(2);
    playback.tick(33);
    expect(playback.index()).toBe(4);
    playback.tick(1000);
    expect(playback.index()).toBe(128);
    expect(playback.onIndex).toHaveBeenCalledTimes(3);
  });

  it('preserva frações de tempo em velocidades baixas', () => {
    const playback = player(0.5);
    playback.tick(500); playback.tick(1500);
    expect(playback.index()).toBe(0);
    playback.tick(2000);
    expect(playback.index()).toBe(1);
    playback.tick(4000);
    expect(playback.index()).toBe(2);
  });

  it.each([32, 64, 128])('conclui 2000 passos a %d× sem ultrapassar o último', (speed) => {
    const playback = player(speed);
    playback.tick(2000 * 1000 / speed);
    expect(playback.index()).toBe(1999);
    expect(playback.onFinish).toHaveBeenCalledOnce();
    expect(playback.pending.size).toBe(0);
    playback.tick(1_000_000);
    expect(playback.onFinish).toHaveBeenCalledOnce();
  });

  it('continua a partir da posição escolhida na linha do tempo', () => {
    const playback = player(8);
    playback.tick(1000);
    playback.seek(100);
    playback.tick(1250);
    expect(playback.index()).toBe(102);
    playback.seek(5);
    playback.tick(1500);
    expect(playback.index()).toBe(7);
  });

  it('pausar cancela o quadro pendente e ignora callbacks tardios', () => {
    const playback = player(128);
    const callback = [...playback.pending.values()][0];
    playback.stop();
    expect(playback.pending.size).toBe(0);
    callback(1000);
    expect(playback.onIndex).not.toHaveBeenCalled();
    expect(playback.onFinish).not.toHaveBeenCalled();
  });
});
