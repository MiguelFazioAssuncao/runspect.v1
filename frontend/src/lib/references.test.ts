import { describe, expect, it } from 'vitest';
import { referenceLayers, referenceSnapshot } from './references';
import { createTraceReplay } from './traceState';
import { traceVisualizationKeys } from './visualizationSelection';
import type { TraceStep } from '@/types/visualizer';

const initial = {
  roots: [{ name: 'head', target: 1 }],
  objects: [
    { id: 1, type: 'Node', status: 'observed', fields: [{ name: 'value', value: '4' }, { name: 'next', value: '@2', target: 2 }] },
    { id: 2, type: 'Node', status: 'observed', fields: [{ name: 'next', value: '@1', target: 1 }] },
  ],
};

describe('objects and pointer replay', () => {
  it('validates imported IDs, duplicate objects, roots and fields', () => {
    const snapshot = referenceSnapshot({
      roots: [null, { name: 'p', target: -1 }],
      objects: [null, { id: -1 }, ...initial.objects, initial.objects[0], { id: 3, fields: [null, { name: 'x', value: '1', target: 'invalid' }] }],
    });
    expect(snapshot.objects.map(object => object.id)).toEqual([1, 2, 3]);
    expect(snapshot.roots).toEqual([{ name: 'p', target: null }]);
    expect(snapshot.objects[2].fields).toEqual([{ name: 'x', value: '1', target: null, changed: true }]);
  });

  it('terminates for cycles, self references, shared children and disconnected objects', () => {
    const snapshot = referenceSnapshot(initial);
    snapshot.objects.push({ id: 3, type: 'Node', status: 'observed', fields: [{ name: 'self', value: '@3', target: 3 }] });
    expect([...referenceLayers(snapshot)]).toEqual([[1, 0], [2, 1], [3, 0]]);
  });

  it('marks changed values, targets and released memory', () => {
    const before = referenceSnapshot(initial);
    expect(referenceSnapshot(initial, before).objects.every(object => !object.changed)).toBe(true);
    const after = referenceSnapshot({ ...initial, objects: [{ ...initial.objects[0], fields: [{ name: 'next', value: 'nullptr', target: null }] }, { id: 2, status: 'released' }] }, before);
    expect(after.objects[0].fields[0].changed).toBe(true);
    expect(after.objects[1].status).toBe('released');
    expect(after.objects[1].changed).toBe(true);
  });

  it('restores references when seeking backward and clearing the snapshot', () => {
    const steps: TraceStep[] = [
      { step: 0, step_event: 'SET_REFERENCES', data: initial },
      { step: 1, step_event: 'STEP', data: {} },
      { step: 2, step_event: 'SET_REFERENCES', data: { roots: [], objects: [] } },
    ];
    const replay = createTraceReplay(steps);
    expect(replay(2).references?.objects).toEqual([]);
    expect(replay(0).references?.objects.map(object => object.id)).toEqual([1, 2]);
    expect(replay(-1).references).toBeUndefined();
    expect(traceVisualizationKeys(steps)).toContain('references');
  });
});
