/** Typed display metadata is optional so saved traces from earlier versions replay. */
export interface StructureChange {
  index: number;
  key?: string;
  before?: string;
  after?: string;
  kind: 'inserted' | 'removed' | 'changed' | 'compared';
}

export interface StructureSnapshot {
  name: string;
  items: string[];
  kind?: string;
  size?: number;
  initialized?: boolean;
  truncated?: number | boolean;
  opaque?: boolean;
  changes?: StructureChange[];
}

export interface MatrixCell {
  name?: string;
  row: number;
  col: number;
}

export interface MatrixSnapshot {
  name: string;
  rows: string[][];
  kind?: string;
  size?: number | { rows: number; cols: number };
  shape?: { rows: number; cols: number };
  initialized?: boolean;
  truncated?: number | boolean;
  changes?: StructureChange[];
  active?: MatrixCell & { access?: 'read' | 'write' };
  dependencies?: MatrixCell[];
}

export interface CallFrame {
  id: number;
  parent?: number | null;
  function: string;
  depth: number;
  line: number;
  status: 'active' | 'returned';
}

export type StructureView = 'items' | 'set' | 'map' | 'record' | 'sequence' | 'stack' | 'queue' | 'deque' | 'priority' | 'union-find' | 'binary-tree' | 'string' | 'bits';

export const STRUCTURE_PAGE_SIZE = 32;
export const MATRIX_PAGE_ROWS = 4;
export const MATRIX_PAGE_COLUMNS = 8;

export const STRUCTURE_VIEWS: { value: StructureView; label: string }[] = [
  { value: 'items', label: 'Elementos' },
  { value: 'set', label: 'Conjunto' },
  { value: 'map', label: 'Mapa: chave → valor' },
  { value: 'record', label: 'Pair / tuple' },
  { value: 'sequence', label: 'Vetor com índices' },
  { value: 'stack', label: 'Pilha' },
  { value: 'queue', label: 'Fila' },
  { value: 'deque', label: 'Deque' },
  { value: 'priority', label: 'Fila de prioridade' },
  { value: 'union-find', label: 'Union-find' },
  { value: 'binary-tree', label: 'Árvore binária (índices de heap)' },
  { value: 'string', label: 'String' },
  { value: 'bits', label: 'Bits' },
];

export function inferStructureView(structure: Pick<StructureSnapshot, 'kind'>): StructureView {
  const kind = structure.kind?.toLowerCase().replaceAll('_', '-').trim() ?? '';
  if (kind === 'union-find' || kind === 'disjoint-set') return 'union-find';
  if (kind === 'binary-tree' || kind === 'tree') return 'binary-tree';
  if (kind === 'bitset') return 'bits';
  if (kind.includes('map')) return 'map';
  if (kind.includes('set')) return 'set';
  if (kind === 'pair' || kind === 'tuple') return 'record';
  if (kind.includes('priority-queue')) return 'priority';
  if (kind === 'stack') return 'stack';
  if (kind === 'queue') return 'queue';
  if (kind === 'deque') return 'deque';
  if (kind === 'string') return 'string';
  if (kind.includes('vector') || kind === 'array' || kind === 'list') return 'sequence';
  return 'items';
}

/** Find a delimiter outside nested pairs/tuples and quoted string values. */
function splitOutside(value: string, delimiters: string[]): [string, string] | null {
  let depth = 0;
  let quote = '';
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) depth--;
    if (depth !== 0) continue;
    const delimiter = delimiters.find(candidate => value.startsWith(candidate, i));
    if (delimiter) return [value.slice(0, i).trim(), value.slice(i + delimiter.length).trim()];
  }
  return null;
}

export function mapEntry(item: string, index: number): { key: string; value: string } {
  const split = splitOutside(item, [' → ', ' -> ', ' = ']);
  return split ? { key: split[0], value: split[1] } : { key: String(index), value: item };
}

export function recordEntry(item: string, index: number, kind?: string): { key: string; value: string } {
  const split = splitOutside(item, [' = ']);
  if (split) return { key: split[0], value: split[1] };
  return { key: kind === 'pair' ? (index === 0 ? 'first' : 'second') : String(index), value: item };
}

export function pairFields(item: string): [string, string] | null {
  const text = item.trim();
  if (!text.startsWith('(') || !text.endsWith(')')) return null;
  return splitOutside(text.slice(1, -1), [', ' , ',']);
}

function keyedItems(items: string[], kind?: string) {
  const counts = new Map<string, number>();
  const view = inferStructureView({ kind });
  return items.map((item, index) => {
    const identity = view === 'map' ? mapEntry(item, index).key : item;
    const occurrence = counts.get(identity) ?? 0;
    counts.set(identity, occurrence + 1);
    return { key: `${identity}\u0000${occurrence}`, identity, item, index };
  });
}

export function diffStructureItems(previous: string[], next: string[], kind?: string): StructureChange[] {
  const view = inferStructureView({ kind });
  if (view === 'map' || view === 'set') {
    const before = new Map(keyedItems(previous, kind).map(item => [item.key, item]));
    const after = new Map(keyedItems(next, kind).map(item => [item.key, item]));
    const changes: StructureChange[] = [];
    after.forEach((item, key) => {
      const old = before.get(key);
      if (!old) changes.push({ index: item.index, key: item.identity, after: item.item, kind: 'inserted' });
      else if (old.item !== item.item) changes.push({ index: item.index, key: item.identity, before: old.item, after: item.item, kind: 'changed' });
    });
    before.forEach((item, key) => {
      if (!after.has(key)) changes.push({ index: item.index, key: item.identity, before: item.item, kind: 'removed' });
    });
    return changes;
  }
  const changes: StructureChange[] = [];
  for (let index = 0; index < Math.max(previous.length, next.length); index++) {
    if (index >= previous.length) changes.push({ index, after: next[index], kind: 'inserted' });
    else if (index >= next.length) changes.push({ index, before: previous[index], kind: 'removed' });
    else if (previous[index] !== next[index]) changes.push({ index, before: previous[index], after: next[index], kind: 'changed' });
  }
  return changes;
}

export function structureSize(structure: StructureSnapshot): number {
  if (typeof structure.size === 'number' && Number.isFinite(structure.size)) return Math.max(structure.items.length, Math.floor(structure.size));
  return structure.items.length + (typeof structure.truncated === 'number' ? Math.max(0, Math.floor(structure.truncated)) : 0);
}

export function matrixShape(matrix: MatrixSnapshot): { rows: number; cols: number } {
  const captured = { rows: matrix.rows.length, cols: Math.max(0, ...matrix.rows.map(row => row.length)) };
  const declared = matrix.shape ?? (typeof matrix.size === 'object' ? matrix.size : undefined);
  return {
    rows: Math.max(captured.rows, Number.isFinite(declared?.rows) ? declared!.rows : 0),
    cols: Math.max(captured.cols, Number.isFinite(declared?.cols) ? declared!.cols : 0),
  };
}

export interface TreeItem {
  index: number;
  value: string;
  parent: number | null;
  root: number;
  depth: number;
}

/** Accept only valid parent arrays; variable names alone never imply DSU. */
export function parentForest(items: string[]): TreeItem[] | null {
  const parents = items.map(item => /^-?\d+$/.test(item.trim()) ? Number(item) : NaN);
  if (parents.some(parent => !Number.isSafeInteger(parent) || parent >= items.length)) return null;
  const trees: TreeItem[] = [];
  for (let index = 0; index < items.length; index++) {
    const seen = new Set<number>();
    let root = index;
    let depth = 0;
    while (parents[root] >= 0 && parents[root] !== root) {
      if (seen.has(root)) return null;
      seen.add(root);
      root = parents[root];
      depth++;
    }
    trees.push({ index, value: items[index], parent: parents[index] < 0 || parents[index] === index ? null : parents[index], root, depth });
  }
  return trees;
}

export function binaryTree(items: string[]): TreeItem[] {
  const nullValues = new Set(['null', 'nullptr', '∅']);
  return items.flatMap((value, index) => {
    if (nullValues.has(value.trim())) return [];
    const parent = index ? Math.floor((index - 1) / 2) : null;
    return [{ index, value, parent: parent !== null && !nullValues.has(items[parent]?.trim()) ? parent : null, root: 0, depth: Math.floor(Math.log2(index + 1)) }];
  });
}

export const CHANGE_LABELS: Record<StructureChange['kind'], { symbol: string; label: string }> = {
  inserted: { symbol: '+', label: 'inserido' },
  removed: { symbol: '−', label: 'removido' },
  changed: { symbol: '↻', label: 'alterado' },
  compared: { symbol: '≟', label: 'comparado' },
};
