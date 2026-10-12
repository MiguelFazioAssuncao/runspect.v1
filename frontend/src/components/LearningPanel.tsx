'use client';

import type { Example } from '@/lib/examples';
import { learningGuides, learningPaths } from '@/lib/learning';
import { matchesSampleOutput } from '@/lib/studyProject';

export interface SampleRun { exampleId: string; code: string; stdin: string; output: string }

export function LearningPanel({ example, code, stdin, sampleRun, completed, onComplete, onSelect, onRestore }: {
  example: Example;
  code: string;
  stdin: string;
  sampleRun: SampleRun | null;
  completed: string[];
  onComplete: () => void;
  onSelect: (id: string) => void;
  onRestore: () => void;
}) {
  const guide = learningGuides[example.id];
  const path = learningPaths.find(path => path.ids.includes(example.id));
  const next = path?.ids.find(id => id !== example.id && !completed.includes(id));
  const checked = sampleRun?.exampleId === example.id && sampleRun.code === code && sampleRun.stdin === stdin && stdin === example.stdin;
  const matches = checked && matchesSampleOutput(sampleRun.output, example.expectedOutput);

  return <section className="learning-panel" aria-label="Guia de estudo">
    <div className="learning-heading"><strong>{example.name}</strong><button type="button" onClick={onRestore}>Restaurar exemplo</button></div>
    <p>{example.description}</p>
    <div className="learning-meta"><span>Tempo: {example.timeComplexity}</span><span>Memória: {example.memoryComplexity}</span></div>
    <details key={example.id}>
      <summary>Como estudar esta técnica</summary>
      {guide && <div className="learning-guide">
        <p><strong>Quando usar</strong>{guide.use}</p>
        <p><strong>Observe os passos</strong>{guide.observe}</p>
        <p><strong>Erro comum</strong>{guide.pitfall}</p>
        <p><strong>Experimente</strong>{guide.challenge}</p>
      </div>}
      <div className="sample-output"><strong>Saída esperada para a entrada original</strong><pre>{example.expectedOutput}</pre>
        <p role="status" className={checked ? matches ? 'sample-match' : 'sample-mismatch' : ''}>
          {checked ? matches ? 'A saída coincide com o exemplo.' : 'A saída difere do exemplo. Confira os valores no terminal.' : stdin !== example.stdin ? 'Entrada modificada: a saída de referência vale apenas para a entrada original.' : 'Execute com a entrada original para comparar a saída.'}
        </p><small>A comparação ignora espaços e quebras de linha. Um exemplo não comprova a correção para todas as entradas.</small>
      </div>
      <div className="learning-progress"><label><input type="checkbox" checked={completed.includes(example.id)} onChange={onComplete} />Já consigo explicar esta técnica</label>
        {path && <span>{path.name}: {path.ids.filter(id => completed.includes(id)).length}/{path.ids.length}</span>}
        {next && <button type="button" onClick={() => onSelect(next)}>Continuar trilha</button>}
      </div>
    </details>
  </section>;
}
