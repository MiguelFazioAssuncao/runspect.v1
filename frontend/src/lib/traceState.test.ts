import { describe, expect, it } from 'vitest';
import { buildTraceState, createTraceReplay, diffItems } from './traceState';
import type { TraceStep } from '@/types/visualizer';

const events = (...data: [string, TraceStep['data']][]): TraceStep[] => data.map(([step_event, data], step) => ({ step, step_event, data }));
describe('typed trace replay', () => {
  it('preserves metadata, call tree, output, and immutable earlier snapshots on backwards seeks', () => {
    const steps = events(
      ['CALL_ENTER', { id: 1, parent: null, function: 'main', depth: 0, line: 1 }],
      ['SET_STRUCT', { name: 's1', kind: 'set', size: 400, truncated: 398, items: ['1', '3'] }],
      ['VECTOR_META', { name: 'par', kind: 'vector', size: 1, initialized: true, truncated: 0 }],
      ['STEP', { line: 2 }],
      ['SET_STRUCT', { name: 's1', kind: 'set', size: 3, items: ['0', '1', '3'] }],
      ['PROGRAM_OUTPUT', { text: '2\n' }],
      ['CALL_EXIT', { id: 1 }],
      ['STEP', { line: 3 }],
    );
    const replay = createTraceReplay(steps);
    const initial = replay(3);
    const final = replay(7);
    expect(initial.structs[0].size).toBe(400);
    expect(initial.structs[0].items).toEqual(['1', '3']);
    expect(final.structs[0].changes).toEqual([{ index: 0, kind: 'inserted', after: '0' }]);
    expect(final.output).toBe('2\n');
    expect(final.calls[0].status).toBe('returned');
    expect(initial.calls[0].status).toBe('active');
    expect(replay(3)).toEqual(initial);
    expect(initial.vectorMeta.par.size).toBe(1);
  });
  it('keeps real matrix dependencies for the current frame and clears transient accesses next frame', () => {
    const steps = events(
      ['SET_MATRIX', { name: 'dp', rows: [['0', '1'], ['1', '0']], size: 4, shape: { rows: 2, cols: 2 } }],
      ['MATRIX_ACCESS', { name: 'dp', row: 0, col: 1, access: 'read' }],
      ['MATRIX_ACCESS', { name: 'dp', row: 1, col: 1, access: 'write', dependencies: [{ name: 'dp', row: 0, col: 1 }] }],
      ['STEP', { line: 3 }], ['STEP', { line: 4 }],
    );
    const replay = createTraceReplay(steps);
    const active = replay(3);
    expect(active.matrices[0].active).toEqual({ row: 1, col: 1, access: 'write' });
    expect(active.matrices[0].dependencies).toEqual([{ name: 'dp', row: 0, col: 1 }]);
    expect(active.reads).toContain('dp[0][1]');
    expect(active.writes).toContain('dp[1][1]');
    expect(replay(4).matrices[0].active).toBeUndefined();
  });
  it('distinguishes uninitialized, empty and multiset duplicates; map reorder is not a change', () => {
    expect(buildTraceState(events(['UNINITIALIZED', { name: 'n' }])).structs[0].initialized).toBe(false);
    expect(buildTraceState(events(['SET_STRUCT', { name: 's', items: [], size: 0 }])).structs[0].initialized).toBe(true);
    expect(diffItems(['1', '1', '2'], ['1', '2'], true)).toEqual([{ index: 1, kind: 'removed', before: '1' }]);
    expect(diffItems(['a → 1', 'b → 2'], ['b → 3', 'a → 1'], true)).toEqual([{ index: 0, kind: 'changed', before: 'b → 2', after: 'b → 3' }]);
  });
  it('removes out of scope values and clears an uninitialized placeholder once assigned', () => {
    const replay = createTraceReplay(events(
      ['UNINITIALIZED', { name: 'n', initialized: false }],
      ['SET_STRUCT', { name: 'local', items: ['7'] }], ['STEP', {}],
      ['UNINITIALIZED', { name: 'n', initialized: true }],
      ['FRAME_SCOPE', { names: ['n'] }], ['STEP', {}],
    ));
    expect(replay(2).structs.map(s => s.name)).toEqual(['n', 'local']);
    expect(replay(5).structs).toEqual([]);
    expect(replay(2).structs[0].initialized).toBe(false);
  });
  it('retains unchanged caller containers while a callee temporarily hides them', () => {
    const replay = createTraceReplay(events(
      ['SET_STRUCT', { name: 'A', kind: 'vector-pair', items: ['(1, 2)'] }],
      ['FRAME_SCOPE', { names: ['A'] }], ['STEP', {}],
      ['FRAME_SCOPE', { names: ['depth'] }], ['STEP', {}],
      ['FRAME_SCOPE', { names: ['A'] }], ['STEP', {}],
    ));
    expect(replay(2).structs[0].name).toBe('A');
    expect(replay(4).structs).toEqual([]);
    expect(replay(6).structs[0].items).toEqual(['(1, 2)']);
  });
});
