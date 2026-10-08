import { describe, expect, it } from 'vitest';
import { convertToPureCpp } from './codeConversion';
import { examples } from './examples';

const requiredByCategory: Record<string, string[]> = {
  Ordenação: ['viz::vector_init', 'viz::vector_compare', 'viz::vector_swap', 'viz::vector_result'],
  Grafos: ['viz::add_node', 'viz::add_edge'],
};

const requiredById: Record<string, string[]> = {
  'selection-sort': ['viz::vector_range', 'viz::vector_mark', 'viz::VectorState::Sorted'],
  'binary-search': ['viz::vector_range', 'viz::vector_probe', 'viz::vector_discard', 'viz::VectorState::Found'],
  'prefix-sum': ['viz::vector_init', 'viz::vector_set', 'viz::vector_range', 'viz::vector_compare'],
  'two-pointers': ['viz::vector_range', 'viz::vector_compare', 'viz::VectorState::Found'],
  dsu: ['viz::graph_component', 'viz::graph_edge_state', 'viz::vector_init'],
  'bfs-shortest-path': ['viz::graph_node_state', 'viz::graph_edge_state', 'viz::graph_path', 'viz::vector_init'],
  dijkstra: ['viz::graph_edge_state', 'viz::EdgeState::Relaxed', 'viz::graph_path', 'viz::vector_set'],
  kruskal: ['viz::graph_edge_state', 'viz::EdgeState::Accepted', 'viz::EdgeState::Rejected', 'viz::vector_init'],
  'topological-sort': ['viz::EdgeState::Removed', 'viz::vector_init', 'viz::vector_set'],
  'scc-kosaraju': ['viz::graph_node_state', 'viz::graph_component', 'viz::vector_init'],
  'segment-tree': ['viz::add_node', 'viz::graph_node_state', 'viz::graph_value', 'viz::graph_reset'],
  knapsack: ['viz::vector_compare', 'viz::vector_set', 'viz::vector_result'],
  sieve: ['viz::vector_pivot', 'viz::vector_mark', 'viz::VectorState::Discarded', 'viz::VectorState::Found'],
};

const legacyMethods = ['viz::set_color(', 'viz::highlight(', 'viz::highlight_edge(', 'viz::highlight_path(', 'viz::set_badge(', 'viz::show('];

const instrumented = examples.filter((example) => example.code.includes('visualizer.h'));
const classic = examples.filter((example) => !example.code.includes('visualizer.h'));

describe('catálogo de exemplos', () => {
  it('mantém IDs únicos e metadados completos', () => {
    const ids = examples.map((example) => example.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(examples.length).toBeGreaterThanOrEqual(30);
    for (const example of examples) {
      expect(example.name).not.toBe('');
      expect(example.code).toContain('main');
      expect(example.code.split('\n').length).toBeGreaterThan(5);
      expect(example.stdin).toContain('\n');
      expect(example.description).not.toBe('');
      expect(example.category).not.toBe('');
      expect(example.tags.length).toBeGreaterThan(0);
      expect(example.timeComplexity).not.toBe('');
      expect(example.memoryComplexity).not.toBe('');
    }
  });

  it('inclui o exemplo de ordenação com a API de vetores', () => {
    const example = examples.find((item) => item.id === 'selection-sort');
    expect(example).toBeDefined();
    expect(example?.category).toBe('Ordenação');
  });

  it('exige a API semântica esperada por categoria', () => {
    for (const example of instrumented) {
      for (const api of requiredByCategory[example.category] ?? []) {
        expect(example.code, `${example.id} deve conter ${api}`).toContain(api);
      }
    }
  });

  it('exige a API semântica esperada por exemplo', () => {
    for (const [id, apis] of Object.entries(requiredById)) {
      const example = examples.find((item) => item.id === id);
      expect(example, id).toBeDefined();
      for (const api of apis) {
        expect(example?.code, `${id} deve conter ${api}`).toContain(api);
      }
    }
  });

  it('não usa métodos genéricos de cor nos exemplos instrumentados', () => {
    for (const example of instrumented) {
      for (const method of legacyMethods) {
        expect(example.code, `${example.id} não deve usar ${method}`).not.toContain(method);
      }
    }
  });

  it('mantém exemplos clássicos sem instrumentação', () => {
    expect(classic.length).toBeGreaterThan(0);
    for (const example of classic) {
      expect(example.code).not.toContain('viz::');
    }
  });

  it('não contém comentários nos códigos', () => {
    for (const example of examples) {
      expect(example.code, example.id).not.toMatch(/(^|\s)\/\/|\/\*/);
    }
  });

  it('converte todos os exemplos para C++ puro', () => {
    for (const example of examples) {
      const converted = convertToPureCpp(example.code);
      expect(converted, example.id).not.toContain('viz::');
      expect(converted, example.id).not.toContain('visualizer.h');
      expect(converted, example.id).toContain('main');
    }
  });

  it('preserva a lógica do selection sort na conversão', () => {
    const example = examples.find((item) => item.id === 'selection-sort');
    const converted = convertToPureCpp(example?.code ?? '');
    expect(converted).toContain('swap(a[i], a[menor]);');
    expect(converted).toContain('if (a[j] < a[menor]) menor = j;');
  });
});