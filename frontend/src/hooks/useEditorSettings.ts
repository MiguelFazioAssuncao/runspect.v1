'use client';

import { useSyncExternalStore } from 'react';
import { DEFAULT_EDITOR_SETTINGS, EDITOR_SETTINGS_KEY, importEditorSettings, normalizeEditorSettings, serializeEditorSettings } from '@/lib/editorSettings';
import type { EditorSettings } from '@/lib/editorSettings';

type Snapshot = { settings: EditorSettings; status: 'saved' | 'unavailable' | 'recovered' };
const serverSnapshot: Snapshot = { settings: DEFAULT_EDITOR_SETTINGS, status: 'saved' };
let snapshot = serverSnapshot;
const listeners = new Set<() => void>();

function loadSettings(): void {
  try {
    const source = window.localStorage.getItem(EDITOR_SETTINGS_KEY);
    if (!source) snapshot = serverSnapshot;
    else {
      try { snapshot = { settings: importEditorSettings(source), status: 'saved' }; }
      catch { snapshot = { settings: DEFAULT_EDITOR_SETTINGS, status: 'recovered' }; }
    }
  } catch { snapshot = { ...snapshot, status: 'unavailable' }; }
}
function emit(): void { listeners.forEach((listener) => listener()); }
function onStorage(event: StorageEvent): void {
  if ((event.key === EDITOR_SETTINGS_KEY || event.key === null) && event.storageArea === window.localStorage) { loadSettings(); emit(); }
}
function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    loadSettings();
    window.addEventListener('storage', onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}
function updateSettings(settings: EditorSettings): void {
  const normalized = normalizeEditorSettings(settings);
  let status: Snapshot['status'] = 'saved';
  try { window.localStorage.setItem(EDITOR_SETTINGS_KEY, serializeEditorSettings(normalized)); }
  catch { status = 'unavailable'; }
  snapshot = { settings: normalized, status };
  emit();
}

export function useEditorSettings() {
  const current = useSyncExternalStore(subscribe, editorSettingsStore.getSnapshot, () => serverSnapshot);
  return {
    ...current,
    updateSettings,
    resetSettings: () => updateSettings(DEFAULT_EDITOR_SETTINGS),
  };
}

export const editorSettingsStore = { subscribe, updateSettings, getSnapshot: () => snapshot };
