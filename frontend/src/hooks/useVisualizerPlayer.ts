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
import { createTraceReplay } from '@/lib/traceState';
import { diffStructureItems } from '@/lib/structureViews';

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
  const replayPreviousVectors = useMemo(() => createVectorReplay(steps), [steps]);
  const replayTrace = useMemo(() => createTraceReplay(steps), [steps]);
  const graphState = useMemo(
    () => replayGraph(eventIndex, directed, multi),
    [replayGraph, eventIndex, directed, multi]
  );

  const vectorState = useMemo(() => replayVectors(eventIndex), [replayVectors, eventIndex]);

  const caption = useMemo(() => frameCaption(steps, eventIndex), [steps, eventIndex]);
  const traceState = useMemo(() => replayTrace(eventIndex), [replayTrace, eventIndex]);
  const previousVectors = useMemo(() => replayPreviousVectors(frames[normalizedStepIndex - 1] ?? -1), [replayPreviousVectors, frames, normalizedStepIndex]);
  const vectors = useMemo(() => vectorState.vectors.map(vector => {
    const previous = previousVectors.vectors.find(candidate => candidate.name === vector.name);
    const meta = traceState.vectorMeta[vector.name];
    const changes = diffStructureItems(previous?.items.map(item => item.displayValue ?? String(item.value)) ?? [], vector.items.map(item => item.displayValue ?? String(item.value)), meta?.kind);
    vector.items.forEach(item => {
      if (item.state === 'comparing' && !changes.some(change => change.index === item.index)) changes.push({ index: item.index, kind: 'compared', after: item.displayValue ?? String(item.value) });
    });
    return { ...vector, ...meta, changes };
  }), [vectorState, previousVectors, traceState]);
  const programConsole = useMemo(() => ({ output: traceState.output, warnings: traceState.warnings }), [traceState]);

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
    vectors,
    vectorIssues: vectorState.issues,
    logs: traceState.logs,
    programConsole,
    structs: traceState.structs,
    matrices: traceState.matrices,
    calls: traceState.calls,
    references: traceState.references,
    reads: traceState.reads,
    writes: traceState.writes,
    vectorMeta: traceState.vectorMeta,
    setIsPlaying: changePlaying,
    setSpeed,
    nextStep,
    prevStep,
    seek,
  };
}
