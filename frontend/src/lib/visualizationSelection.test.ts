import { describe, expect, it } from 'vitest';
import { availableVisualizationKeys, constrainVisualizationSelection, DEFAULT_VISUALIZATION_SELECTION, selectVisualizationContent, traceVisualizationKeys, visualizationSelectionLabel } from './visualizationSelection';

const player = {
  graphState: { nodes: [{ id: 1 }] }, vectors: [{ name: 'a' }],
  structs: [{ name: 'fila', items: ['1'] }, { name: 'Execução', items: ['linha 1'] }],
  matrices: [{ name: 'dp', rows: [['0', '1']] }],
  calls: [{ id: 1, function: 'main', depth: 0, line: 1, status: 'active' as const }],
  programConsole: { output: '42\n', warnings: [] },
};
const none = Object.fromEntries(Object.keys(DEFAULT_VISUALIZATION_SELECTION).map(key => [key, false])) as typeof DEFAULT_VISUALIZATION_SELECTION;

describe('visualization selection', () => {
  it('offers graph analysis and legend only when a graph is supported', () => {
    expect(availableVisualizationKeys(['vectors', 'output', 'unknown', 'analysis'])).toEqual(['vectors', 'output']);
    expect(availableVisualizationKeys(['graph'])).toEqual(['graph', 'analysis', 'legend']);
  });
  it('switches to a supported panel when changing algorithms and preserves terminal-only choices', () => {
    const selection = constrainVisualizationSelection(DEFAULT_VISUALIZATION_SELECTION, ['vectors', 'output']);
    expect(selection).toEqual({ ...none, vectors: true });
    expect(constrainVisualizationSelection(none, ['vectors'])).toEqual(none);
    expect(constrainVisualizationSelection(DEFAULT_VISUALIZATION_SELECTION, [])).toEqual(none);
  });
  it('uses all frames of the current trace instead of the current code or frame', () => {
    expect(traceVisualizationKeys([
      { step: 0, step_event: 'CALL_ENTER', data: { function: 'main', parent: null } },
      { step: 1, step_event: 'SET_STRUCT', data: { name: 'Execução', items: ['pronto'] } },
      { step: 2, step_event: 'VECTOR_INIT', data: { name: 'a', values: [1] } },
      { step: 3, step_event: 'SET_MATRIX', data: { name: 'dp', rows: [['0']] } },
    ])).toEqual(['vectors', 'matrices']);
    expect(traceVisualizationKeys([], 'manual stdout')).toEqual(['output']);
  });
  it('starts with a single graph panel and hides all extra trace data', () => {
    const content = selectVisualizationContent(player, DEFAULT_VISUALIZATION_SELECTION);
    expect(content).toMatchObject({ hasGraph: true, hasVectors: false, hasStructs: false, hasConsole: false, hasAnalysis: false, structs: [], matrices: [], calls: [] });
    expect(visualizationSelectionLabel(DEFAULT_VISUALIZATION_SELECTION)).toBe('Grafo');
  });
  it('selects matrices and calls independently of variables and graph data', () => {
    expect(selectVisualizationContent(player, { ...none, matrices: true })).toMatchObject({ hasGraph: false, hasStructs: true, structs: [], matrices: player.matrices, calls: [] });
    expect(selectVisualizationContent(player, { ...none, calls: true })).toMatchObject({ hasGraph: false, structs: [], matrices: [], calls: player.calls });
    expect(selectVisualizationContent(player, { ...none, structures: true }).structs.map(struct => struct.name)).toEqual(['fila']);
    expect(player.structs).toHaveLength(2);
  });
  it('keeps analysis and program output available without displaying a graph', () => {
    expect(selectVisualizationContent(player, { ...none, analysis: true })).toMatchObject({ hasGraph: false, hasAnalysis: true, hasContent: true });
    expect(selectVisualizationContent(player, { ...none, output: true })).toMatchObject({ hasGraph: false, hasConsole: true, hasContent: true });
  });
  it('permits execution with only the terminal and reports an empty selection', () => {
    expect(selectVisualizationContent(player, none).hasContent).toBe(false);
    expect(visualizationSelectionLabel(none)).toBe('Somente terminal');
    expect(selectVisualizationContent({ ...player, graphState: { nodes: [] } }, DEFAULT_VISUALIZATION_SELECTION).hasContent).toBe(false);
  });
});
