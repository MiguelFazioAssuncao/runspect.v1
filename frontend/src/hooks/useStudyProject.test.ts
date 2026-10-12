import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STUDY_PROJECT, serializeStudyProject, STUDY_STORAGE_KEY } from '@/lib/studyProject';

describe('study draft persistence', () => {
  let storage: Map<string, string>;
  let events: Map<string, () => void>;
  let setItem: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers();
    storage = new Map(); events = new Map();
    setItem = vi.fn((key: string, value: string) => storage.set(key, value));
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => storage.get(key), setItem }, addEventListener: (event: string, callback: () => void) => events.set(event, callback), removeEventListener: (event: string) => events.delete(event) });
    vi.stubGlobal('document', { visibilityState: 'hidden', addEventListener: (event: string, callback: () => void) => events.set(event, callback), removeEventListener: (event: string) => events.delete(event) });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('hydrates without overwriting stored code or input', async () => {
    const saved = { ...DEFAULT_STUDY_PROJECT, code: 'saved program', stdin: '42\n' };
    storage.set(STUDY_STORAGE_KEY, serializeStudyProject(saved));
    const { studyProjectStore: store } = await import('./useStudyProject');
    const unsubscribe = store.subscribe(vi.fn());
    expect(store.getSnapshot().project).toEqual(saved);
    expect(setItem).not.toHaveBeenCalled();
    unsubscribe();
  });
  it('debounces typing and flushes the latest draft before leaving', async () => {
    const { studyProjectStore: store } = await import('./useStudyProject');
    const unsubscribe = store.subscribe(vi.fn());
    store.updateProject({ code: 'a' }); store.updateProject({ code: 'ab', stdin: '7' });
    expect(setItem).not.toHaveBeenCalled();
    events.get('pagehide')!();
    expect(setItem).toHaveBeenCalledOnce();
    expect(JSON.parse(storage.get(STUDY_STORAGE_KEY)!)).toMatchObject({ code: 'ab', stdin: '7' });
    vi.advanceTimersByTime(1000);
    expect(setItem).toHaveBeenCalledOnce();
    unsubscribe();
  });
  it('keeps editing usable if storage is full', async () => {
    setItem.mockImplementation(() => { throw new Error('quota'); });
    const { studyProjectStore: store } = await import('./useStudyProject');
    const unsubscribe = store.subscribe(vi.fn());
    store.updateProject({ code: 'my program' }); vi.advanceTimersByTime(400);
    expect(store.getSnapshot()).toMatchObject({ project: { code: 'my program' }, status: 'unavailable' });
    unsubscribe();
  });
  it('does not overwrite corrupted storage until the user edits', async () => {
    storage.set(STUDY_STORAGE_KEY, 'invalid');
    const { studyProjectStore: store } = await import('./useStudyProject');
    const unsubscribe = store.subscribe(vi.fn());
    expect(store.getSnapshot().status).toBe('recovered');
    expect(setItem).not.toHaveBeenCalled();
    store.updateProject({ code: 'recovered' }); vi.advanceTimersByTime(400);
    expect(store.getSnapshot().status).toBe('saved');
    unsubscribe();
  });
});
