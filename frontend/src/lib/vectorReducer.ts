import { VECTOR_ELEMENT_STATES } from '@/types/visualizer';
import type {
  TraceStep,
  VectorElementState,
  VectorIssue,
  VectorOperation,
  VectorRange,
  VectorSnapshot,
  VectorsState,
} from '@/types/visualizer';

interface WorkingVector {
  initial: number[];
  values: number[];
  labels: (string | null)[];
  marks: Map<number, VectorElementState>;
  pivot: number | null;
  range: VectorRange | null;
  operation: VectorOperation | null;
  caption: string;
  result: number[] | null;
  clearOnNext: boolean;
}

const isInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);

const isIndex = (value: unknown, size: number): value is number =>
  isInteger(value) && value >= 0 && value < size;

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item));

const isLabelArray = (value: unknown, size: number): value is (string | null)[] =>
  Array.isArray(value) && value.length === size && value.every((item) => item === null || typeof item === 'string');

const isElementState = (value: unknown): value is VectorElementState =>
  typeof value === 'string' && (VECTOR_ELEMENT_STATES as readonly string[]).includes(value);

const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');

function createVector(values: number[]): WorkingVector {
  return {
    initial: [...values],
    values: [...values],
    labels: values.map(() => null),
    marks: new Map(),
    pivot: null,
    range: null,
    operation: null,
    caption: '',
    result: null,
    clearOnNext: false,
  };
}

function applyEvent(vectors: Map<string, WorkingVector>, step: TraceStep): string | null {
  const data = step.data;
  const name = data?.name;
  if (typeof name !== 'string' || name === '') return 'evento sem nome de vetor';

  if (step.step_event === 'VECTOR_INIT') {
    const values = data?.values;
    if (!isNumberArray(values)) return 'values inválido';
    if (data?.value_labels !== undefined && !isLabelArray(data.value_labels, values.length)) return 'rótulos inválidos';
    const created = createVector(values);
    if (isLabelArray(data?.value_labels, values.length)) created.labels = [...data.value_labels];
    vectors.set(name, created);
    return null;
  }

  const vector = vectors.get(name);
  if (!vector) return `vetor "${name}" não inicializado`;

  if (vector.clearOnNext) {
    vector.operation = null;
    vector.clearOnNext = false;
  }

  const size = vector.values.length;
  const caption = textOf(data?.caption);
  const index = data?.index;
  const remember = () => {
    if (caption) vector.caption = caption;
  };

  switch (step.step_event) {
    case 'VECTOR_LABELS': {
      if (!isLabelArray(data?.value_labels, size)) return 'rótulos inválidos';
      vector.labels = [...data.value_labels];
      return null;
    }
    case 'VECTOR_COMPARE': {
      const a = data?.a;
      const b = data?.b;
      if (!isIndex(a, size) || !isIndex(b, size)) return 'índices fora do intervalo';
      vector.operation = { kind: 'compare', a, b };
      remember();
      return null;
    }
    case 'VECTOR_SWAP': {
      const a = data?.a;
      const b = data?.b;
      if (!isIndex(a, size) || !isIndex(b, size)) return 'índices fora do intervalo';
      [vector.values[a], vector.values[b]] = [vector.values[b], vector.values[a]];
      [vector.labels[a], vector.labels[b]] = [vector.labels[b], vector.labels[a]];
      vector.marks.delete(a);
      vector.marks.delete(b);
      vector.operation = { kind: 'swap', a, b };
      remember();
      return null;
    }
    case 'VECTOR_SET': {
      const value = data?.value;
      if (!isIndex(index, size) || typeof value !== 'number' || !Number.isFinite(value)) {
        return 'escrita inválida';
      }
      vector.values[index] = value;
      vector.labels[index] = typeof data?.value_label === 'string' ? data.value_label : null;
      vector.marks.delete(index);
      vector.operation = { kind: 'set', index, value };
      remember();
      return null;
    }
    case 'VECTOR_PROBE': {
      if (!isIndex(index, size)) return 'índice fora do intervalo';
      vector.operation = { kind: 'probe', index };
      remember();
      return null;
    }
    case 'VECTOR_MARK': {
      const state = data?.state;
      if (!isIndex(index, size) || !isElementState(state)) return 'marcação inválida';
      if (state === 'default') vector.marks.delete(index);
      else vector.marks.set(index, state);
      if (state === 'found' || state === 'sorted') {
        vector.operation = null;
        if (vector.pivot === index) vector.pivot = null;
      }
      return null;
    }
    case 'VECTOR_RANGE': {
      const begin = data?.begin;
      const end = data?.end;
      if (!isInteger(begin) || !isInteger(end)) return 'intervalo inválido';
      if (begin > end) {
        vector.range = null;
      } else if (begin < 0 || end >= size) {
        return 'intervalo fora dos limites';
      } else {
        vector.range = { start: begin, end };
      }
      remember();
      return null;
    }
    case 'VECTOR_DISCARD': {
      const begin = data?.begin;
      const end = data?.end;
      if (!isInteger(begin) || !isInteger(end)) return 'intervalo inválido';
      if (begin > end) return null;
      if (begin < 0 || end >= size) return 'intervalo fora dos limites';
      for (let i = begin; i <= end; i++) vector.marks.set(i, 'discarded');
      return null;
    }
    case 'VECTOR_PIVOT': {
      if (index === -1) {
        vector.pivot = null;
      } else if (isIndex(index, size)) {
        vector.pivot = index;
      } else {
        return 'pivô fora do intervalo';
      }
      remember();
      return null;
    }
    case 'VECTOR_RESET': {
      vector.marks.clear();
      vector.range = null;
      vector.pivot = null;
      vector.operation = null;
      vector.caption = '';
      return null;
    }
    case 'VECTOR_STEP': {
      remember();
      vector.clearOnNext = true;
      return null;
    }
    case 'VECTOR_RESULT': {
      const values = data?.values;
      if (!isNumberArray(values)) return 'values inválido';
      if (data?.value_labels !== undefined && !isLabelArray(data.value_labels, size)) return 'rótulos inválidos';
      if (isLabelArray(data?.value_labels, size)) vector.labels = [...data.value_labels];
      vector.result = [...values];
      vector.operation = null;
      vector.range = null;
      vector.pivot = null;
      remember();
      const same =
        values.length === vector.values.length && values.every((value, i) => value === vector.values[i]);
      return same ? null : 'resultado diverge do estado reconstruído';
    }
    default:
      return `evento desconhecido: ${step.step_event}`;
  }
}

function itemState(vector: WorkingVector, index: number): VectorElementState {
  const mark = vector.marks.get(index);
  if (mark === 'found' || mark === 'sorted') return mark;
  const operation = vector.operation;
  if (operation?.kind === 'swap' && (operation.a === index || operation.b === index)) return 'swapping';
  if (operation?.kind === 'compare' && (operation.a === index || operation.b === index)) return 'comparing';
  if (operation?.kind === 'probe' && operation.index === index) return 'comparing';
  if (operation?.kind === 'set' && operation.index === index) return 'active';
  if (vector.pivot === index) return 'pivot';
  if (mark) return mark;
  if (vector.range && index >= vector.range.start && index <= vector.range.end) return 'active';
  return 'default';
}

export function createVectorReplay(steps: TraceStep[]) {
  let previous = -1;
  const vectors = new Map<string, WorkingVector>();
  const issues: VectorIssue[] = [];
  let activeScope: Set<string> | null = null;
  return (eventIndex: number): VectorsState => {
    if (eventIndex < previous) { vectors.clear(); issues.length = 0; previous = -1; activeScope = null; }
    const last = Math.min(eventIndex, steps.length - 1);

    for (let i = previous + 1; i <= last; i++) {
      const step = steps[i];
      if (step.step_event === 'VARIABLE_END' && typeof step.data?.name === 'string') {
        vectors.delete(step.data.name);
        continue;
      }
      if (step.step_event === 'FRAME_SCOPE' && Array.isArray(step.data?.names)) {
        activeScope = new Set(step.data.names.map(String));
        continue;
      }
      if (step.step_event === 'STEP') {
        if (step.data?.line === 0 && step.data?.caption?.startsWith('Execução concluída')) activeScope = null;
        vectors.forEach((vector) => {
          vector.clearOnNext = true;
        });
        continue;
      }
      if (!step.step_event.startsWith('VECTOR_') || step.step_event === 'VECTOR_META') continue;
      const reason = applyEvent(vectors, step);
      if (reason) issues.push({ event: i, step_event: step.step_event, reason });
      else if (step.step_event === 'VECTOR_INIT') activeScope?.add(String(step.data?.name));
    }

    const snapshots: VectorSnapshot[] = Array.from(vectors, ([name, vector]) => ({
      name,
      initial: vector.initial,
      items: vector.values.map((value, index) => ({ index, value, state: itemState(vector, index), ...(vector.labels[index] !== null ? { displayValue: vector.labels[index]! } : {}) })),
      operation: vector.operation,
      range: vector.range,
      pivot: vector.pivot,
      caption: vector.caption,
      result: vector.result,
    }));

    previous = last;
    return { vectors: snapshots.filter(vector => activeScope === null || activeScope.has(vector.name)), issues: [...issues] };
  };
}

export function buildVectorsState(steps: TraceStep[], eventIndex: number): VectorsState {
  return createVectorReplay(steps)(eventIndex);
}
