'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as d3 from 'd3';
import { GraphNode, GraphEdge } from '@/types/visualizer';
import { findBipartitePartitions, findHierarchicalLevels } from '@/lib/graphLayout';
import { planarLayout } from '@/lib/advancedGraph';

export type GraphLayout = 'force' | 'circular' | 'grid' | 'bipartite' | 'hierarchical' | 'planar';

export interface GraphCanvasHandle {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  getSvgElement: () => SVGSVGElement | null;
}

type SimulatedNode = GraphNode & {
  x?: number;
  y?: number;
};

type SimulatedEdge = Omit<GraphEdge, 'source' | 'target'> & {
  source: number | SimulatedNode;
  target: number | SimulatedNode;
  bend?: number;
  loopIndex?: number;
  loopCount?: number;
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

const MIN_SCALE = 0.05;
const MAX_SCALE = 6;
const MAX_FIT_SCALE = 1.5;
const FIT_PADDING = NODE_RADIUS + 40;
const MIN_NODE_DISTANCE = 2 * NODE_RADIUS + 26;
const MAX_SPREAD = 20;

const EMPTY_NUMBERS: number[] = [];
const EMPTY_RECORD: Record<number, number> = {};

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

const spreadToMinDistance = (points: { x?: number; y?: number }[], minDistance: number) => {
  if (points.length < 2 || points.length > 800) return;
  let min = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = Math.hypot((points[i].x ?? 0) - (points[j].x ?? 0), (points[i].y ?? 0) - (points[j].y ?? 0));
      if (d > 1e-3 && d < min) min = d;
    }
  }
  if (!Number.isFinite(min) || min >= minDistance) return;
  const k = Math.min(MAX_SPREAD, minDistance / min);
  const cx = points.reduce((sum, p) => sum + (p.x ?? 0), 0) / points.length;
  const cy = points.reduce((sum, p) => sum + (p.y ?? 0), 0) / points.length;
  points.forEach((p) => {
    p.x = cx + ((p.x ?? 0) - cx) * k;
    p.y = cy + ((p.y ?? 0) - cy) * k;
  });
};

const fitTransform = (points: { x: number; y: number }[], width: number, height: number): d3.ZoomTransform => {
  if (points.length === 0) return d3.zoomIdentity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  points.forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });
  const w = maxX - minX + 2 * FIT_PADDING;
  const h = maxY - minY + 2 * FIT_PADDING + 16;
  const k = Math.max(MIN_SCALE, Math.min(width / w, height / h, MAX_FIT_SCALE));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2 + 8;
  return d3.zoomIdentity.translate(width / 2 - k * cx, height / 2 - k * cy).scale(k);
};

const edgeGeometry = (edge: SimulatedEdge, directed: boolean) => {
  if (nodeIdOf(edge.source) === nodeIdOf(edge.target)) {
    const p = nodePosition(edge.source);
    const loopCount = edge.loopCount ?? 1;
    const loopIndex = edge.loopIndex ?? 0;
    const angle = ((loopIndex - (loopCount - 1) / 2) * Math.PI) / 7;
    const radius = 42 + Math.abs(loopIndex - (loopCount - 1) / 2) * 8;
    const startX = p.x - 12 + Math.sin(angle) * 8;
    const endX = p.x + 12 + Math.sin(angle) * 8;
    const controlY = p.y - radius;
    const controlOffset = 30 + Math.abs(loopIndex - (loopCount - 1) / 2) * 10;
    return {
      path: `M${startX},${p.y - 18}C${p.x - controlOffset},${controlY} ${p.x + controlOffset},${controlY} ${endX},${p.y - 18}`,
      lx: p.x + Math.sin(angle) * 12,
      ly: controlY - 8,
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
  staticRender?: boolean;
  bridgeEdgeIndexes?: number[];
  articulationNodeIds?: number[];
  stronglyConnectedComponentByNode?: Record<number, number>;
  coloringByNode?: Record<number, number>;
  negativeCycleEdgeIndexes?: number[];
  minCutEdgeIndexes?: number[];
  minCutSide?: number[];
}

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(function GraphCanvas(
  {
    nodes,
    edges,
    directed = true,
    weighted = true,
    layout = 'force',
    staticRender = false,
    bridgeEdgeIndexes = EMPTY_NUMBERS,
    articulationNodeIds = EMPTY_NUMBERS,
    stronglyConnectedComponentByNode = EMPTY_RECORD,
    coloringByNode = EMPTY_RECORD,
    negativeCycleEdgeIndexes = EMPTY_NUMBERS,
    minCutEdgeIndexes = EMPTY_NUMBERS,
    minCutSide = EMPTY_NUMBERS,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const positionsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const layoutRef = useRef<GraphLayout>(layout);
  const autoFitRef = useRef(true);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const fitRef = useRef<(animate?: boolean) => void>(() => {});
  const draggingRef = useRef(false);

  useImperativeHandle(
    ref,
    () => {
      const zoomBy = (factor: number) => {
        if (!svgRef.current || !zoomRef.current) return;
        autoFitRef.current = false;
        d3.select(svgRef.current).transition().duration(180).call(zoomRef.current.scaleBy, factor);
      };
      return {
        fit: () => {
          autoFitRef.current = true;
          fitRef.current(true);
        },
        zoomIn: () => zoomBy(1.4),
        zoomOut: () => zoomBy(1 / 1.4),
        getSvgElement: () => svgRef.current,
      };
    },
    [],
  );

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

      const interactive = !staticRender && !window.matchMedia(COMPACT_QUERY).matches;

      const layoutChanged = layoutRef.current !== layout;
      layoutRef.current = layout;
      if (layoutChanged) autoFitRef.current = true;

      layoutTimer?.stop();

      svg.attr('viewBox', `0 0 ${width} ${height}`);
      svg.selectAll('*').remove();

      const worldSide = Math.ceil(Math.sqrt(nodes.length)) * 160;
      const worldW = Math.max(width, worldSide);
      const worldH = Math.max(height, worldSide);

      const nodesCopy: SimulatedNode[] = nodes.map((node, index) => {
        const savedPos = positionsRef.current.get(node.id);
        const spiralAngle = index * 2.399963229728653;
        const spiralRadius = 45 * Math.sqrt(index + 0.5);
        const startX = savedPos?.x ?? worldW / 2 + spiralRadius * Math.cos(spiralAngle);
        const startY = savedPos?.y ?? worldH / 2 + spiralRadius * Math.sin(spiralAngle);
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

      let targetPoints: { x: number; y: number }[] | null = null;

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
        } else if (layout === 'grid') {
          const cols = Math.ceil(Math.sqrt(count));
          const rows = Math.ceil(count / cols);
          const cellW = (width - 2 * margin) / cols;
          const cellH = (height - 2 * margin) / rows;
          nodesCopy.forEach((n, i) => {
            n.x = margin + cellW * ((i % cols) + 0.5);
            n.y = margin + cellH * (Math.floor(i / cols) + 0.5);
          });
        } else if (layout === 'planar') {
          const embedding = planarLayout(
            nodesCopy.map((node) => node.id),
            edges.map((edge) => ({
              source: typeof edge.source === 'number' ? edge.source : edge.source.id,
              target: typeof edge.target === 'number' ? edge.target : edge.target.id,
            })),
          );
          nodesCopy.forEach((node) => {
            const target = embedding?.get(node.id);
            node.x = target ? margin + target.x * (width - 2 * margin) : width / 2;
            node.y = target ? margin + target.y * (height - 2 * margin) : height / 2;
          });
        } else if (layout === 'bipartite') {
          const { partitions, isBipartite } = findBipartitePartitions(nodesCopy, edges);
          if (!isBipartite) {
            nodesCopy.forEach((node, index) => {
              const columns = 2;
              const column = index % columns;
              const row = Math.floor(index / columns);
              node.x = margin + ((width - 2 * margin) * (column + 0.5)) / columns;
              node.y = margin + ((height - 2 * margin) * (row + 0.5)) / Math.ceil(count / columns);
            });
          } else {
            const left = nodesCopy.filter((node) => partitions.get(node.id) === 0);
            const right = nodesCopy.filter((node) => partitions.get(node.id) === 1);
            const columns = [left, right];
            columns.forEach((column, columnIndex) => {
              const rowHeight = (height - 2 * margin) / Math.max(1, column.length);
              column.forEach((node, rowIndex) => {
                node.x = margin + ((width - 2 * margin) * (columnIndex + 0.5)) / 2;
                node.y = margin + rowHeight * (rowIndex + 0.5);
              });
            });
          }
        } else {
          const levels = findHierarchicalLevels(nodesCopy, edges, directed);
          const levelGroups = new Map<number, SimulatedNode[]>();
          nodesCopy.forEach((node) => {
            const level = levels.get(node.id) ?? 0;
            const group = levelGroups.get(level) ?? [];
            group.push(node);
            levelGroups.set(level, group);
          });
          const maxLevel = Math.max(...levelGroups.keys(), 0);
          levelGroups.forEach((group, level) => {
            const rowWidth = (width - 2 * margin) / Math.max(1, group.length);
            group.forEach((node, index) => {
              node.x = margin + rowWidth * (index + 0.5);
              node.y = margin + ((height - 2 * margin) * (level + 0.5)) / (maxLevel + 1);
            });
          });
        }

        spreadToMinDistance(nodesCopy, MIN_NODE_DISTANCE);

        nodesCopy.forEach((n) => {
          n.fx = n.x;
          n.fy = n.y;
        });
        targetPoints = nodesCopy.map((n) => ({ x: n.x ?? 0, y: n.y ?? 0 }));
      }

      if (layout !== 'force' && !staticRender) {
        nodesCopy.forEach((node) => {
          const start = initialPositions.get(node.id);
          if (start) {
            node.x = start.x;
            node.y = start.y;
          }
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
      const loops = new Map<number, number[]>();
      validEdges.forEach((edge, index) => {
        if (edge.sourceId === edge.targetId) {
          const list = loops.get(edge.sourceId) ?? [];
          list.push(index);
          loops.set(edge.sourceId, list);
          return;
        }
        const key = `${Math.min(edge.sourceId, edge.targetId)}-${Math.max(edge.sourceId, edge.targetId)}`;
        const list = groups.get(key) ?? [];
        list.push(index);
        groups.set(key, list);
      });

      const bends: number[] = new Array<number>(validEdges.length).fill(0);
      const loopIndexes = new Map<number, { index: number; count: number }>();
      loops.forEach((indexes) => {
        indexes.forEach((edgeIndex, index) => {
          loopIndexes.set(edgeIndex, { index, count: indexes.length });
        });
      });
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
        loopIndex: loopIndexes.get(index)?.index,
        loopCount: loopIndexes.get(index)?.count,
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

      const root = svg.append('g').attr('data-graph-content', '').attr('transform', transformRef.current.toString());

      let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;

      const currentPoints = () =>
        targetPoints ?? nodesCopy.map((n) => ({ x: n.x ?? 0, y: n.y ?? 0 }));

      const applyFit = (animate = false) => {
        const t = fitTransform(currentPoints(), width, height);
        if (zoomBehavior) {
          if (animate) svg.transition().duration(300).call(zoomBehavior.transform, t);
          else svg.call(zoomBehavior.transform, t);
        } else {
          transformRef.current = t;
          root.attr('transform', t.toString());
        }
      };
      fitRef.current = applyFit;

      if (interactive) {
        zoomBehavior = d3
          .zoom<SVGSVGElement, unknown>()
          .scaleExtent([MIN_SCALE, MAX_SCALE])
          .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
            transformRef.current = event.transform;
            root.attr('transform', event.transform.toString());
            if (event.sourceEvent) autoFitRef.current = false;
          });
        zoomRef.current = zoomBehavior;
        svg.call(zoomBehavior);
        svg.on('dblclick.zoom', () => {
          autoFitRef.current = true;
          applyFit(true);
        });
        svg.call(zoomBehavior.transform, transformRef.current);
      } else {
        zoomRef.current = null;
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
            .distance(120),
        )
        .force('charge', d3.forceManyBody().strength(-350))
        .force('collide', d3.forceCollide<SimulatedNode>(NODE_RADIUS + NODE_PADDING))
        .force('x', d3.forceX(worldW / 2).strength(0.08))
        .force('y', d3.forceY(worldH / 2).strength(0.08));

      const allPlaced = nodes.every((n) => positionsRef.current.has(n.id));
      const startAlpha = layout !== 'force' ? 0 : layoutChanged ? 0.8 : allPlaced ? 0.1 : 1;
      simulation.alpha(startAlpha);

      const link = root
        .append('g')
        .selectAll<SVGPathElement, SimulatedEdge>('path')
        .data(edgesCopy)
        .join('path')
        .attr('fill', 'none')
        .attr('stroke', (d: SimulatedEdge, index: number) =>
          negativeCycleEdgeIndexes.includes(index)
            ? '#ef4444'
            : minCutEdgeIndexes.includes(index)
              ? '#f59e0b'
              : resolveColor(d.color, '#64748b'),
        )
        .attr('stroke-width', (d: SimulatedEdge, index: number) =>
          d.highlighted || negativeCycleEdgeIndexes.includes(index)
            ? 4
            : minCutEdgeIndexes.includes(index)
              ? 5
              : bridgeEdgeIndexes.includes(index)
                ? 4
                : 2,
        )
        .attr('stroke-dasharray', (d: SimulatedEdge) =>
          d.style === 'dashed' ? '8 5' : d.style === 'dotted' ? '2 4' : null,
        )
        .attr('marker-end', (d: SimulatedEdge) =>
          directed ? `url(#arrow-${resolveColor(d.color, '#64748b').replace('#', '')})` : null,
        );

      link
        .append('title')
        .text(
          (d: SimulatedEdge) =>
            `${nodeIdOf(d.source)} ${directed ? '→' : '—'} ${nodeIdOf(d.target)}${
              weighted && d.weight !== undefined ? ` (peso ${d.weight})` : ''
            }`,
        );

      const edgeLabels = root
        .append('g')
        .selectAll<SVGTextElement, SimulatedEdge>('text')
        .data(edgesCopy)
        .join('text')
        .text((d: SimulatedEdge) =>
          nodes.length > 80 || edges.length > 240
            ? ''
            : d.label !== undefined && d.label !== ''
              ? d.label
              : weighted && d.weight !== undefined
                ? String(d.weight)
                : '',
        )
        .attr('fill', '#94a3b8')
        .attr('font-size', '11px')
        .attr('text-anchor', 'middle')
        .attr('paint-order', 'stroke')
        .attr('stroke', '#020617')
        .attr('stroke-width', 4)
        .attr('stroke-linejoin', 'round');

      const node = root
        .append('g')
        .selectAll<SVGGElement, SimulatedNode>('g')
        .data(nodesCopy)
        .join('g');

      node
        .append('circle')
        .attr('r', NODE_RADIUS)
        .attr('fill', (d: SimulatedNode) => {
          if (minCutSide.length > 0) return minCutSide.includes(d.id) ? '#38bdf8' : '#f97316';
          if (d.color && d.color !== '#3b82f6') return resolveColor(d.color);
          const color = coloringByNode[d.id];
          const colors = ['#3b82f6', '#10b981', '#f97316', '#a855f7', '#eab308', '#ec4899'];
          return colors[(color ?? 0) % colors.length];
        })
        .attr('stroke', (d: SimulatedNode) => {
          if (d.highlighted || articulationNodeIds.includes(d.id)) return '#ffffff';
          const component = stronglyConnectedComponentByNode[d.id];
          if (component !== undefined) {
            const colors = ['#f97316', '#22c55e', '#a855f7', '#06b6d4', '#eab308'];
            return colors[component % colors.length];
          }
          return '#1e293b';
        })
        .attr('stroke-width', (d: SimulatedNode) =>
          d.highlighted || articulationNodeIds.includes(d.id)
            ? 3
            : stronglyConnectedComponentByNode[d.id] !== undefined
              ? 3
              : 2,
        );

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
            autoFitRef.current = false;
            draggingRef.current = true;
            simulation?.alphaTarget(0.2).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event: DragEvent, d: SimulatedNode) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (_event: DragEvent, d: SimulatedNode) => {
            draggingRef.current = false;
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

      if (layout !== 'force' && !staticRender) {
        const startPositions = nodesCopy.map((n) => ({
          node: n,
          x: initialPositions.get(n.id)?.x ?? width / 2,
          y: initialPositions.get(n.id)?.y ?? height / 2,
          targetX: n.fx ?? n.x ?? width / 2,
          targetY: n.fy ?? n.y ?? height / 2,
        }));
        const duration = 650;
        simulation.stop();
        layoutTimer = d3.timer((elapsed) => {
          const progress = Math.min(1, elapsed / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          startPositions.forEach(({ node: n, x, y, targetX, targetY }) => {
            n.x = x + (targetX - x) * eased;
            n.y = y + (targetY - y) * eased;
            positionsRef.current.set(n.id, { x: n.x, y: n.y });
          });
          updatePositions();
          if (progress === 1) layoutTimer?.stop();
        });
      }

      const rememberPositions = () => {
        nodesCopy.forEach((currentNode) => {
          currentNode.x = Math.max(
            NODE_RADIUS + NODE_PADDING,
            Math.min(worldW - NODE_RADIUS - NODE_PADDING, currentNode.x ?? worldW / 2),
          );
          currentNode.y = Math.max(
            NODE_RADIUS + NODE_PADDING,
            Math.min(worldH - NODE_RADIUS - NODE_PADDING, currentNode.y ?? worldH / 2),
          );

          positionsRef.current.set(currentNode.id, {
            x: currentNode.x,
            y: currentNode.y,
          });
        });
      };

      if (staticRender) {
        simulation.stop();
        if (layout === 'force') simulation.tick(180);
        rememberPositions();
        updatePositions();
        applyFit();
        return;
      }

      let tickCount = 0;
      simulation.on('tick', () => {
        rememberPositions();
        updatePositions();

        tickCount++;
        if (autoFitRef.current && !draggingRef.current && tickCount % 4 === 0) applyFit();
      });
      simulation.on('end', () => {
        if (autoFitRef.current && !draggingRef.current) applyFit();
      });

      updatePositions();
      if (autoFitRef.current) applyFit();
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
  }, [
    nodes,
    edges,
    directed,
    weighted,
    layout,
    staticRender,
    bridgeEdgeIndexes,
    articulationNodeIds,
    stronglyConnectedComponentByNode,
    coloringByNode,
    negativeCycleEdgeIndexes,
    minCutEdgeIndexes,
    minCutSide,
  ]);

  return (
    <div
      ref={containerRef}
      className="graph-canvas"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#020617' }}
    >
      <svg ref={svgRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
});
