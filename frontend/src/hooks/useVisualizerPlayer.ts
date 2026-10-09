import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { TraceStep } from '@/types/visualizer';
import {
  createGraphReplay,
  frameCaption,
  frameEnds,
  isDirected,
  isMulti,
  isWeighted,
} from '@/lib/graphReducer';
import { createVectorReplay } from '@/lib/vectorReducer';
import { playerStartFrame } from '@/lib/playerStart';
import { startPlayback } from '@/lib/playback';
import { programConsoleAt } from '@/lib/programConsole';

export function useVisualizerPlayer(steps: TraceStep[], startAtVisualization = false, recordingIndex?: number) {
  const [position, setPosition] = useState({ steps, index: 0 });
  const setCurrentStepIndex = useCallback((index: number) => setPosition({ steps, index }), [steps]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);
  const playbackIndex = useRef(0);

  const frames = useMemo(() => frameEnds(steps), [steps]);
  const initialStepIndex = useMemo(
    () => playerStartFrame(steps, frames, startAtVisualization),
    [steps, frames, startAtVisualization],
  );
  const totalSteps = frames.length;
  const currentStepIndex = position.steps === steps ? position.index : initialStepIndex;
  const normalizedStepIndex = totalSteps === 0 ? 0 : Math.min(recordingIndex ?? currentStepIndex, totalSteps - 1);
  const eventIndex = frames[normalizedStepIndex] ?? 0;
  const eventLine = steps[eventIndex]?.data?.line;
  const line =
    typeof eventLine === 'number' && Number.isFinite(eventLine) && eventLine > 0 ? eventLine : null;

  const nextStep = useCallback(() => {
    const index = Math.min(playbackIndex.current + 1, Math.max(0, totalSteps - 1));
    playbackIndex.current = index;
    setCurrentStepIndex(index);
    if (index >= totalSteps - 1) setIsPlaying(false);
  }, [totalSteps, setCurrentStepIndex]);

  const prevStep = useCallback(() => {
    playbackIndex.current = Math.max(0, playbackIndex.current - 1);
    setCurrentStepIndex(playbackIndex.current);
  }, [setCurrentStepIndex]);

  const seek = useCallback(
    (index: number) => {
      playbackIndex.current = totalSteps === 0 ? 0 : Math.min(Math.max(0, index), totalSteps - 1);
      setCurrentStepIndex(playbackIndex.current);
      if (playbackIndex.current >= totalSteps - 1) setIsPlaying(false);
    },
    [totalSteps, setCurrentStepIndex]
  );

  const changePlaying = useCallback((playing: boolean) => {
    if (playing && normalizedStepIndex >= totalSteps - 1 && totalSteps > 1) {
      playbackIndex.current = 0;
      setCurrentStepIndex(0);
    }
    setIsPlaying(playing && totalSteps > 1);
  }, [normalizedStepIndex, totalSteps, setCurrentStepIndex]);

  useEffect(() => {
    if (!isPlaying || totalSteps < 2 || position.steps !== steps) return;
    return startPlayback({
      speed, totalSteps,
      getIndex: () => playbackIndex.current,
      onIndex: (index) => {
        playbackIndex.current = index;
        setCurrentStepIndex(index);
      },
      onFinish: () => setIsPlaying(false),
    });
  }, [isPlaying, totalSteps, speed, steps, position.steps, setCurrentStepIndex]);

  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      playbackIndex.current = initialStepIndex;
      setCurrentStepIndex(initialStepIndex);
      setIsPlaying(false);
    }, 0);

    return () => window.clearTimeout(resetTimer);
  }, [steps, initialStepIndex, setCurrentStepIndex]);

  const directed = useMemo(() => isDirected(steps, eventIndex), [steps, eventIndex]);
  const weighted = useMemo(() => isWeighted(steps, eventIndex), [steps, eventIndex]);
  const multi = useMemo(() => isMulti(steps, eventIndex), [steps, eventIndex]);

  const replayGraph = useMemo(() => createGraphReplay(steps), [steps]);
  const replayVectors = useMemo(() => createVectorReplay(steps), [steps]);
  const graphState = useMemo(
    () => replayGraph(eventIndex, directed, multi),
    [replayGraph, eventIndex, directed, multi]
  );

  const vectorState = useMemo(() => replayVectors(eventIndex), [replayVectors, eventIndex]);

  const caption = useMemo(() => frameCaption(steps, eventIndex), [steps, eventIndex]);
  const programConsole = useMemo(() => programConsoleAt(steps, eventIndex), [steps, eventIndex]);

  const logs = useMemo(() => {
    const lines: string[] = [];
    for (let i = 0; i <= eventIndex && i < steps.length; i++) {
      const step = steps[i];
      if (step.step_event === 'PRINT' && step.data?.message !== undefined) {
        lines.push(String(step.data.message));
      }
    }
    return lines;
  }, [steps, eventIndex]);

  const structs = useMemo(() => {
    const map = new Map<string, string[]>();
    for (let i = 0; i <= eventIndex && i < steps.length; i++) {
      const step = steps[i];
      if (step.step_event === 'SET_STRUCT' && typeof step.data?.name === 'string') {
        const items = Array.isArray(step.data.items) ? step.data.items.map(String) : [];
        map.set(step.data.name, items);
      }
    }
    return Array.from(map, ([name, items]) => ({ name, items }));
  }, [steps, eventIndex]);

  const matrices = useMemo(() => {
    const map = new Map<string, string[][]>();
    for (let i = 0; i <= eventIndex && i < steps.length; i++) {
      const step = steps[i];
      if (step.step_event === 'SET_MATRIX' && typeof step.data?.name === 'string') {
        const rows = Array.isArray(step.data.rows)
          ? step.data.rows.map((row) => (Array.isArray(row) ? row.map(String) : []))
          : [];
        map.set(step.data.name, rows);
      }
    }
    return Array.from(map, ([name, rows]) => ({ name, rows }));
  }, [steps, eventIndex]);

  return {
    currentStepIndex: normalizedStepIndex,
    eventIndex,
    line,
    caption,
    isPlaying: isPlaying && position.steps === steps && normalizedStepIndex < totalSteps - 1,
    speed,
    totalSteps,
    graphState,
    directed,
    weighted,
    multi,
    vectors: vectorState.vectors,
    vectorIssues: vectorState.issues,
    logs,
    programConsole,
    structs,
    matrices,
    setIsPlaying: changePlaying,
    setSpeed,
    nextStep,
    prevStep,
    seek,
  };
}
