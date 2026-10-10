export type ActionType = 'ADD_NODE' | 'ADD_EDGE' | 'HIGHLIGHT' | string;

export interface TraceStepData {
  line?: number;
  id?: number;
  label?: string;
  u?: number;
  v?: number;
  weight?: number;
  color?: string;
  directed?: boolean;
  weighted?: boolean;
  message?: string;
  name?: string;
  items?: string[];
  rows?: string[][];
  caption?: string;
  text?: string;
  style?: string;
  state?: string;
  path?: number[];
  component?: number;
  [key: string]: unknown;
}

export interface TraceStep {
  step: number;
  step_event: ActionType;
  data?: TraceStepData;
  message?: string;
  directed?: boolean;
  multi?: boolean;
}

export interface ExecutionResult {
  success: boolean;
  steps: TraceStep[];
  output?: string;
  errors?: string;
  time_ms: number;
  trace_mode?: 'automatic' | 'manual' | 'unavailable';
  trace_warnings?: string[];
}

export interface GraphNode extends d3.SimulationNodeDatum {
  id: number;
  label: string;
  color?: string;
  highlighted?: boolean;
  badge?: string;
}

export interface GraphEdge extends d3.SimulationLinkDatum<GraphNode> {
  source: number | GraphNode;
  target: number | GraphNode;
  weight?: number;
  color?: string;
  highlighted?: boolean;
  style?: 'solid' | 'dashed' | 'dotted';
  label?: string;
}

export const VECTOR_ELEMENT_STATES = [
  'default',
  'comparing',
  'swapping',
  'pivot',
  'sorted',
  'active',
  'discarded',
  'found',
] as const;

export type VectorElementState = (typeof VECTOR_ELEMENT_STATES)[number];

export const VECTOR_EVENTS = [
  'VECTOR_INIT',
  'VECTOR_COMPARE',
  'VECTOR_SWAP',
  'VECTOR_SET',
  'VECTOR_MARK',
  'VECTOR_RANGE',
  'VECTOR_DISCARD',
  'VECTOR_PROBE',
  'VECTOR_PIVOT',
  'VECTOR_RESET',
  'VECTOR_STEP',
  'VECTOR_RESULT',
  'VECTOR_LABELS',
] as const;

export type VectorEventName = (typeof VECTOR_EVENTS)[number];

export interface VectorItem {
  index: number;
  value: number;
  displayValue?: string;
  state: VectorElementState;
}

export interface VectorRange {
  start: number;
  end: number;
}

export type VectorOperation =
  | { kind: 'compare'; a: number; b: number }
  | { kind: 'swap'; a: number; b: number }
  | { kind: 'probe'; index: number }
  | { kind: 'set'; index: number; value: number };

export interface VectorSnapshot {
  name: string;
  initial: number[];
  items: VectorItem[];
  operation: VectorOperation | null;
  range: VectorRange | null;
  pivot: number | null;
  caption: string;
  result: number[] | null;
  kind?: string;
  size?: number;
  initialized?: boolean;
  truncated?: number;
  changes?: import('@/lib/structureViews').StructureChange[];
}

export interface VectorIssue {
  event: number;
  step_event: string;
  reason: string;
}

export interface VectorsState {
  vectors: VectorSnapshot[];
  issues: VectorIssue[];
}
