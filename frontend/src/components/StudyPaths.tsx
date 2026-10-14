'use client';

import { ArrowRight, BookOpen, Check } from 'lucide-react';
import { examples } from '@/lib/examples';
import { learningPaths } from '@/lib/learning';

const names = new Map(examples.map(example => [example.id, example.name]));

export function StudyPaths({ completed, onSelect }: { completed: string[]; onSelect: (id: string) => void }) {
  const learned = new Set(completed);
  const total = examples.filter(example => learned.has(example.id)).length;

  return <details className="study-paths">
    <summary>
      <BookOpen size={15} aria-hidden="true" />
      <strong>Trilhas de estudo</strong>
      <span>{total} de {examples.length} técnicas</span>
    </summary>
    <div className="study-paths-content">
      <p>Escolha um caminho. Leia o guia, execute o exemplo e avance pelos passos.</p>
      <div className="study-paths-grid">
        {learningPaths.map(path => {
          const count = path.ids.filter(id => learned.has(id)).length;
          const next = path.ids.find(id => !learned.has(id));
          const target = next ?? path.ids[0];
          return <button type="button" key={path.name} className="study-path-card" onClick={() => onSelect(target)}>
            <span className="study-path-title"><strong>{path.name}</strong><span>{count}/{path.ids.length}</span></span>
            <progress value={count} max={path.ids.length} aria-label={`Progresso em ${path.name}`} />
            <span className="study-path-next">{next ? <ArrowRight size={13} aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}<span>{next ? `Próxima: ${names.get(next)}` : 'Trilha concluída · revisar'}</span></span>
          </button>;
        })}
      </div>
    </div>
  </details>;
}
