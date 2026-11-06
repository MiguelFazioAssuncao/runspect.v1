'use client';

import React from 'react';
import { ResizablePanel } from '@/components/workspace/ResizablePanel';
import type { GraphAnalysis } from '@/lib/graphAnalysis';
import { useLocale } from '@/lib/i18n';

interface GraphAnalysisPanelProps {
  analysis: GraphAnalysis | null;
  flowSummary?: { flow: number; cost: number } | null;
}

export const GraphAnalysisPanel: React.FC<GraphAnalysisPanelProps> = ({ analysis, flowSummary }) => {
  const { tr } = useLocale();
  if (!analysis) return null;
  const yes = tr('sim', 'yes');
  const no = tr('não', 'no');
  const rows = [
    [tr('Vértices', 'Vertices'), analysis.nodeCount],
    [tr('Arestas', 'Edges'), analysis.edgeCount],
    [tr('Componentes', 'Components'), analysis.componentCount],
    [tr('Grau máximo', 'Max degree'), analysis.maxDegree],
    [tr('Densidade', 'Density'), `${(analysis.density * 100).toFixed(0)}%`],
    [tr('Conectado', 'Connected'), analysis.connected ? yes : no],
    [tr('Conect. fraca', 'Weakly conn.'), analysis.weaklyConnected ? yes : no],
    [tr('Conect. forte', 'Strongly conn.'), analysis.stronglyConnected ? yes : no],
    [tr('Comp. fortes', 'SCC count'), analysis.stronglyConnectedComponents],
    [tr('Bipartido', 'Bipartite'), analysis.bipartite ? yes : no],
    [tr('Cíclico', 'Cyclic'), analysis.cyclic ? yes : no],
    [tr('Árvore', 'Tree'), analysis.tree ? yes : no],
    [tr('Floresta', 'Forest'), analysis.forest ? yes : no],
    [tr('Ciclo negativo', 'Negative cycle'), analysis.hasNegativeCycle ? yes : no],
    [tr('Pontes', 'Bridges'), analysis.bridgeCount],
    [tr('Articulações', 'Cut vertices'), analysis.articulationPointCount],
    [tr('Euleriano', 'Eulerian'), analysis.eulerian === 'none' ? no : analysis.eulerian],
    ['Matching', analysis.matchingPairs.length],
    [tr('Coloração', 'Coloring'), analysis.coloringCount],
    [tr('Topológico', 'Topological'), analysis.topologicalCycle ? tr('ciclo', 'cycle') : analysis.topologicalOrder.length ? tr('válido', 'valid') : 'n/a'],
    [tr('Completo', 'Complete'), analysis.complete ? yes : no],
    [tr('Hamiltoniano', 'Hamiltonian'), analysis.hamiltonianPath === null ? tr('grande demais', 'too large') : analysis.hamiltonianPath ? tr('caminho', 'path') : no],
    [tr('Ciclo Hamiltoniano', 'Hamiltonian cycle'), analysis.hamiltonianCycle === null ? tr('grande demais', 'too large') : analysis.hamiltonianCycle ? yes : no],
  ];
  const advancedRows = [
    [tr('Planaridade', 'Planarity'), analysis.planarity],
    [tr('Clique máxima', 'Max clique'), analysis.maxClique.length],
    [tr('Independente', 'Independent set'), analysis.independentSet.length],
    [tr('Dominante', 'Dominating set'), analysis.dominatingSet.length],
    [tr('Matching ponderado', 'Weighted matching'), analysis.weightedMatchingPairs.length],
    ['Min-cut', analysis.minCutValue === null ? 'n/a' : analysis.minCutValue],
  ];

  return (
    <ResizablePanel title="Análise do grafo" className="analysis-workspace">
    <section className="graph-analysis" aria-label={tr('Análise do grafo', 'Graph analysis')}>
      <div className="graph-analysis-title">{tr('análise do grafo', 'graph analysis')}</div>
      <div className="graph-analysis-grid">
        {rows.map(([label, value]) => (
          <div className="graph-analysis-item" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <ResizablePanel title="Análises avançadas" defaultCollapsed>
      <div className="graph-analysis-advanced">
        {analysis.advancedAnalysisSkipped ? (
          <p className="graph-analysis-note">{analysis.advancedAnalysisReason}</p>
        ) : (
          <div className="graph-analysis-grid">
            {advancedRows.map(([label, value]) => (
              <div className="graph-analysis-item" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
      </ResizablePanel>
      {flowSummary && (
        <div className="graph-analysis-detail">
          {tr('fluxo enviado', 'flow sent')}: {flowSummary.flow} · {tr('custo total', 'total cost')}: {flowSummary.cost}
        </div>
      )}
      {analysis.minCutSide.length > 0 && (
        <div className="graph-analysis-detail">
          {tr('corte S', 'cut S')}: {analysis.minCutSide.join(', ')} · T: {analysis.nodeCount - analysis.minCutSide.length} {tr('vértices', 'vertices')}
        </div>
      )}
      {analysis.matchingPairs.length > 0 && (
        <div className="graph-analysis-detail">
          {tr('pares', 'pairs')}: {analysis.matchingPairs.map(([left, right]) => `${left}-${right}`).join(', ')}
        </div>
      )}
      {analysis.topologicalOrder.length > 0 && !analysis.topologicalCycle && (
        <div className="graph-analysis-detail">
          {tr('ordem', 'order')}: {analysis.topologicalOrder.join(' -> ')}
        </div>
      )}
    </section>
    </ResizablePanel>
  );
};
