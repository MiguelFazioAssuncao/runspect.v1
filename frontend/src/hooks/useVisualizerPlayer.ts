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

export function useVisualizerPlayer(steps: TraceStep[]) {
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);

  const frames = useMemo(() => frameEnds(steps), [steps]);
  const totalSteps = frames.length;
  const normalizedStepIndex = totalSteps === 0 ? 0 : Math.min(currentStepIndex, totalSteps - 1);
  const eventIndex = frames[normalizedStepIndex] ?? 0;
  const eventLine = steps[eventIndex]?.data?.line;
  const line =
    typeof eventLine === 'number' && Number.isFinite(eventLine) && eventLine > 0 ? eventLine : null;

  const nextStep = useCallback(() => {
    setCurrentStepIndex((prev) => {
      if (prev >= totalSteps - 1) {
        setIsPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, [totalSteps]);

  const prevStep = useCallback(() => {
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const seek = useCallback(
    (index: number) => {
      setCurrentStepIndex(totalSteps === 0 ? 0 : Math.min(Math.max(0, index), totalSteps - 1));
    },
    [totalSteps]
  );

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
      setCurrentStepIndex(0);
      setIsPlaying(false);
    }, 0);

    return () => window.clearTimeout(resetTimer);
  }, [steps]);

  const directed = useMemo(() => isDirected(steps), [steps]);
  const weighted = useMemo(() => isWeighted(steps), [steps]);
  const multi = useMemo(() => isMulti(steps), [steps]);

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
    isPlaying,
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
    setIsPlaying,
    setSpeed,
    nextStep,
    prevStep,
    seek,
  };
}