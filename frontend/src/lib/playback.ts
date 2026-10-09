export const PLAYBACK_SPEEDS = [0.5, 1, 2, 4, 8, 16, 32, 64, 128] as const;

interface PlaybackClock {
  now: () => number;
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
}

interface PlaybackOptions {
  speed: number;
  totalSteps: number;
  getIndex: () => number;
  onIndex: (index: number) => void;
  onFinish: () => void;
}

// Advance by elapsed time, rather than adding rendering latency to every step.
// The replay reducers still apply all intermediate events when frames are skipped.
export function startPlayback(options: PlaybackOptions, clock: PlaybackClock = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
}): () => void {
  let previousTime = clock.now();
  let pendingMs = 0;
  let frame = 0;
  let stopped = false;
  const tick: FrameRequestCallback = (now) => {
    if (stopped) return;
    pendingMs += Math.max(0, now - previousTime);
    previousTime = now;
    const count = Math.floor(pendingMs * options.speed / 1000);
    if (count > 0) {
      pendingMs -= count * 1000 / options.speed;
      const index = Math.min(options.getIndex() + count, options.totalSteps - 1);
      options.onIndex(index);
      if (index >= options.totalSteps - 1) {
        stopped = true;
        options.onFinish();
        return;
      }
    }
    frame = clock.request(tick);
  };
  frame = clock.request(tick);
  return () => { stopped = true; clock.cancel(frame); };
}
