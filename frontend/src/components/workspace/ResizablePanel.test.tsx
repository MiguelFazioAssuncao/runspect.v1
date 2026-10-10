import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PanelInteractionContext, ResizablePanel } from './ResizablePanel';

describe('recording panels', () => {
  it('renders complete content without collapsed state or resize controls in a recording', () => {
    const html = renderToStaticMarkup(
      <PanelInteractionContext.Provider value={false}>
        <ResizablePanel title="Estruturas" defaultCollapsed>
          <ResizablePanel title="Matriz dp" defaultCollapsed><div>0 1 1 2</div></ResizablePanel>
        </ResizablePanel>
      </PanelInteractionContext.Provider>,
    );
    expect(html).toBe('<div>0 1 1 2</div>');
  });
});
