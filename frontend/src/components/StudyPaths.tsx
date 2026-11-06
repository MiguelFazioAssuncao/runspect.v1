'use client';

import { ArrowRight, BookOpen, Check } from 'lucide-react';
import { examples } from '@/lib/examples';
import { EXAMPLE_EN, STUDY_PATH_EN, useLocale } from '@/lib/i18n';
import { learningPaths } from '@/lib/learning';

const names = new Map(examples.map(example => [example.id, example.name]));

export function StudyPaths({ completed, onSelect }: { completed: string[]; onSelect: (id: string) => void }) {
  const { isEn, tr } = useLocale();
  const learned = new Set(completed);
  const total = examples.filter(example => learned.has(example.id)).length;

  return <details className="study-paths">
    <summary>
      <BookOpen size={15} aria-hidden="true" />
      <strong>{tr('Trilhas de estudo', 'Study tracks')}</strong>
      <span>{total} {tr('de', 'of')} {examples.length} {tr('técnicas', 'techniques')}</span>
    </summary>
    <div className="study-paths-content">
      <p>{tr('Escolha um caminho. Leia o guia, execute o exemplo e avance pelos passos.', 'Pick a track. Read the notes, run the example, and step through the execution.')}</p>
      <div className="study-paths-grid">
        {learningPaths.map(path => {
          const count = path.ids.filter(id => learned.has(id)).length;
          const next = path.ids.find(id => !learned.has(id));
          const target = next ?? path.ids[0];
          const pathTitle = isEn ? STUDY_PATH_EN[path.name] ?? path.name : path.name;
          const nextName = next ? (isEn ? EXAMPLE_EN[next]?.name ?? names.get(next) : names.get(next)) : '';
          return <button type="button" key={path.name} className="study-path-card" onClick={() => onSelect(target)}>
            <span className="study-path-title"><strong>{pathTitle}</strong><span>{count}/{path.ids.length}</span></span>
            <progress value={count} max={path.ids.length} aria-label={`${tr('Progresso em', 'Progress in')} ${pathTitle}`} />
            <span className="study-path-next">{next ? <ArrowRight size={13} aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}<span>{next ? `${tr('Próxima', 'Next')}: ${nextName}` : tr('Trilha concluída · revisar', 'Track completed · review')}</span></span>
          </button>;
        })}
      </div>
    </div>
  </details>;
}
