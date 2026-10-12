'use client';

import { useSyncExternalStore } from 'react';
import { DEFAULT_STUDY_PROJECT, parseStudyProject, serializeStudyProject, STUDY_STORAGE_KEY, validateProgram } from '@/lib/studyProject';
import type { StudyProject } from '@/lib/studyProject';

type Snapshot = { project: StudyProject; status: 'ready' | 'saved' | 'saving' | 'unavailable' | 'recovered' };
const initial: Snapshot = { project: DEFAULT_STUDY_PROJECT, status: 'ready' };
let snapshot = initial;
let initialized = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

function flush() {
  if (timer) clearTimeout(timer);
  timer = undefined;
  if (snapshot.status !== 'saving') return;
  try {
    validateProgram(snapshot.project.code, snapshot.project.stdin);
    window.localStorage.setItem(STUDY_STORAGE_KEY, serializeStudyProject(snapshot.project));
    snapshot = { ...snapshot, status: 'saved' };
  } catch { snapshot = { ...snapshot, status: 'unavailable' }; }
  emit();
}

function onVisibilityChange() { if (document.visibilityState === 'hidden') flush(); }

function subscribe(listener: () => void) {
  if (!initialized) {
    initialized = true;
    try {
      const source = window.localStorage.getItem(STUDY_STORAGE_KEY);
      if (source) {
        try { snapshot = { project: parseStudyProject(source), status: 'saved' }; }
        catch { snapshot = { ...initial, status: 'recovered' }; }
      }
    } catch { snapshot = { ...initial, status: 'unavailable' }; }
  }
  if (listeners.size === 0) {
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      flush();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  };
}

function updateProject(update: Partial<Pick<StudyProject, 'code' | 'stdin' | 'completed'>>) {
  snapshot = { project: { ...snapshot.project, ...update }, status: 'saving' };
  emit();
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 400);
}

export const studyProjectStore = { subscribe, getSnapshot: () => snapshot, updateProject, flush };

export function useStudyProject() {
  const current = useSyncExternalStore(subscribe, studyProjectStore.getSnapshot, () => initial);
  return { ...current, updateProject };
}
