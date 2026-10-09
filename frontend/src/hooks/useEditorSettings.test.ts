import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_SETTINGS, EDITOR_SETTINGS_KEY, serializeEditorSettings } from '@/lib/editorSettings';

describe('editor browser storage', () => {
  let values: Map<string, string>;
  let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> };
  let events: Map<string, (event: { key: string | null; storageArea: unknown }) => void>;

  beforeEach(() => {
    vi.resetModules();
    values = new Map(); events = new Map();
    storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    };
    vi.stubGlobal('window', {
      localStorage: storage,
      addEventListener: vi.fn((name: string, callback) => events.set(name, callback)),
      removeEventListener: vi.fn((name: string) => events.delete(name)),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads saved preferences on subscription without overwriting them with defaults', async () => {
    values.set(EDITOR_SETTINGS_KEY, serializeEditorSettings({ ...DEFAULT_EDITOR_SETTINGS, fontSize: 24 }));
    const { editorSettingsStore: store } = await import('./useEditorSettings');
    const unsubscribe = store.subscribe(vi.fn());
    expect(store.getSnapshot().settings.fontSize).toBe(24);
    expect(storage.setItem).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('persists updates immediately and notifies subscribers', async () => {
    const { editorSettingsStore: store } = await import('./useEditorSettings');
    const listener = vi.fn(); const unsubscribe = store.subscribe(listener);
    store.updateSettings({ ...DEFAULT_EDITOR_SETTINGS, fontSize: 18 });
    expect(JSON.parse(values.get(EDITOR_SETTINGS_KEY)!).settings.fontSize).toBe(18);
    expect(store.getSnapshot().status).toBe('saved');
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('synchronizes relevant changes and site-data clearing from other tabs', async () => {
    const { editorSettingsStore: store } = await import('./useEditorSettings');
    const listener = vi.fn(); const unsubscribe = store.subscribe(listener);
    values.set(EDITOR_SETTINGS_KEY, serializeEditorSettings({ ...DEFAULT_EDITOR_SETTINGS, tabSize: 2 }));
    events.get('storage')!({ key: 'unrelated-key', storageArea: storage });
    expect(listener).not.toHaveBeenCalled();
    events.get('storage')!({ key: EDITOR_SETTINGS_KEY, storageArea: storage });
    expect(store.getSnapshot().settings.tabSize).toBe(2);
    values.clear();
    events.get('storage')!({ key: null, storageArea: storage });
    expect(store.getSnapshot().settings).toEqual(DEFAULT_EDITOR_SETTINGS);
    unsubscribe();
    expect(events.has('storage')).toBe(false);
  });

  it('keeps changes usable in memory and reports unavailable storage', async () => {
    storage.getItem.mockImplementation(() => { throw new Error('blocked'); });
    storage.setItem.mockImplementation(() => { throw new Error('quota'); });
    const { editorSettingsStore: store } = await import('./useEditorSettings');
    const unsubscribe = store.subscribe(vi.fn());
    expect(store.getSnapshot().status).toBe('unavailable');
    store.updateSettings({ ...DEFAULT_EDITOR_SETTINGS, fontSize: 19 });
    expect(store.getSnapshot().settings.fontSize).toBe(19);
    expect(store.getSnapshot().status).toBe('unavailable');
    unsubscribe();
  });

  it('recovers corrupted storage and can replace it with valid preferences', async () => {
    values.set(EDITOR_SETTINGS_KEY, 'broken JSON');
    const { editorSettingsStore: store } = await import('./useEditorSettings');
    const unsubscribe = store.subscribe(vi.fn());
    expect(store.getSnapshot().status).toBe('recovered');
    expect(store.getSnapshot().settings).toEqual(DEFAULT_EDITOR_SETTINGS);
    store.updateSettings(DEFAULT_EDITOR_SETTINGS);
    expect(store.getSnapshot().status).toBe('saved');
    expect(() => JSON.parse(values.get(EDITOR_SETTINGS_KEY)!)).not.toThrow();
    unsubscribe();
  });
});
