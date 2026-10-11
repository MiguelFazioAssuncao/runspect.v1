export const TRACE_PRESETS = {
  standard: { label: 'Padrão: 2.000 passos · 256 elementos', max_steps: 2000, max_items: 256 },
  detailed: { label: 'Detalhada: 5.000 passos · 1.024 elementos', max_steps: 5000, max_items: 1024 },
  expanded: { label: 'Ampla: 10.000 passos · 2.048 elementos', max_steps: 10000, max_items: 2048 },
} as const;
export type TracePreset = keyof typeof TRACE_PRESETS;
