export interface ReferenceField {
  name: string;
  value: string;
  target?: number | null;
  changed?: boolean;
}

export interface ReferenceObject {
  id: number;
  type: string;
  status: 'observed' | 'unobserved' | 'released';
  fields: ReferenceField[];
  changed?: boolean;
}

export interface ReferenceSnapshot {
  roots: { name: string; target: number | null }[];
  objects: ReferenceObject[];
}

const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const id = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const target = (value: unknown): number | null => id(value) ? value : null;
const CAPTURE_LIMIT = 2048;

/** Validate imported traces too; old traces simply have no reference snapshot. */
export function referenceSnapshot(data: Record<string, unknown>, previous?: ReferenceSnapshot): ReferenceSnapshot {
  const old = new Map(previous?.objects.map(value => [value.id, value]));
  const seen = new Set<number>();
  const objects: ReferenceObject[] = [];
  for (const value of Array.isArray(data.objects) ? data.objects.slice(0, CAPTURE_LIMIT) : []) {
    const item = object(value);
    if (!item || !id(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    const before = old.get(item.id);
    const oldFields = new Map(before?.fields.map(field => [field.name, field]));
    const fields: ReferenceField[] = [];
    for (const value of Array.isArray(item.fields) ? item.fields.slice(0, CAPTURE_LIMIT) : []) {
      const field = object(value);
      if (!field || typeof field.name !== 'string' || typeof field.value !== 'string') continue;
      const link = Object.hasOwn(field, 'target') ? { target: target(field.target) } : {};
      const before = oldFields.get(field.name);
      fields.push({ name: field.name, value: field.value, ...link, changed: !before || before.value !== field.value || before.target !== link.target });
    }
    const status = item.status === 'released' || item.status === 'unobserved' ? item.status : 'observed';
    objects.push({ id: item.id, type: typeof item.type === 'string' ? item.type : 'objeto', status, fields, changed: !before || before.status !== status || fields.some(field => field.changed) });
  }
  const roots = (Array.isArray(data.roots) ? data.roots.slice(0, CAPTURE_LIMIT) : []).flatMap(value => {
    const root = object(value);
    return root && typeof root.name === 'string' ? [{ name: root.name, target: target(root.target) }] : [];
  });
  return { objects, roots };
}

/** Breadth-first layers terminate even for circular lists and shared children. */
export function referenceLayers(snapshot: ReferenceSnapshot): Map<number, number> {
  const objects = new Map(snapshot.objects.map(value => [value.id, value]));
  const linked = new Set(snapshot.objects.flatMap(value => value.fields.flatMap(field => field.target ? [field.target] : [])));
  const layers = new Map<number, number>();
  const visit = (root: number) => {
    const pending: [number, number][] = [[root, 0]];
    for (let i = 0; i < pending.length; i++) {
      const [id, depth] = pending[i];
      if (layers.has(id) || !objects.has(id)) continue;
      layers.set(id, depth);
      for (const field of objects.get(id)!.fields) if (field.target && !layers.has(field.target)) pending.push([field.target, depth + 1]);
    }
  };
  snapshot.roots.forEach(root => { if (root.target) visit(root.target); });
  snapshot.objects.forEach(value => { if (!linked.has(value.id)) visit(value.id); });
  snapshot.objects.forEach(value => visit(value.id));
  return layers;
}
