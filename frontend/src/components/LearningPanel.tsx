'use client';

import type { Example } from '@/lib/examples';
import { EXAMPLE_EN, STUDY_PATH_EN, useLocale } from '@/lib/i18n';
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
  const { isEn, tr } = useLocale();
  const guide = learningGuides[example.id];
  const path = learningPaths.find(path => path.ids.includes(example.id));
  const next = path?.ids.find(id => id !== example.id && !completed.includes(id));
  const checked = sampleRun?.exampleId === example.id && sampleRun.code === code && sampleRun.stdin === stdin && stdin === example.stdin;
  const matches = checked && matchesSampleOutput(sampleRun.output, example.expectedOutput);
  const localized = isEn ? EXAMPLE_EN[example.id] : undefined;
  const memoryText = isEn ? example.memoryComplexity.replace('auxiliar', 'auxiliary') : example.memoryComplexity;
  const pathName = path ? (isEn ? STUDY_PATH_EN[path.name] ?? path.name : path.name) : '';

  return <section className="learning-panel" aria-label={tr('Guia de estudo', 'Study guide')}>
    <div className="learning-heading"><strong>{localized?.name ?? example.name}</strong>{(code !== example.code || stdin !== example.stdin) && <span className="learning-draft-tag">{tr('Exemplo editado', 'Edited draft')}</span>}<button type="button" onClick={onRestore}>{tr('Restaurar exemplo', 'Restore example')}</button></div>
    <p>{localized?.description ?? example.description}</p>
    <div className="learning-meta"><span>{tr('Tempo', 'Time')}: {example.timeComplexity}</span><span>{tr('Memória', 'Memory')}: {memoryText}</span></div>
    <details key={example.id}>
      <summary>{tr('Como estudar esta técnica', 'How to study this technique')}</summary>
      <div className="learning-details-content">
      {guide && <div className="learning-guide">
        <p><strong>{tr('Quando usar', 'When to use')}</strong>{guide.use}</p>
        <p><strong>{tr('Observe os passos', 'What to watch')}</strong>{guide.observe}</p>
        <p><strong>{tr('Erro comum', 'Common pitfall')}</strong>{guide.pitfall}</p>
        <p><strong>{tr('Experimente', 'Try this')}</strong>{guide.challenge}</p>
      </div>}
      <div className="sample-output"><strong>{tr('Saída esperada para a entrada original', 'Expected output for sample input')}</strong><pre>{example.expectedOutput}</pre>
        <p role="status" className={checked ? matches ? 'sample-match' : 'sample-mismatch' : ''}>
          {checked ? matches ? tr('A saída coincide com o exemplo.', 'Output matches the sample.') : tr('A saída difere do exemplo. Confira os valores no terminal.', 'Output differs from the sample. Check the values in the terminal.') : stdin !== example.stdin ? tr('Entrada modificada: a saída de referência vale apenas para a entrada original.', 'Input modified: reference output applies only to the original sample input.') : tr('Execute com a entrada original para comparar a saída.', 'Run with the original sample input to compare the output.')}
        </p><small>{tr('A comparação ignora espaços e quebras de linha. Um exemplo não comprova a correção para todas as entradas.', 'Comparison ignores whitespace differences. Passing a single sample does not prove correctness on all inputs.')}</small>
      </div>
      <div className="learning-progress"><label><input type="checkbox" checked={completed.includes(example.id)} onChange={onComplete} />{tr('Já consigo explicar esta técnica', 'I can explain this technique')}</label>
        {path && <span>{pathName}: {path.ids.filter(id => completed.includes(id)).length}/{path.ids.length}</span>}
        {next && <button type="button" onClick={() => onSelect(next)}>{tr('Continuar trilha', 'Next in track')}</button>}
      </div>
      </div>
    </details>
  </section>;
}
