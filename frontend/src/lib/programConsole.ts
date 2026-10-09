import type { TraceStep } from '@/types/visualizer';

export function programConsoleAt(steps: TraceStep[], eventIndex: number) {
  let output = '';
  const warnings: string[] = [];
  for (let i = 0; i <= eventIndex && i < steps.length; i++) {
    const step = steps[i];
    if (step.step_event === 'PROGRAM_OUTPUT' && typeof step.data?.text === 'string') {
      output = step.data.replace === true ? step.data.text : output + step.data.text;
    }
    if ((step.step_event === 'INPUT_ERROR' || step.step_event === 'RUNTIME_ERROR') && typeof step.data?.message === 'string') warnings.push(step.data.message);
  }
  return { output, warnings };
}
