'use client';

import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { GraphNode, GraphEdge } from '@/types/visualizer';

export type GraphLayout = 'force' | 'circular' | 'grid';

type SimulatedNode = GraphNode & {
  x?: number;
  y?: number;
};

type SimulatedEdge = Omit<GraphEdge, 'source' | 'target'> & {
  source: number | SimulatedNode;
  target: number | SimulatedNode;
  bend?: number;
};

type DragEvent = d3.D3DragEvent<SVGGElement, SimulatedNode, SimulatedNode>;

const COMPACT_QUERY = '(max-width: 900px), (pointer: coarse)';

const COLOR_MAP: Record<string, string> = {
  emerald: '#10b981',
  green: '#22c55e',
  orange: '#f97316',
  red: '#ef4444',
  blue: '#3b82f6',
  sky: '#0ea5e9',
  purple: '#a855f7',
  pink: '#ec4899',
  yellow: '#eab308',
  amber: '#f59e0b',
  indigo: '#6366f1',
  slate: '#64748b',
  gray: '#6b7280',
};

const NODE_RADIUS = 22;
const NODE_PADDING = 14;
const ARROW_GAP = 3;
const CURVE_STEP = 60;

const resolveColor = (color?: string, fallback = '#3b82f6'): string => {
  if (!color) return fallback;
  const lower = color.toLowerCase();
  return COLOR_MAP[lower] || color;
};

const nodePosition = (node: number | SimulatedNode) => {
  if (typeof node === 'number') return { x: 0, y: 0 };
  return { x: node.x ?? 0, y: node.y ?? 0 };
};

const nodeIdOf = (node: number | SimulatedNode) => (typeof node === 'number' ? node : node.id);

const edgeGeometry = (edge: SimulatedEdge, directed: boolean) => {
  if (nodeIdOf(edge.source) === nodeIdOf(edge.target)) {
    const p = nodePosition(edge.source);
    return {
      path: `M${p.x - 12},${p.y - 18}C${p.x - 42},${p.y - 70} ${p.x + 42},${p.y - 70} ${p.x + 12},${p.y - 18}`,
      lx: p.x,
      ly: p.y - 62,
    };
  }

  const s = nodePosition(edge.source);
  const t = nodePosition(edge.target);
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  const offset = directed ? NODE_RADIUS + ARROW_GAP : 0;
  const bend = edge.bend ?? 0;

  if (bend === 0) {
    const ex = t.x - (dx / len) * offset;
    const ey = t.y - (dy / len) * offset;
    return {
      path: `M${s.x},${s.y}L${ex},${ey}`,
      lx: (s.x + t.x) / 2,
      ly: (s.y + t.y) / 2 - 6,
    };
  }

  const cx = (s.x + t.x) / 2 + (-dy / len) * bend;
  const cy = (s.y + t.y) / 2 + (dx / len) * bend;
  const cdx = t.x - cx;
  const cdy = t.y - cy;
  const clen = Math.hypot(cdx, cdy) || 1;
  const ex = t.x - (cdx / clen) * offset;
  const ey = t.y - (cdy / clen) * offset;

  return {
    path: `M${s.x},${s.y}Q${cx},${cy} ${ex},${ey}`,
    lx: 0.25 * s.x + 0.5 * cx + 0.25 * t.x,
    ly: 0.25 * s.y + 0.5 * cy + 0.25 * t.y - 4,
  };
};

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  directed?: boolean;
  weighted?: boolean;
  layout?: GraphLayout;
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  nodes,
  edges,
  directed = true,
  weighted = true,
  layout = 'force',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const positionsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const layoutRef = useRef<GraphLayout>(layout);

  useEffect(() => {
    if (!containerRef.current || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    if (nodes.length === 0) {
      svg.selectAll('*').remove();
      return;
    }

    let simulation: d3.Simulation<SimulatedNode, undefined> | undefined;
    let layoutTimer: d3.Timer | undefined;

    const render = () => {
      if (!containerRef.current || !svgRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      if (width < 50 || height < 50) return;

      const interactive = !window.matchMedia(COMPACT_QUERY).matches;

      const layoutChanged = layoutRef.current !== layout;
      layoutRef.current = layout;

      svg.attr('viewBox', `0 0 ${width} ${height}`);
      svg.selectAll('*').remove();

      const nodesCopy: SimulatedNode[] = nodes.map((node, index) => {
        const savedPos = positionsRef.current.get(node.id);
        const startX = savedPos?.x ?? (width / 2 + (index - (nodes.length - 1) / 2) * 90);
        const startY = savedPos?.y ?? height / 2;
        return {
          ...node,
          x: startX,
          y: startY,
        };
      });
      const initialPositions = new Map(
        nodesCopy.map((node) => [node.id, { x: node.x ?? width / 2, y: node.y ?? height / 2 }]),
      );

      const nodeIds = new Set(nodesCopy.map((node) => node.id));

      Array.from(positionsRef.current.keys()).forEach((id) => {
        if (!nodeIds.has(id)) positionsRef.current.delete(id);
      });

      if (layout !== 'force') {
        const count = nodesCopy.length;
        const margin = NODE_RADIUS + NODE_PADDING + 8;

        if (layout === 'circular') {
          const radius = Math.max(0, Math.min(width, height) / 2 - margin);
          nodesCopy.forEach((n, i) => {
            const angle = (2 * Math.PI * i) / count - Math.PI / 2;
            n.x = count === 1 ? width / 2 : width / 2 + radius * Math.cos(angle);
            n.y = count === 1 ? height / 2 : height / 2 + radius * Math.sin(angle);
          });
        } else {
          const cols = Math.ceil(Math.sqrt(count));
          const rows = Math.ceil(count / cols);
          const cellW = (width - 2 * margin) / cols;
          const cellH = (height - 2 * margin) / rows;
          nodesCopy.forEach((n, i) => {
            n.x = margin + cellW * ((i % cols) + 0.5);
            n.y = margin + cellH * (Math.floor(i / cols) + 0.5);
          });
        }

        nodesCopy.forEach((n) => {
          n.fx = n.x;
          n.fy = n.y;
        });
      }

      const validEdges = edges
        .map((edge) => ({
          sourceId: typeof edge.source === 'number' ? edge.source : edge.source.id,
          targetId: typeof edge.target === 'number' ? edge.target : edge.target.id,
          weight: edge.weight,
          color: edge.color,
          highlighted: edge.highlighted,
          style: edge.style,
          label: edge.label,
        }))
        .filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId));

      const groups = new Map<string, number[]>();
      validEdges.forEach((edge, index) => {
        const key = `${Math.min(edge.sourceId, edge.targetId)}-${Math.max(edge.sourceId, edge.targetId)}`;
        const list = groups.get(key) ?? [];
        list.push(index);
        groups.set(key, list);
      });

      const bends: number[] = new Array<number>(validEdges.length).fill(0);
      groups.forEach((indexes) => {
        if (indexes.length < 2) return;
        indexes.forEach((edgeIndex, position) => {
          const edge = validEdges[edgeIndex];
          if (edge.sourceId === edge.targetId) return;
          const sign = edge.sourceId < edge.targetId ? 1 : -1;
          bends[edgeIndex] = (position - (indexes.length - 1) / 2) * CURVE_STEP * sign;
        });
      });

      const edgesCopy: SimulatedEdge[] = validEdges.map((edge, index) => ({
        source: edge.sourceId,
        target: edge.targetId,
        weight: edge.weight,
        color: resolveColor(edge.color, '#64748b'),
        highlighted: edge.highlighted,
        style: edge.style,
        label: edge.label,
        bend: bends[index],
      }));

      const defs = svg.append('defs');
      Array.from(new Set(edgesCopy.map((edge) => resolveColor(edge.color, '#64748b')))).forEach((c) => {
        defs
          .append('marker')
          .attr('id', `arrow-${c.replace('#', '')}`)
          .attr('viewBox', '0 -5 10 10')
          .attr('refX', 9)
          .attr('refY', 0)
          .attr('markerUnits', 'userSpaceOnUse')
          .attr('markerWidth', 10)
          .attr('markerHeight', 10)
          .attr('orient', 'auto')
          .append('path')
          .attr('d', 'M0,-5L10,0L0,5')
          .attr('fill', c);
      });

      const initialTransform = interactive ? transformRef.current : d3.zoomIdentity;
      const root = svg.append('g').attr('transform', initialTransform.toString());

      if (interactive) {
        svg.call(
          d3
            .zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.3, 4])
            .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
              transformRef.current = event.transform;
              root.attr('transform', event.transform.toString());
            })
        );
      } else {
        svg.on('.zoom', null).style('touch-action', 'pan-y');
      }

      simulation?.stop();
      simulation = d3
        .forceSimulation(nodesCopy)
        .force(
          'link',
          d3
            .forceLink<SimulatedNode, SimulatedEdge>(edgesCopy)
            .id((d) => d.id)
            .distance(120)
        )
        .force('charge', d3.forceManyBody().strength(-350))
        .force('collide', d3.forceCollide<SimulatedNode>(NODE_RADIUS + NODE_PADDING))
        .force('x', d3.forceX(width / 2).strength(0.08))
        .force('y', d3.forceY(height / 2).strength(0.08));

      const allPlaced = nodes.every((n) => positionsRef.current.has(n.id));
      const startAlpha = layout !== 'force' ? 0 : layoutChanged ? 0.8 : allPlaced ? 0.1 : 1;
      simulation.alpha(startAlpha);

      const link = root
        .append('g')
        .selectAll<SVGPathElement, SimulatedEdge>('path')
        .data(edgesCopy)
        .join('path')
        .attr('fill', 'none')
        .attr('stroke', (d: SimulatedEdge) => resolveColor(d.color, '#64748b'))
        .attr('stroke-width', (d: SimulatedEdge) => (d.highlighted ? 4 : 2))
        .attr('stroke-dasharray', (d: SimulatedEdge) =>
          d.style === 'dashed' ? '8 5' : d.style === 'dotted' ? '2 4' : null
        )
        .attr('marker-end', (d: SimulatedEdge) =>
          directed ? `url(#arrow-${resolveColor(d.color, '#64748b').replace('#', '')})` : null
        );

      link
        .append('title')
        .text(
          (d: SimulatedEdge) =>
            `${nodeIdOf(d.source)} ${directed ? '→' : '—'} ${nodeIdOf(d.target)}${
              weighted && d.weight !== undefined ? ` (peso ${d.weight})` : ''
            }`
        );

      const edgeLabels = root
        .append('g')
        .selectAll<SVGTextElement, SimulatedEdge>('text')
        .data(edgesCopy)
        .join('text')
        .text((d: SimulatedEdge) =>
          d.label !== undefined && d.label !== ''
            ? d.label
            : weighted && d.weight !== undefined
              ? String(d.weight)
              : ''
        )
        .attr('fill', '#94a3b8')
        .attr('font-size', '11px')
        .attr('text-anchor', 'middle');

      const node = root
        .append('g')
        .selectAll<SVGGElement, SimulatedNode>('g')
        .data(nodesCopy)
        .join('g');

      node
        .append('circle')
        .attr('r', NODE_RADIUS)
        .attr('fill', (d: SimulatedNode) => resolveColor(d.color, '#3b82f6'))
        .attr('stroke', (d: SimulatedNode) => (d.highlighted ? '#ffffff' : '#1e293b'))
        .attr('stroke-width', (d: SimulatedNode) => (d.highlighted ? 3 : 2));

      node
        .append('text')
        .text((d: SimulatedNode) => d.label)
        .attr('text-anchor', 'middle')
        .attr('dy', 4)
        .attr('fill', '#ffffff')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold');

      node
        .filter((d: SimulatedNode) => !!d.badge)
        .append('text')
        .text((d: SimulatedNode) => d.badge ?? '')
        .attr('text-anchor', 'middle')
        .attr('dy', NODE_RADIUS + 14)
        .attr('fill', '#fbbf24')
        .attr('font-size', '11px')
        .attr('font-family', 'monospace')
        .attr('stroke', '#020617')
        .attr('stroke-width', 3)
        .attr('paint-order', 'stroke');

      node.append('title').text((d: SimulatedNode) => `id ${d.id} · ${d.label}`);

      if (layout === 'force' && interactive) {
        const dragBehavior = d3
          .drag<SVGGElement, SimulatedNode>()
          .on('start', (_event: DragEvent, d: SimulatedNode) => {
            simulation?.alphaTarget(0.2).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event: DragEvent, d: SimulatedNode) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (_event: DragEvent, d: SimulatedNode) => {
            simulation?.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          });

        node.call(dragBehavior);
      }

      const updatePositions = () => {
        link.attr('d', (d: SimulatedEdge) => edgeGeometry(d, directed).path);

        edgeLabels
          .attr('x', (d: SimulatedEdge) => edgeGeometry(d, directed).lx)
          .attr('y', (d: SimulatedEdge) => edgeGeometry(d, directed).ly);

        node.attr('transform', (d: SimulatedNode) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      };

      if (layout !== 'force') {
        const startPositions = nodesCopy.map((node) => ({
          node,
          x: initialPositions.get(node.id)?.x ?? width / 2,
          y: initialPositions.get(node.id)?.y ?? height / 2,
          targetX: node.x ?? width / 2,
          targetY: node.y ?? height / 2,
        }));
        const duration = 650;
        simulation.stop();
        layoutTimer = d3.timer((elapsed) => {
          const progress = Math.min(1, elapsed / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          startPositions.forEach(({ node, x, y, targetX, targetY }) => {
            node.x = x + (targetX - x) * eased;
            node.y = y + (targetY - y) * eased;
            positionsRef.current.set(node.id, { x: node.x, y: node.y });
          });
          updatePositions();
          if (progress === 1) layoutTimer?.stop();
        });
      }

      simulation.on('tick', () => {
        nodesCopy.forEach((currentNode) => {
          currentNode.x = Math.max(
            NODE_RADIUS + NODE_PADDING,
            Math.min(width - NODE_RADIUS - NODE_PADDING, currentNode.x ?? width / 2)
          );
          currentNode.y = Math.max(
            NODE_RADIUS + NODE_PADDING,
            Math.min(height - NODE_RADIUS - NODE_PADDING, currentNode.y ?? height / 2)
          );

          positionsRef.current.set(currentNode.id, {
            x: currentNode.x,
            y: currentNode.y,
          });
        });

        updatePositions();
      });

      updatePositions();
    };

    const resizeObserver = new ResizeObserver(() => {
      render();
    });

    resizeObserver.observe(containerRef.current);
    render();

    return () => {
      resizeObserver.disconnect();
      simulation?.stop();
      layoutTimer?.stop();
    };
  }, [nodes, edges, directed, weighted, layout]);

  return (
    <div
      ref={containerRef}
      className="graph-canvas"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#020617' }}
    >
      <svg ref={svgRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
};