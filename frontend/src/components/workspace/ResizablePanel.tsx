'use client';

import React, { createContext, useContext, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Minus } from 'lucide-react';

// Recording renders the original content without interactive panel chrome.
export const PanelInteractionContext = createContext(true);

export function ResizeHandle({ label, orientation = 'horizontal', value, min, max, onStart, onAdjust, onReset, className = '' }: {
  label: string;
  orientation?: 'horizontal' | 'vertical';
  value?: number;
  min?: number;
  max?: number;
  onStart: () => (delta: number) => void;
  onAdjust: (delta: number) => void;
  onReset: () => void;
  className?: string;
}) {
  const drag = useRef<{ origin: number; update: (delta: number) => void } | null>(null);
  const [dragging, setDragging] = useState(false);
  const coordinate = (event: React.PointerEvent) => orientation === 'vertical' ? event.clientX : event.clientY;
  const stop = () => { drag.current = null; setDragging(false); };

  return <div
    className={`panel-resize-handle panel-resize-${orientation} ${className}`}
    role="separator"
    tabIndex={0}
    aria-label={label}
    aria-orientation={orientation}
    aria-valuenow={value === undefined ? undefined : Math.round(value)}
    aria-valuemin={min}
    aria-valuemax={max}
    title={`${label} · arraste ou use as setas · clique duas vezes para restaurar`}
    data-dragging={dragging}
    onPointerDown={event => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { origin: coordinate(event), update: onStart() };
      setDragging(true);
    }}
    onPointerMove={event => drag.current?.update(coordinate(event) - drag.current.origin)}
    onPointerUp={event => {
      stop();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={stop}
    onLostPointerCapture={stop}
    onDoubleClick={onReset}
    onKeyDown={event => {
      const decrease = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp';
      const increase = orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown';
      if (event.key === decrease || event.key === increase) {
        event.preventDefault();
        onAdjust((event.key === decrease ? -1 : 1) * (event.shiftKey ? 50 : 16));
      } else if (event.key === 'Home') {
        event.preventDefault();
        onReset();
      }
    }}
  />;
}

export function ResizablePanel({ title, children, className = '', fill = false, defaultCollapsed = false, minHeight = 72 }: {
  title: string;
  children: React.ReactNode;
  className?: string;
  fill?: boolean;
  defaultCollapsed?: boolean;
  minHeight?: number;
}) {
  const interactive = useContext(PanelInteractionContext);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [height, setHeight] = useState<number>();
  const body = useRef<HTMLDivElement>(null);
  const id = useId();
  const constrain = (size: number) => Math.max(minHeight, Math.min(2000, size));
  const currentHeight = () => body.current?.getBoundingClientRect().height ?? minHeight;

  if (!interactive) return <>{children}</>;

  return <section className={`resizable-panel ${fill ? 'resizable-panel-fill' : ''} ${className}`} data-collapsed={collapsed} data-sized={height !== undefined}>
    <div className="resizable-panel-header">
      <button type="button" className="panel-fold-toggle" aria-expanded={!collapsed} aria-controls={id} aria-label={`${collapsed ? 'Restaurar' : 'Minimizar'} ${title}`} onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        <span>{title}</span>
        {!collapsed && <Minus size={13} className="panel-minimize-icon" />}
      </button>
    </div>
    <div ref={body} id={id} hidden={collapsed} className="resizable-panel-body" style={height === undefined ? undefined : { height }}>
      {children}
    </div>
    {!collapsed && <ResizeHandle label={`Redimensionar ${title}`} value={height} min={minHeight} max={2000}
      onStart={() => { const start = currentHeight(); return delta => setHeight(constrain(start + delta)); }}
      onAdjust={delta => setHeight(constrain(currentHeight() + delta))}
      onReset={() => setHeight(undefined)} />}
  </section>;
}
