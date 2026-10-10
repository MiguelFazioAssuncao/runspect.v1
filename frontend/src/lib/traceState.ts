import type { TraceStep } from '@/types/visualizer';
import type { CallFrame, MatrixSnapshot, StructureChange, StructureSnapshot } from './structureViews';

export interface VectorMetadata {
  kind?: string;
  size?: number;
  initialized?: boolean;
  truncated?: number;
  opaque?: boolean;
}
export interface TraceState {
  structs: StructureSnapshot[];
  matrices: MatrixSnapshot[];
  calls: CallFrame[];
  vectorMeta: Record<string, VectorMetadata>;
  reads: string[];
  writes: string[];
  logs: string[];
  output: string;
  warnings: string[];
}

const strings = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];
const count = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
const metadata = (data: Record<string, unknown>): VectorMetadata => ({
  kind: typeof data.kind === 'string' ? data.kind : undefined,
  size: count(data.size), initialized: data.initialized !== false,
  truncated: count(data.truncated),
  ...(data.opaque === true ? { opaque: true } : {}),
});

export function diffItems(before: string[], after: string[], keyed = false): StructureChange[] {
  const changes: StructureChange[] = [];
  if (keyed) {
    // Set identity and map keys survive insertion/reordering (unordered STL).
    const key = (item: string) => item.includes(' → ') ? item.slice(0, item.indexOf(' → ')) : item;
    const buckets = new Map<string, { index: number; item: string }[]>();
    before.forEach((item, index) => buckets.set(key(item), [...(buckets.get(key(item)) ?? []), { item, index }]));
    after.forEach((item, index) => {
      const previous = buckets.get(key(item))?.shift();
      if (!previous) changes.push({ index, kind: 'inserted', after: item });
      else if (previous.item !== item) changes.push({ index, kind: 'changed', before: previous.item, after: item });
    });
    buckets.forEach(bucket => bucket.forEach(({ item, index }) => changes.push({ index, kind: 'removed', before: item })));
  } else {
    for (let index = 0; index < Math.max(before.length, after.length); index++) {
      if (before[index] === after[index]) continue;
      changes.push({ index, kind: before[index] === undefined ? 'inserted' : after[index] === undefined ? 'removed' : 'changed', before: before[index], after: after[index] });
    }
  }
  return changes;
}

// One accumulator per session. Forward playback processes each event once;
// backward seeking rebuilds the prefix, with no retained quadratic snapshots.
export function createTraceReplay(steps: TraceStep[]) {
  let previous = -1;
  let boundary = true;
  let structures = new Map<string, StructureSnapshot>();
  let matrices = new Map<string, MatrixSnapshot>();
  let calls = new Map<number, CallFrame>();
  let vectorMeta: Record<string, VectorMetadata> = {};
  let reads = new Set<string>();
  let writes = new Set<string>();
  let logs: string[] = [];
  let warnings: string[] = [];
  let output = '';
  let activeScope: Set<string> | null = null;
  const reset = () => {
    previous = -1; boundary = true; structures = new Map(); matrices = new Map();
    calls = new Map(); vectorMeta = {}; reads = new Set(); writes = new Set();
    logs = []; warnings = []; output = '';
    activeScope = null;
  };
  return (eventIndex: number): TraceState => {
    if (eventIndex < previous) reset();
    const last = Math.min(eventIndex, steps.length - 1);
    for (let i = previous + 1; i <= last; i++) {
      const { step_event: event, data = {} } = steps[i];
      if (boundary) {
        structures.forEach((s, name) => structures.set(name, { ...s, changes: [] }));
        matrices.forEach((m, name) => matrices.set(name, { ...m, changes: [], active: undefined, dependencies: [] }));
        reads = new Set(); writes = new Set(); boundary = false;
      }
      const name = typeof data.name === 'string' ? data.name : '';
      if (event === 'VARIABLE_END' && name) {
        structures.delete(name); matrices.delete(name);
        vectorMeta = { ...vectorMeta };
        delete vectorMeta[name];
      } else if (event === 'FRAME_SCOPE' && Array.isArray(data.names)) {
        // Hide suspended caller bindings without deleting their snapshots:
        // unchanged containers need to reappear when the caller resumes.
        activeScope = new Set(data.names.map(String));
      } else if (event === 'SET_STRUCT' && name) {
        const items = strings(data.items), before = structures.get(name);
        const kind = typeof data.kind === 'string' ? data.kind : before?.kind;
        const changes = diffItems(before?.items ?? [], items, /set|map/.test(kind ?? ''));
        structures.set(name, { ...metadata(data), name, kind, items, changes: [...(before?.changes ?? []), ...changes] });
        if (name === 'Variáveis') items.forEach(item => {
          const scalarName = item.split(' = ')[0];
          if (structures.get(scalarName)?.initialized === false) structures.delete(scalarName);
        });
        changes.forEach(change => {
          const item = change.after ?? change.before ?? '';
          writes.add(name === 'Variáveis' ? item.split(' = ')[0] : name);
        });
      } else if (event === 'UNINITIALIZED' && name) {
        if (data.initialized === true) structures.delete(name);
        else structures.set(name, { name, kind: String(data.kind ?? 'scalar'), items: [], initialized: false, changes: [] });
      } else if (event === 'SET_MATRIX' && name) {
        const rows = Array.isArray(data.rows) ? data.rows.map(strings) : [];
        const before = matrices.get(name);
        const shape = data.shape as { rows: number; cols: number } | undefined;
        const changes = diffItems(before?.rows.flat() ?? [], rows.flat());
        matrices.set(name, { ...metadata(data), name, rows, shape, changes, active: before?.active, dependencies: before?.dependencies });
        if (changes.length) writes.add(name);
      } else if (event === 'MATRIX_ACCESS' && name && typeof data.row === 'number' && typeof data.col === 'number') {
        const access = data.access === 'write' ? 'write' : 'read';
        const m = matrices.get(name);
        if (m) matrices.set(name, { ...m, active: { row: data.row, col: data.col, access }, dependencies: Array.isArray(data.dependencies) ? data.dependencies as MatrixSnapshot['dependencies'] : [] });
        (access === 'read' ? reads : writes).add(`${name}[${data.row}][${data.col}]`);
      } else if (event === 'VECTOR_META' && name) {
        vectorMeta = { ...vectorMeta, [name]: metadata(data) };
      } else if (event === 'VECTOR_PROBE' || event === 'VECTOR_COMPARE' || (event === 'VECTOR_MARK' && data.state === 'comparing')) {
        for (const index of [data.index, data.a, data.b]) if (typeof index === 'number') reads.add(`${name}[${index}]`);
      } else if (event === 'VECTOR_SET' || event === 'VECTOR_SWAP' || event === 'VECTOR_INIT') {
        if (event === 'VECTOR_INIT') writes.add(name);
        else for (const index of [data.index, data.a, data.b]) if (typeof index === 'number') writes.add(`${name}[${index}]`);
      } else if (event === 'CALL_ENTER' && typeof data.id === 'number') {
        calls.set(data.id, { id: data.id, parent: typeof data.parent === 'number' ? data.parent : null, function: String(data.function ?? '?'), depth: typeof data.depth === 'number' ? data.depth : 0, line: data.line ?? 0, status: 'active' });
      } else if (event === 'CALL_EXIT' && typeof data.id === 'number') {
        const call = calls.get(data.id);
        if (call) calls.set(data.id, { ...call, status: 'returned' });
      } else if (event === 'PRINT') {
        logs.push(String(data.message ?? steps[i].message ?? ''));
      } else if (event === 'PROGRAM_OUTPUT' && typeof data.text === 'string') {
        output = data.replace === true ? data.text : output + data.text;
      } else if ((event === 'RUNTIME_ERROR' || event === 'INPUT_ERROR') && typeof data.message === 'string') {
        warnings.push(data.message);
      }
      if (Array.isArray(data.reads)) data.reads.forEach(item => reads.add(String(item)));
      if (Array.isArray(data.writes)) data.writes.forEach(item => writes.add(String(item)));
      if (event === 'STEP' || event === 'VECTOR_STEP') {
        boundary = true;
        if (data.line === 0 && data.caption?.startsWith('Execução concluída')) activeScope = null;
      }
    }
    previous = last;
    return { structs: [...structures.values()].filter(s => s.name === 'Variáveis' || s.name === 'Execução' || activeScope === null || activeScope.has(s.name)), matrices: [...matrices.values()].filter(m => activeScope === null || activeScope.has(m.name)), calls: [...calls.values()], vectorMeta, reads: [...reads].filter(Boolean), writes: [...writes].filter(Boolean), logs: [...logs], warnings: [...warnings], output };
  };
}

export function buildTraceState(steps: TraceStep[], eventIndex = steps.length - 1): TraceState {
  return createTraceReplay(steps)(eventIndex);
}
