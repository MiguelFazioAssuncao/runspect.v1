import React from 'react';

export function ProgramConsole({ output, warnings }: { output: string; warnings: string[] }) {
  if (!output && warnings.length === 0) return null;
  return (
    <div className="program-console">
      {warnings.map((warning, index) => <p className="program-input-warning" role="alert" key={index}>{warning}</p>)}
      {output && <div><span className="panel-label">saída do programa</span><pre>{output}</pre></div>}
    </div>
  );
}
