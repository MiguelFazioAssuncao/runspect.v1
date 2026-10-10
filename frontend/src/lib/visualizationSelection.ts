import type { CallFrame, MatrixSnapshot, StructureSnapshot } from './structureViews';
import type { TraceStep } from '@/types/visualizer';

export const VISUALIZATION_OPTIONS = [
  { key: 'graph', label: 'Grafo', description: 'Vértices, arestas e caminhos.' },
  { key: 'vectors', label: 'Vetores', description: 'Valores, comparações e ordenação.' },
  { key: 'structures', label: 'Variáveis e estruturas', description: 'Variáveis, filas, pilhas, mapas e conjuntos.' },
  { key: 'matrices', label: 'Matrizes e DP', description: 'Células e dependências entre valores.' },
  { key: 'calls', label: 'Chamadas de funções', description: 'Árvore e pilha de chamadas, incluindo recursão.' },
  { key: 'output', label: 'Saída do programa', description: 'Texto impresso pelo programa na visualização.' },
  { key: 'analysis', label: 'Análise do grafo', description: 'Propriedades e métricas do grafo.' },
  { key: 'legend', label: 'Legenda do grafo', description: 'Significado das cores dos vértices.' },
] as const;

export type VisualizationKey = (typeof VISUALIZATION_OPTIONS)[number]['key'];
export type VisualizationSelection = Record<VisualizationKey, boolean>;

export function availableVisualizationKeys(capabilities: readonly string[]): VisualizationKey[] {
  const keys = new Set(capabilities);
  if (keys.has('graph')) { keys.add('analysis'); keys.add('legend'); }
  else { keys.delete('analysis'); keys.delete('legend'); }
  return VISUALIZATION_OPTIONS.filter(option => keys.has(option.key)).map(option => option.key);
}

export function constrainVisualizationSelection(selection: VisualizationSelection, available: readonly VisualizationKey[]): VisualizationSelection {
  const allowed = new Set(available);
  const next = Object.fromEntries(VISUALIZATION_OPTIONS.map(option => [option.key, allowed.has(option.key) && selection[option.key]])) as VisualizationSelection;
  // When switching to another kind of algorithm, start with one supported panel.
  // An intentional terminal-only choice remains terminal-only.
  if (Object.values(selection).some(Boolean) && !Object.values(next).some(Boolean) && available.length) next[available[0]] = true;
  if (!next.graph) next.legend = false;
  return next;
}

export function traceVisualizationKeys(steps: readonly TraceStep[], output = ''): VisualizationKey[] {
  const capabilities = new Set<string>();
  if (output) capabilities.add('output');
  for (const step of steps) {
    if (step.step_event === 'ADD_NODE' || step.step_event === 'ADD_EDGE') capabilities.add('graph');
    if (step.step_event === 'VECTOR_INIT') capabilities.add('vectors');
    if (step.step_event === 'SET_MATRIX') capabilities.add('matrices');
    if (step.step_event === 'SET_STRUCT' && step.data?.name !== 'Execução' && (step.data?.name !== 'Variáveis' || !!step.data?.items?.length)) capabilities.add('structures');
    if (step.step_event === 'UNINITIALIZED' && step.data?.initialized === false) capabilities.add('structures');
    if (step.step_event === 'CALL_ENTER' && (step.data?.parent != null || step.data?.function !== 'main')) capabilities.add('calls');
    if ((step.step_event === 'PROGRAM_OUTPUT' && !!step.data?.text) || step.step_event === 'INPUT_ERROR') capabilities.add('output');
  }
  return availableVisualizationKeys([...capabilities]);
}

export const DEFAULT_VISUALIZATION_SELECTION: VisualizationSelection = {
  graph: true, vectors: false, structures: false, matrices: false,
  calls: false, output: false, analysis: false, legend: false,
};

export function visualizationSelectionLabel(selection: VisualizationSelection): string {
  const labels = VISUALIZATION_OPTIONS.filter(option => selection[option.key]).map(option => option.label);
  return labels.length ? labels.join(' · ') : 'Somente terminal';
}

export function selectVisualizationContent(player: {
  graphState: { nodes: unknown[] };
  vectors: unknown[];
  structs: StructureSnapshot[];
  matrices: MatrixSnapshot[];
  calls: CallFrame[];
  programConsole: { output: string; warnings: string[] };
}, selection: VisualizationSelection) {
  const structs = selection.structures ? player.structs.filter(struct => struct.name !== 'Execução' && (struct.name !== 'Variáveis' || struct.items.length > 0)) : [];
  const matrices = selection.matrices ? player.matrices : [];
  const calls = selection.calls ? player.calls : [];
  const hasGraph = selection.graph && player.graphState.nodes.length > 0;
  const hasVectors = selection.vectors && player.vectors.length > 0;
  const hasStructs = structs.length > 0 || matrices.length > 0 || calls.length > 0;
  const hasAnalysis = selection.analysis && player.graphState.nodes.length > 0;
  const hasConsole = selection.output && (!!player.programConsole.output || player.programConsole.warnings.length > 0);
  return {
    structs, matrices, calls, hasGraph, hasVectors, hasStructs, hasAnalysis, hasConsole,
    hasVisualization: hasGraph || hasVectors || hasStructs,
    hasContent: hasGraph || hasVectors || hasStructs || hasAnalysis || hasConsole,
  };
}
