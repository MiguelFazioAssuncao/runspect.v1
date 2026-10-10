'use client';

import React, { useId, useRef, useState } from 'react';
import { Code2, Network, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { ResizeHandle } from './ResizablePanel';

export function WorkspaceSplit({ children }: { children: [React.ReactNode, React.ReactNode] }) {
  const [ratio, setRatio] = useState(.5);
  const [collapsed, setCollapsed] = useState([false, false]);
  const workspace = useRef<HTMLElement>(null);
  const id = useId();
  const width = () => Math.max(1, (workspace.current?.getBoundingClientRect().width ?? 1000) - 12);
  const constrain = (value: number) => {
    const minimum = Math.min(.4, 180 / width());
    return Math.max(minimum, Math.min(1 - minimum, value));
  };

  return <section ref={workspace} className="workspace-grid workspace-split" data-editor-collapsed={collapsed[0]} data-visualizer-collapsed={collapsed[1]} style={{ '--workspace-ratio': ratio } as React.CSSProperties}>
    {children.map((child, index) => <React.Fragment key={index}>
      {index === 1 && <ResizeHandle className={collapsed.some(Boolean) ? 'workspace-divider workspace-divider-disabled' : 'workspace-divider'} orientation="vertical" label="Redimensionar código e visualização" value={ratio * 100} min={0} max={100}
        onStart={() => { const start = ratio; const available = width(); return delta => setRatio(constrain(start + delta / available)); }}
        onAdjust={delta => setRatio(constrain(ratio + delta / width()))}
        onReset={() => setRatio(.5)} />}
      <div className="workspace-pane" data-collapsed={collapsed[index]}>
        <button type="button" className="workspace-pane-toggle" aria-expanded={!collapsed[index]} aria-controls={`${id}-${index}`} aria-label={`${collapsed[index] ? 'Restaurar' : 'Minimizar'} ${index === 0 ? 'Escrever código' : 'Visualizar'}`} onClick={() => setCollapsed(previous => previous.map((value, position) => position === index ? !value : value))}>
          {index === 0 ? <Code2 size={14} /> : <Network size={14} />}
          <span>{index === 0 ? 'Escrever código' : 'Visualizar'}</span>
          {collapsed[index] ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
        <div id={`${id}-${index}`} className="workspace-pane-content" hidden={collapsed[index]}>{child}</div>
      </div>
    </React.Fragment>)}
  </section>;
}
