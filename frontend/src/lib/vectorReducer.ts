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

const isElementState = (value: unknown): value is VectorElementState =>
  typeof value === 'string' && (VECTOR_ELEMENT_STATES as readonly string[]).includes(value);

const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');

function createVector(values: number[]): WorkingVector {
  return {
    initial: [...values],
    values: [...values],
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
    vectors.set(name, createVector(values));
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
      vector.result = [...values];
      const same =
        values.length === vector.values.length && values.every((value, i) => value === vector.values[i]);
      return same ? null : 'resultado diverge do estado reconstruído';
    }
    default:
      return `evento desconhecido: ${step.step_event}`;
  }
}

function itemState(vector: WorkingVector, index: number): VectorElementState {
  const operation = vector.operation;
  if (operation?.kind === 'swap' && (operation.a === index || operation.b === index)) return 'swapping';
  if (operation?.kind === 'compare' && (operation.a === index || operation.b === index)) return 'comparing';
  if (operation?.kind === 'probe' && operation.index === index) return 'comparing';
  if (operation?.kind === 'set' && operation.index === index) return 'active';
  if (vector.pivot === index) return 'pivot';
  const mark = vector.marks.get(index);
  if (mark) return mark;
  if (vector.range && index >= vector.range.start && index <= vector.range.end) return 'active';
  return 'default';
}

export function buildVectorsState(steps: TraceStep[], eventIndex: number): VectorsState {
  const vectors = new Map<string, WorkingVector>();
  const issues: VectorIssue[] = [];
  const last = Math.min(eventIndex, steps.length - 1);

  for (let i = 0; i <= last; i++) {
    const step = steps[i];
    if (step.step_event === 'STEP') {
      vectors.forEach((vector) => {
        vector.clearOnNext = true;
      });
      continue;
    }
    if (!step.step_event.startsWith('VECTOR_')) continue;
    const reason = applyEvent(vectors, step);
    if (reason) issues.push({ event: i, step_event: step.step_event, reason });
  }

  const snapshots: VectorSnapshot[] = Array.from(vectors, ([name, vector]) => ({
    name,
    initial: vector.initial,
    items: vector.values.map((value, index) => ({ index, value, state: itemState(vector, index) })),
    operation: vector.operation,
    range: vector.range,
    pivot: vector.pivot,
    caption: vector.caption,
    result: vector.result,
  }));

  return { vectors: snapshots, issues };
}