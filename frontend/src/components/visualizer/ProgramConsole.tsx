import React from 'react';
import { ResizablePanel } from '@/components/workspace/ResizablePanel';
import { useLocale } from '@/lib/i18n';

export function ProgramConsole({ output, warnings }: { output: string; warnings: string[] }) {
  const { tr } = useLocale();
  if (!output && warnings.length === 0) return null;
  return (
    <ResizablePanel title="Saída do programa">
    <div className="program-console">
      {warnings.map((warning, index) => <p className="program-input-warning" role="alert" key={index}>{warning}</p>)}
      {output && <div><span className="panel-label">{tr('saída do programa', 'program output')}</span><pre>{output}</pre></div>}
    </div>
    </ResizablePanel>
  );
}
