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
  errors?: string;
  time_ms: number;
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