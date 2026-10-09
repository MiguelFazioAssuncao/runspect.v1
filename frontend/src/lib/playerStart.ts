import type { TraceStep } from '@/types/visualizer';

const isUserVisualization = (step: TraceStep): boolean => {
  switch (step.step_event) {
    case 'VECTOR_INIT':
      return typeof step.data?.name === 'string' && Array.isArray(step.data.values);
    case 'ADD_NODE':
      return typeof step.data?.id === 'number' && Number.isFinite(step.data.id);
    case 'SET_MATRIX':
      return typeof step.data?.name === 'string' && Array.isArray(step.data.rows);
    case 'SET_STRUCT':
      return (
        typeof step.data?.name === 'string' &&
        step.data.name !== 'Execução' &&
        step.data.name !== 'Variáveis' &&
        Array.isArray(step.data.items)
      );
    default:
      return false;
  }
};

// Automatic traces may start with several frames before user data is created.
// Choose its first visible frame without removing any earlier execution steps.
export function playerStartFrame(
  steps: TraceStep[],
  frames: number[],
  startAtVisualization = false,
): number {
  if (!startAtVisualization) return 0;
  const firstEvent = steps.findIndex(isUserVisualization);
  if (firstEvent < 0) return 0;
  const frame = frames.findIndex((end) => end >= firstEvent);
  return frame < 0 ? 0 : frame;
}
