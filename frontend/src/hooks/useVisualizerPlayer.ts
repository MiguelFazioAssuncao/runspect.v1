import { useState, useEffect, useCallback, useMemo } from 'react';
import { TraceStep } from '@/types/visualizer';
import {
  buildGraphState,
  frameCaption,
  frameEnds,
  isDirected,
  isMulti,
  isWeighted,
} from '@/lib/graphReducer';
import { buildVectorsState } from '@/lib/vectorReducer';
import { playerStartFrame } from '@/lib/playerStart';

export function useVisualizerPlayer(steps: TraceStep[], startAtVisualization = false) {
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);

  const frames = useMemo(() => frameEnds(steps), [steps]);
  const initialStepIndex = useMemo(
    () => playerStartFrame(steps, frames, startAtVisualization),
    [steps, frames, startAtVisualization],
  );
  const totalSteps = frames.length;
  const normalizedStepIndex = totalSteps === 0 ? 0 : Math.min(currentStepIndex, totalSteps - 1);
  const eventIndex = frames[normalizedStepIndex] ?? 0;
  const eventLine = steps[eventIndex]?.data?.line;
  const line =
    typeof eventLine === 'number' && Number.isFinite(eventLine) && eventLine > 0 ? eventLine : null;

  const nextStep = useCallback(() => {
    if (normalizedStepIndex + 1 >= totalSteps - 1) setIsPlaying(false);
    setCurrentStepIndex((prev) => {
      if (prev >= totalSteps - 1) {
        return prev;
      }
      return prev + 1;
    });
  }, [normalizedStepIndex, totalSteps]);

  const prevStep = useCallback(() => {
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const seek = useCallback(
    (index: number) => {
      setCurrentStepIndex(totalSteps === 0 ? 0 : Math.min(Math.max(0, index), totalSteps - 1));
    },
    [totalSteps]
  );

  const changePlaying = useCallback((playing: boolean) => {
    if (playing && normalizedStepIndex >= totalSteps - 1 && totalSteps > 1) {
      setCurrentStepIndex(0);
    }
    setIsPlaying(playing && totalSteps > 1);
  }, [normalizedStepIndex, totalSteps]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isPlaying && normalizedStepIndex < totalSteps - 1) {
      timer = setTimeout(() => {
        nextStep();
      }, 1000 / speed);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isPlaying, normalizedStepIndex, totalSteps, speed, nextStep]);

  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      setCurrentStepIndex(initialStepIndex);
      setIsPlaying(false);
    }, 0);

    return () => window.clearTimeout(resetTimer);
  }, [steps, initialStepIndex]);

  const directed = useMemo(() => isDirected(steps, eventIndex), [steps, eventIndex]);
  const weighted = useMemo(() => isWeighted(steps, eventIndex), [steps, eventIndex]);
  const multi = useMemo(() => isMulti(steps, eventIndex), [steps, eventIndex]);

  const graphState = useMemo(
    () => buildGraphState(steps, eventIndex, directed, multi),
    [steps, eventIndex, directed, multi]
  );

  const vectorState = useMemo(() => buildVectorsState(steps, eventIndex), [steps, eventIndex]);

  const caption = useMemo(() => frameCaption(steps, eventIndex), [steps, eventIndex]);

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
    isPlaying: isPlaying && normalizedStepIndex < totalSteps - 1,
    speed,
    totalSteps,
    graphState,
    directed,
    weighted,
    multi,
    vectors: vectorState.vectors,
    vectorIssues: vectorState.issues,
    logs,
    structs,
    matrices,
    setIsPlaying: changePlaying,
    setSpeed,
    nextStep,
    prevStep,
    seek,
  };
}
