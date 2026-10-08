import type { TraceStep, GraphNode, GraphEdge } from '@/types/visualizer';

export interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const NODE_STATE_COLORS = new Map<string, string>([
  ['queued', 'yellow'],
  ['visiting', 'orange'],
  ['done', 'emerald'],
]);

const EDGE_STATE_COLORS = new Map<string, string>([
  ['candidate', 'yellow'],
  ['accepted', 'emerald'],
  ['rejected', 'red'],
  ['relaxed', 'yellow'],
  ['tree', 'emerald'],
  ['removed', 'gray'],
]);

const COMPONENT_COLORS = ['emerald', 'orange', 'purple', 'sky', 'yellow', 'pink'];

export const isDirected = (steps: TraceStep[]): boolean =>
  !steps.some((s) => s.step_event === 'SET_DIRECTED' && s.data?.directed === false);

export const isWeighted = (steps: TraceStep[]): boolean =>
  !steps.some((s) => s.step_event === 'SET_WEIGHTED' && s.data?.weighted === false);

export const isMulti = (steps: TraceStep[]): boolean =>
  steps.some((s) => s.step_event === 'SET_MULTI' && s.data?.multi === true);

export const frameEnds = (steps: TraceStep[]): number[] => {
  const ends: number[] = [];
  steps.forEach((s, i) => {
    if (s.step_event === 'STEP' || s.step_event === 'VECTOR_STEP') ends.push(i);
  });
  if (ends.length === 0) return steps.map((_, i) => i);
  if (ends[ends.length - 1] !== steps.length - 1) ends.push(steps.length - 1);
  return ends;
};

export const frameCaption = (steps: TraceStep[], eventIndex: number): string => {
  const s = steps[eventIndex];
  return s?.step_event === 'STEP' && typeof s.data?.caption === 'string' ? s.data.caption : '';
};

const isNodePath = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isInteger(item));

export function buildGraphState(
  steps: TraceStep[],
  upTo: number,
  directed: boolean,
  multi: boolean
): GraphState {
  const nodesMap = new Map<number, GraphNode>();
  const edgesMap = new Map<string, GraphEdge>();
  const counters = new Map<string, number>();

  const baseKey = (u: number, v: number) =>
    directed ? `${u}-${v}` : `${Math.min(u, v)}-${Math.max(u, v)}`;

  const findKey = (u: number, v: number, preferFree = false): string | undefined => {
    const base = baseKey(u, v);
    if (!multi) return edgesMap.has(base) ? base : undefined;
    const prefix = `${base}#`;
    let first: string | undefined;
    for (const [key, edge] of Array.from(edgesMap.entries())) {
      if (!key.startsWith(prefix)) continue;
      if (first === undefined) first = key;
      if (!preferFree || !edge.highlighted) return key;
    }
    return first;
  };

  const paintNode = (id: number, color: string) => {
    const node = nodesMap.get(id);
    if (node) nodesMap.set(id, { ...node, color, highlighted: true });
  };

  const paintEdge = (u: number, v: number, color: string, style?: GraphEdge['style']) => {
    const key = findKey(u, v, true);
    const edge = key !== undefined ? edgesMap.get(key) : undefined;
    if (key !== undefined && edge) {
      edgesMap.set(key, { ...edge, color, highlighted: true, ...(style ? { style } : {}) });
    }
  };

  const resetColors = () => {
    Array.from(nodesMap.entries()).forEach(([id, node]) => {
      nodesMap.set(id, { ...node, color: '#3b82f6', highlighted: false });
    });
    Array.from(edgesMap.entries()).forEach(([key, edge]) => {
      edgesMap.set(key, { ...edge, color: '#64748b', highlighted: false });
    });
  };

  for (let i = 0; i <= upTo && i < steps.length; i++) {
    const step = steps[i];
    const data = step.data || {};

    switch (step.step_event) {
      case 'ADD_NODE': {
        if (data.id !== undefined) {
          nodesMap.set(data.id, {
            id: data.id,
            label: data.label ?? `Node ${data.id}`,
            color: '#3b82f6',
          });
        }
        break;
      }
      case 'ADD_EDGE': {
        if (data.u !== undefined && data.v !== undefined) {
          const base = baseKey(data.u, data.v);
          let key = base;
          if (multi) {
            const next = (counters.get(base) ?? 0) + 1;
            counters.set(base, next);
            key = `${base}#${next}`;
          }
          edgesMap.set(key, {
            source: data.u,
            target: data.v,
            weight: data.weight ?? 1,
            color: '#64748b',
          });
        }
        break;
      }
      case 'REMOVE_NODE': {
        if (data.id !== undefined) {
          const removedId = data.id;
          nodesMap.delete(removedId);
          Array.from(edgesMap.entries()).forEach(([key, edge]) => {
            if (edge.source === removedId || edge.target === removedId) {
              edgesMap.delete(key);
            }
          });
        }
        break;
      }
      case 'REMOVE_EDGE': {
        if (data.u !== undefined && data.v !== undefined) {
          const key = findKey(data.u, data.v);
          if (key !== undefined) edgesMap.delete(key);
        }
        break;
      }
      case 'SET_WEIGHT': {
        if (data.u !== undefined && data.v !== undefined) {
          const key = findKey(data.u, data.v);
          const edge = key !== undefined ? edgesMap.get(key) : undefined;
          if (key !== undefined && edge) {
            edgesMap.set(key, { ...edge, weight: data.weight ?? edge.weight });
          }
        }
        break;
      }
      case 'HIGHLIGHT': {
        if (data.id !== undefined && nodesMap.has(data.id)) {
          const node = nodesMap.get(data.id)!;
          nodesMap.set(data.id, {
            ...node,
            color: data.color || '#ef4444',
            highlighted: true,
          });
        }
        break;
      }
      case 'HIGHLIGHT_EDGE': {
        if (data.u !== undefined && data.v !== undefined) {
          const key = findKey(data.u, data.v, true);
          const edge = key !== undefined ? edgesMap.get(key) : undefined;
          if (key !== undefined && edge) {
            edgesMap.set(key, {
              ...edge,
              color: data.color || '#ef4444',
              highlighted: true,
            });
          }
        }
        break;
      }
      case 'RESET_COLORS':
      case 'GRAPH_RESET': {
        resetColors();
        break;
      }
      case 'SET_LABEL': {
        if (data.id !== undefined && nodesMap.has(data.id)) {
          const node = nodesMap.get(data.id)!;
          nodesMap.set(data.id, { ...node, label: String(data.label ?? '') });
        }
        break;
      }
      case 'SET_COLOR': {
        if (data.id !== undefined && nodesMap.has(data.id)) {
          const node = nodesMap.get(data.id)!;
          nodesMap.set(data.id, {
            ...node,
            color: data.color || '#ef4444',
            highlighted: true,
          });
        }
        break;
      }
      case 'SET_BADGE': {
        if (data.id !== undefined && nodesMap.has(data.id)) {
          const node = nodesMap.get(data.id)!;
          nodesMap.set(data.id, { ...node, badge: data.text ? String(data.text) : undefined });
        }
        break;
      }
      case 'SET_EDGE_STYLE': {
        if (data.u !== undefined && data.v !== undefined) {
          const key = findKey(data.u, data.v);
          const edge = key !== undefined ? edgesMap.get(key) : undefined;
          if (key !== undefined && edge) {
            const style = data.style === 'dashed' || data.style === 'dotted' ? data.style : 'solid';
            edgesMap.set(key, { ...edge, style });
          }
        }
        break;
      }
      case 'SET_EDGE_LABEL': {
        if (data.u !== undefined && data.v !== undefined) {
          const key = findKey(data.u, data.v);
          const edge = key !== undefined ? edgesMap.get(key) : undefined;
          if (key !== undefined && edge) {
            edgesMap.set(key, { ...edge, label: data.label ?? undefined });
          }
        }
        break;
      }
      case 'GRAPH_NODE': {
        const color = typeof data.state === 'string' ? NODE_STATE_COLORS.get(data.state) : undefined;
        if (data.id !== undefined && color) paintNode(data.id, color);
        break;
      }
      case 'GRAPH_EDGE': {
        const color = typeof data.state === 'string' ? EDGE_STATE_COLORS.get(data.state) : undefined;
        if (data.u !== undefined && data.v !== undefined && color) {
          paintEdge(data.u, data.v, color, data.state === 'removed' ? 'dashed' : undefined);
        }
        break;
      }
      case 'GRAPH_VALUE': {
        if (data.id !== undefined && nodesMap.has(data.id)) {
          const node = nodesMap.get(data.id)!;
          nodesMap.set(data.id, { ...node, badge: data.text ? String(data.text) : undefined });
        }
        break;
      }
      case 'GRAPH_COMPONENT': {
        if (data.id !== undefined && typeof data.component === 'number' && Number.isInteger(data.component)) {
          const slot = ((data.component % COMPONENT_COLORS.length) + COMPONENT_COLORS.length) % COMPONENT_COLORS.length;
          paintNode(data.id, COMPONENT_COLORS[slot]);
        }
        break;
      }
      case 'GRAPH_PATH': {
        const path = data.path;
        if (isNodePath(path)) {
          path.forEach((id, position) => {
            paintNode(id, 'red');
            if (position + 1 < path.length) paintEdge(id, path[position + 1], 'red');
          });
        }
        break;
      }
    }
  }

  return {
    nodes: Array.from(nodesMap.values()),
    edges: Array.from(edgesMap.values()),
  };
}