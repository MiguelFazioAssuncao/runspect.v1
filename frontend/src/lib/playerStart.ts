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
  const firstVariables = firstEvent < 0 ? steps.findIndex((step) =>
    step.step_event === 'SET_STRUCT' && step.data?.name === 'Variáveis' &&
    Array.isArray(step.data.items) && step.data.items.length > 0) : firstEvent;
  if (firstVariables < 0) return 0;
  const frame = frames.findIndex((end) => end >= firstVariables);
  // Starting at the first data panel must never reveal output from statements
  // the user has not played yet. Keep the initial frame if cout comes first.
  if (frame >= 0 && steps.slice(0, frames[frame] + 1).some(step => step.step_event === 'PROGRAM_OUTPUT')) return 0;
  return frame < 0 ? 0 : frame;
}
