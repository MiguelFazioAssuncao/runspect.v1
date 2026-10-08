'use client';

import React from 'react';
import type { GraphAnalysis } from '@/lib/graphAnalysis';

interface GraphAnalysisPanelProps {
  analysis: GraphAnalysis | null;
  flowSummary?: { flow: number; cost: number } | null;
}

export const GraphAnalysisPanel: React.FC<GraphAnalysisPanelProps> = ({ analysis, flowSummary }) => {
  if (!analysis) return null;
  const rows = [
    ['Vértices', analysis.nodeCount],
    ['Arestas', analysis.edgeCount],
    ['Componentes', analysis.componentCount],
    ['Grau máximo', analysis.maxDegree],
    ['Densidade', `${(analysis.density * 100).toFixed(0)}%`],
    ['Conectado', analysis.connected ? 'sim' : 'não'],
    ['Conect. fraca', analysis.weaklyConnected ? 'sim' : 'não'],
    ['Conect. forte', analysis.stronglyConnected ? 'sim' : 'não'],
    ['Comp. fortes', analysis.stronglyConnectedComponents],
    ['Bipartido', analysis.bipartite ? 'sim' : 'não'],
    ['Cíclico', analysis.cyclic ? 'sim' : 'não'],
    ['Árvore', analysis.tree ? 'sim' : 'não'],
    ['Floresta', analysis.forest ? 'sim' : 'não'],
    ['Ciclo negativo', analysis.hasNegativeCycle ? 'sim' : 'não'],
    ['Pontes', analysis.bridgeCount],
    ['Articulações', analysis.articulationPointCount],
    ['Euleriano', analysis.eulerian === 'none' ? 'não' : analysis.eulerian],
    ['Matching', analysis.matchingPairs.length],
    ['Coloração', analysis.coloringCount],
    ['Topológico', analysis.topologicalCycle ? 'ciclo' : analysis.topologicalOrder.length ? 'válido' : 'n/a'],
    ['Completo', analysis.complete ? 'sim' : 'não'],
    ['Hamiltoniano', analysis.hamiltonianPath === null ? 'grande demais' : analysis.hamiltonianPath ? 'caminho' : 'não'],
    ['Ciclo Hamiltoniano', analysis.hamiltonianCycle === null ? 'grande demais' : analysis.hamiltonianCycle ? 'sim' : 'não'],
  ];
  const advancedRows = [
    ['Planaridade', analysis.planarity],
    ['Clique máxima', analysis.maxClique.length],
    ['Independente', analysis.independentSet.length],
    ['Dominante', analysis.dominatingSet.length],
    ['Matching ponderado', analysis.weightedMatchingPairs.length],
    ['Min-cut', analysis.minCutValue === null ? 'n/a' : analysis.minCutValue],
  ];

  return (
    <section className="graph-analysis" aria-label="Análise do grafo">
      <div className="graph-analysis-title">análise do grafo</div>
      <div className="graph-analysis-grid">
        {rows.map(([label, value]) => (
          <div className="graph-analysis-item" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <details className="graph-analysis-advanced">
        <summary>análises avançadas</summary>
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
      </details>
      {flowSummary && (
        <div className="graph-analysis-detail">
          fluxo enviado: {flowSummary.flow} · custo total: {flowSummary.cost}
        </div>
      )}
      {analysis.minCutSide.length > 0 && (
        <div className="graph-analysis-detail">
          corte S: {analysis.minCutSide.join(', ')} · T: {analysis.nodeCount - analysis.minCutSide.length} vértices
        </div>
      )}
      {analysis.matchingPairs.length > 0 && (
        <div className="graph-analysis-detail">
          pares: {analysis.matchingPairs.map(([left, right]) => `${left}—${right}`).join(', ')}
        </div>
      )}
      {analysis.topologicalOrder.length > 0 && !analysis.topologicalCycle && (
        <div className="graph-analysis-detail">
          ordem: {analysis.topologicalOrder.join(' → ')}
        </div>
      )}
    </section>
  );
};
