'use client';

import { useSyncExternalStore } from 'react';
import type { VisualizationKey, VisualizationSelection } from './visualizationSelection';
import { VISUALIZATION_OPTIONS } from './visualizationSelection';

export type Locale = 'pt' | 'en';

let currentLocale: Locale = 'pt';
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  try {
    const saved = window.localStorage.getItem('runspect:locale');
    if (saved === 'en' || saved === 'pt') {
      currentLocale = saved;
      document.documentElement.lang = saved === 'en' ? 'en' : 'pt-BR';
    }
  } catch {
    /* ignore storage access restriction */
  }
}

function getLocaleSnapshot(): Locale {
  return currentLocale;
}

function getLocaleServerSnapshot(): Locale {
  return 'pt';
}

function subscribeLocale(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setGlobalLocale(next: Locale) {
  if (currentLocale === next) return;
  currentLocale = next;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next === 'en' ? 'en' : 'pt-BR';
  }
  try {
    window.localStorage.setItem('runspect:locale', next);
  } catch {
    /* ignore storage access restriction */
  }
  listeners.forEach((listener) => listener());
}

export function useLocale() {
  const locale = useSyncExternalStore(subscribeLocale, getLocaleSnapshot, getLocaleServerSnapshot);
  const isEn = locale === 'en';
  const tr = (pt: string, en: string): string => (isEn ? en : pt);
  return { locale, setLocale: setGlobalLocale, isEn, tr };
}

export const CATEGORY_EN: Record<string, string> = {
  todas: 'all',
  Ordenação: 'Sorting',
  Busca: 'Searching',
  Vetores: 'Vectors',
  Estruturas: 'Structures',
  Grafos: 'Graphs',
  DP: 'DP',
  Matemática: 'Math',
  Greedy: 'Greedy',
  Backtracking: 'Backtracking',
  Strings: 'Strings',
  Fluxo: 'Flow',
  'Problemas clássicos': 'Classic problems',
  Ponteiros: 'Pointers',
  Outros: 'Other',
};

export const STUDY_PATH_EN: Record<string, string> = {
  Fundamentos: 'Fundamentals',
  'Estruturas de dados': 'Data structures',
  Grafos: 'Graphs',
  'Técnicas de solução': 'Problem-solving techniques',
  'Matemática e strings': 'Math & strings',
};

export const PANEL_TITLE_EN: Record<string, string> = {
  Editor: 'Editor',
  Terminal: 'Terminal',
  'Entrada (stdin)': 'Input (stdin)',
  Grafo: 'Graph',
  Legenda: 'Legend',
  'Análise do grafo': 'Graph analysis',
  'Análises avançadas': 'Advanced analysis',
  'Linha do tempo': 'Timeline',
  'Estruturas e variáveis': 'Structures & variables',
  'Saída do programa': 'Program output',
  'Descrição do passo': 'Step description',
  Variáveis: 'Variables',
};

export function translatePanelTitle(title: string, locale: Locale): string {
  if (locale !== 'en') return title;
  if (PANEL_TITLE_EN[title]) return PANEL_TITLE_EN[title];
  if (title.startsWith('Vetor ')) return `Vector ${title.slice(6)}`;
  return title;
}

export const VISUALIZATION_OPTION_EN: Record<VisualizationKey, { label: string; description: string }> = {
  graph: { label: 'Graph', description: 'Vertices, edges, and paths.' },
  vectors: { label: 'Vectors', description: 'Values, comparisons, and sorting.' },
  structures: { label: 'Variables & structures', description: 'Variables, queues, stacks, maps, and sets.' },
  references: { label: 'Objects & pointers', description: 'Object fields, references, and linked list/tree nodes.' },
  matrices: { label: 'Matrices & DP', description: 'Cells and value dependencies.' },
  calls: { label: 'Function calls', description: 'Call tree and stack frames, including recursion.' },
  output: { label: 'Program output', description: 'Standard output printed during execution.' },
  analysis: { label: 'Graph analysis', description: 'Structural properties and metrics of the graph.' },
  legend: { label: 'Graph legend', description: 'Vertex and edge state colors.' },
};

export function localizedVisualizationSelectionLabel(selection: VisualizationSelection, locale: Locale = 'pt'): string {
  const labels = VISUALIZATION_OPTIONS
    .filter((option) => selection[option.key])
    .map((option) => (locale === 'en' ? VISUALIZATION_OPTION_EN[option.key].label : option.label));
  if (labels.length) return labels.join(' · ');
  return locale === 'en' ? 'Terminal only' : 'Somente terminal';
}

export const EXAMPLE_EN: Record<string, { name: string; description: string }> = {
  'bubble-sort': {
    name: 'Bubble Sort',
    description: 'Sorts by swapping adjacent pairs with early termination. Input: n and n values. Output: array in ascending order.',
  },
  'binary-search': {
    name: 'Binary Search',
    description: 'Finds a target in a sorted array by halving the search interval at each step.',
  },
  'two-pointers': {
    name: 'Two Pointers',
    description: 'Finds a pair with a target sum in a sorted array by moving left and right indices inward.',
  },
  'segment-tree': {
    name: 'Segment Tree: range sum',
    description: 'Answers range sum queries and point updates in logarithmic time over a binary tree.',
  },
  'bfs-shortest-path': {
    name: 'BFS: unweighted shortest path',
    description: 'Computes minimum edge distances from a source vertex using a FIFO queue.',
  },
  dfs: {
    name: 'DFS: depth-first search',
    description: 'Explores vertices recursively in depth-first order and records discovery order.',
  },
  dijkstra: {
    name: 'Dijkstra',
    description: 'Computes shortest paths on non-negative weighted graphs using a min-heap.',
  },
  kruskal: {
    name: 'Kruskal: minimum spanning tree',
    description: 'Builds a minimum spanning tree by sorting edges by weight and merging components with Union-Find.',
  },
  'topological-sort': {
    name: 'Kahn: topological sort',
    description: 'Orders vertices of a directed acyclic graph by repeatedly removing zero-indegree nodes.',
  },
  knapsack: {
    name: 'Dynamic programming: 0/1 knapsack',
    description: 'Maximizes total value within a capacity limit using a 1D DP table.',
  },
  sieve: {
    name: 'Sieve of Eratosthenes',
    description: 'Marks composite multiples up to n to list all prime numbers in the range.',
  },
  'greedy-activity': {
    name: 'Greedy: activity selection',
    description: 'Selects the maximum number of non-overlapping intervals sorted by finish time.',
  },
  'backtracking-subsets': {
    name: 'Backtracking: subset sum',
    description: 'Explores include/exclude decisions recursively to find subsets matching a target sum.',
  },
  kmp: {
    name: 'KMP: pattern matching',
    description: 'Computes the prefix function (pi array) to find all occurrences of a pattern in linear time.',
  },
  'max-flow': {
    name: 'Max Flow (Edmonds-Karp)',
    description: 'Finds augmenting paths via BFS in the residual network to compute maximum s-t flow.',
  },
  'two-sum': {
    name: 'Two Sum with hash table',
    description: 'Finds two indices whose values sum to the target using a single pass and an unordered_map.',
  },
  'merge-sort': {
    name: 'Merge Sort',
    description: 'Recursively splits the array in half and merges sorted halves in O(n log n) time.',
  },
  'prefix-sum': {
    name: 'Prefix Sums',
    description: 'Precomputes cumulative sums to answer range sum queries in O(1) time.',
  },
  'sliding-window': {
    name: 'Sliding Window: maximum sum',
    description: 'Maintains a fixed-size window sum by adding the entering element and subtracting the leaving one.',
  },
  'fenwick-tree': {
    name: 'Fenwick Tree: prefix sum & point update',
    description: 'Uses binary-indexed blocks (lowbit) for compact logarithmic prefix sums and updates.',
  },
  lis: {
    name: 'LIS: longest increasing subsequence',
    description: 'Computes the longest strictly increasing subsequence length ending at each position.',
  },
  'zero-one-bfs': {
    name: '0-1 BFS',
    description: 'Finds shortest paths in graphs with edge weights 0 and 1 using a double-ended queue (deque).',
  },
  'binary-exponentiation': {
    name: 'Modular Binary Exponentiation',
    description: 'Computes (base^exp) mod m in O(log exp) multiplications by scanning bits of the exponent.',
  },
  'tuple-optional': {
    name: 'Tuples & optional result',
    description: 'Uses std::tuple and std::optional to represent structured records and nullable search results.',
  },
  'bitset-switch': {
    name: 'Bitset & switch dispatch',
    description: 'Manipulates fixed-size bitmasks with std::bitset and dispatches operations via switch.',
  },
  'euclidean-gcd': {
    name: 'Euclid: greatest common divisor',
    description: 'Computes gcd(a, b) and lcm(a, b) through successive remainder reductions.',
  },
  'linked-list-reversal': {
    name: 'Linked List: pointer reversal',
    description: 'Reverses a singly linked list in place by rewiring next pointers step by step.',
  },
  'bst-insertion': {
    name: 'Binary Search Tree: insertion & traversal',
    description: 'Inserts keys into a pointer-based BST and performs an in-order traversal.',
  },
  'trie-prefix-count': {
    name: 'Trie: prefix counting',
    description: 'Stores strings in a character tree and counts words sharing a given prefix.',
  },
  'huffman-tree': {
    name: 'Huffman: coding tree',
    description: 'Repeatedly merges the two lowest-frequency nodes in a min-heap to build an optimal prefix tree.',
  },
  'generic-insertion-sort': {
    name: 'Generic Insertion Sort: templates & if constexpr',
    description: 'Sorts with function templates and compile-time branches using C++17 if constexpr.',
  },
  'constexpr-factorial': {
    name: 'Factorial: constexpr & runtime recursion',
    description: 'Combines a compile-time constexpr table with runtime recursive calls.',
  },
  'postfix-evaluation': {
    name: 'Postfix Expression: stack & exceptions',
    description: 'Evaluates Reverse Polish Notation tokens with a stack and handles invalid expressions.',
  },
  'euclidean-gcd-goto': {
    name: 'Euclid: labels & jumps',
    description: 'Demonstrates control flow tracing across explicit C++ labels and goto statements.',
  },
  'lcs-string-table': {
    name: 'LCS: DP table & string reconstruction',
    description: 'Fills a 2D table for Longest Common Subsequence and backtracks to reconstruct the string.',
  },
};

export const DOC_CATEGORY_EN: Record<string, string> = {
  Todas: 'All',
  Grafo: 'Graphs',
  Vetores: 'Vectors',
  Estruturas: 'Structures',
  Execução: 'Execution',
  Auxiliares: 'Utilities',
};

export const DOC_METHOD_EN: Record<string, { description: string; notes?: string }> = {
  set_directed: { description: 'Sets whether edges are rendered as directed.' },
  set_weighted: { description: 'Enables or disables edge weight labels.' },
  add_node: { description: 'Creates a vertex or updates the label of an existing vertex.' },
  add_edge: { description: 'Creates an edge between two vertices with an optional weight.' },
  remove_node: { description: 'Removes a vertex and all incident edges.' },
  remove_edge: { description: 'Removes the edge between two vertices.' },
  set_weight: { description: 'Updates the weight of an existing edge.' },
  highlight: { description: 'Highlights a vertex using a named color or CSS value.' },
  highlight_edge: { description: 'Highlights an existing edge.' },
  highlight_path: { description: 'Highlights all vertices and consecutive edges along a path.' },
  reset_colors: { description: 'Clears highlights from all graph elements.' },
  set_label: { description: 'Updates the label displayed inside a vertex.' },
  set_color: { description: 'Sets a vertex color and marks it as highlighted.' },
  step: { description: 'Emits a manual timeline frame with an optional caption.' },
  print: { description: 'Appends a log message to the terminal without creating a visual step.' },
  set_badge: { description: 'Displays a compact badge above a vertex.' },
  set_edge_style: { description: 'Applies a line style to an edge (e.g. dashed or solid).' },
  set_edge_label: { description: 'Sets a custom text label above an edge.' },
  set_multigraph: { description: 'Enables parallel edges between the same pair of vertices.' },
  show: { description: 'Renders a container as a named structure in the side panel.' },
  show_matrix: { description: 'Renders a 2D matrix in the structures panel.' },
  vector_init: { description: 'Initializes a tracked vector with integer values.' },
  vector_compare: { description: 'Marks two indices as being compared in the current step.' },
  vector_swap: { description: 'Records a swap between two indices.' },
  vector_set: { description: 'Updates the value at a single index of the tracked vector.' },
  vector_mark: { description: 'Applies an element state: Sorted, Pivot, Active, Found, etc.' },
  vector_range: { description: 'Highlights an inclusive [l, r] subrange of the vector.' },
  vector_discard: { description: 'Marks a subrange as discarded (e.g. in binary search).' },
  vector_probe: { description: 'Marks a single index as being inspected.' },
  vector_pivot: { description: 'Marks an index as the current partition pivot.' },
  vector_reset: { description: 'Resets element states in the vector to default.' },
  vector_step: { description: 'Emits a vector timeline frame with an optional caption.' },
  vector_result: { description: 'Records the final array state.' },
  graph_node_state: { description: 'Sets the algorithmic state of a vertex (Queued, Visiting, Done).' },
  graph_edge_state: { description: 'Sets the algorithmic state of an edge.' },
  graph_value: { description: 'Displays an auxiliary value (such as dist) next to a vertex.' },
  graph_component: { description: 'Assigns a vertex to a connected component ID for coloring.' },
  graph_path: { description: 'Marks an entire sequence of vertices as the active path.' },
  graph_reset: { description: 'Clears algorithmic states and highlights on the graph.' },
  escape_json: {
    description: 'Escapes a string for JSON serialization (used internally by visualizer.h).',
    notes: 'Public helper function; does not emit a trace frame by itself.',
  },
  state_name: {
    description: 'Converts a VectorState, NodeState, or EdgeState enum value into its string name.',
    notes: 'Available overloads cover VectorState, NodeState, and EdgeState.',
  },
};
