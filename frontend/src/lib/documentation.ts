export type DocumentationCategory = 'Grafo' | 'Vetores' | 'Estruturas' | 'Execução' | 'Auxiliares';

export interface DocumentationMethod {
  name: string;
  signature: string;
  category: DocumentationCategory;
  description: string;
  example: string;
  stdin?: string;
  notes?: string;
}

const base = `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
`;

const finish = `}
`;

export const documentationMethods: DocumentationMethod[] = [
  {
    name: 'set_directed',
    signature: 'void set_directed(bool directed)',
    category: 'Grafo',
    description: 'Define se as arestas serão exibidas com direção.',
    example: `${base}    viz::set_directed(true);
    viz::add_node(1, "Origem");
    viz::add_node(2, "Destino");
    viz::add_edge(1, 2);
${finish}`,
  },
  {
    name: 'set_weighted',
    signature: 'void set_weighted(bool weighted)',
    category: 'Grafo',
    description: 'Ativa ou desativa a exibição dos pesos das arestas.',
    example: `${base}    viz::set_weighted(true);
    viz::add_node(1, "A");
    viz::add_node(2, "B");
    viz::add_edge(1, 2, 8);
${finish}`,
  },
  {
    name: 'add_node',
    signature: 'void add_node(int id, const string& label = "")',
    category: 'Grafo',
    description: 'Cria um vértice ou atualiza o rótulo de um vértice existente.',
    example: `${base}    viz::add_node(1, "Servidor");
    viz::add_node(2, "Cliente");
    viz::add_edge(1, 2);
${finish}`,
  },
  {
    name: 'add_edge',
    signature: 'void add_edge(int u, int v, int weight = 1)',
    category: 'Grafo',
    description: 'Cria uma aresta entre dois vértices, opcionalmente com peso.',
    example: `${base}    viz::add_node(1, "A");
    viz::add_node(2, "B");
    viz::add_edge(1, 2, 42);
${finish}`,
  },
  {
    name: 'remove_node',
    signature: 'void remove_node(int id)',
    category: 'Grafo',
    description: 'Remove um vértice e as arestas conectadas a ele.',
    example: `${base}    viz::add_node(1, "A");
    viz::add_node(2, "B");
    viz::add_edge(1, 2);
    viz::remove_node(2);
${finish}`,
  },
  {
    name: 'remove_edge',
    signature: 'void remove_edge(int u, int v)',
    category: 'Grafo',
    description: 'Remove a aresta entre dois vértices.',
    example: `${base}    viz::add_node(1);
    viz::add_node(2);
    viz::add_edge(1, 2);
    viz::remove_edge(1, 2);
${finish}`,
  },
  {
    name: 'set_weight',
    signature: 'void set_weight(int u, int v, int weight)',
    category: 'Grafo',
    description: 'Altera o peso de uma aresta já criada.',
    example: `${base}    viz::add_node(1);
    viz::add_node(2);
    viz::add_edge(1, 2, 3);
    viz::set_weight(1, 2, 9);
${finish}`,
  },
  {
    name: 'highlight',
    signature: 'void highlight(int id, const string& color = "red")',
    category: 'Grafo',
    description: 'Destaca um vértice com um nome de cor ou valor CSS.',
    example: `${base}    viz::add_node(1, "Importante");
    viz::highlight(1, "emerald");
${finish}`,
  },
  {
    name: 'highlight_edge',
    signature: 'void highlight_edge(int u, int v, const string& color = "red")',
    category: 'Grafo',
    description: 'Destaca uma aresta existente.',
    example: `${base}    viz::add_node(1);
    viz::add_node(2);
    viz::add_edge(1, 2);
    viz::highlight_edge(1, 2, "orange");
${finish}`,
  },
  {
    name: 'highlight_path',
    signature: 'void highlight_path(const vector<int>& path, const string& color = "emerald")',
    category: 'Grafo',
    description: 'Destaca todos os vértices e arestas consecutivas de um caminho.',
    example: `${base}    for (int id = 1; id <= 4; id++) viz::add_node(id);
    viz::add_edge(1, 2);
    viz::add_edge(2, 3);
    viz::add_edge(3, 4);
    viz::highlight_path({1, 2, 3, 4});
${finish}`,
  },
  {
    name: 'reset_colors',
    signature: 'void reset_colors()',
    category: 'Grafo',
    description: 'Remove os destaques de todos os elementos do grafo.',
    example: `${base}    viz::add_node(1);
    viz::highlight(1, "red");
    viz::reset_colors();
${finish}`,
  },
  {
    name: 'set_label',
    signature: 'void set_label(int id, const string& label)',
    category: 'Grafo',
    description: 'Atualiza o texto exibido dentro de um vértice.',
    example: `${base}    viz::add_node(1, "aguardando");
    viz::set_label(1, "visitado");
${finish}`,
  },
  {
    name: 'set_color',
    signature: 'void set_color(int id, const string& color)',
    category: 'Grafo',
    description: 'Define a cor de um vértice e o deixa destacado.',
    example: `${base}    viz::add_node(1, "pivot");
    viz::set_color(1, "#a855f7");
${finish}`,
  },
  {
    name: 'step',
    signature: 'void step(const string& caption)',
    category: 'Execução',
    description: 'Cria um frame manual na linha do tempo com uma legenda.',
    example: `${base}    viz::step("início da busca");
    viz::add_node(1, "A");
    viz::step("vértice criado");
${finish}`,
  },
  {
    name: 'print',
    signature: 'template <typename T> void print(const T& value)',
    category: 'Execução',
    description: 'Mostra uma mensagem no terminal da execução sem alterar a visualização.',
    example: `${base}    viz::print("processando entrada");
    viz::print(2026);
${finish}`,
  },
  {
    name: 'set_badge',
    signature: 'void set_badge(int id, const string& text)',
    category: 'Grafo',
    description: 'Exibe um pequeno indicador textual sobre um vértice.',
    example: `${base}    viz::add_node(1, "A");
    viz::set_badge(1, "fila");
${finish}`,
  },
  {
    name: 'set_edge_style',
    signature: 'void set_edge_style(int u, int v, const string& style)',
    category: 'Grafo',
    description: 'Aplica um estilo visual à aresta, como dashed ou solid.',
    example: `${base}    viz::add_node(1);
    viz::add_node(2);
    viz::add_edge(1, 2);
    viz::set_edge_style(1, 2, "dashed");
${finish}`,
  },
  {
    name: 'set_edge_label',
    signature: 'void set_edge_label(int u, int v, const string& label)',
    category: 'Grafo',
    description: 'Define o texto exibido sobre uma aresta.',
    example: `${base}    viz::add_node(1);
    viz::add_node(2);
    viz::add_edge(1, 2, 5);
    viz::set_edge_label(1, 2, "custo");
${finish}`,
  },
  {
    name: 'set_multigraph',
    signature: 'void set_multigraph(bool multi)',
    category: 'Grafo',
    description: 'Informa ao visualizador que o grafo pode ter arestas paralelas.',
    example: `${base}    viz::set_multigraph(true);
    viz::add_node(1);
    viz::add_node(2);
    viz::add_edge(1, 2, 4);
    viz::add_edge(1, 2, 7);
${finish}`,
  },
  {
    name: 'show',
    signature: 'void show(const string& name, const vector<T>& items)',
    category: 'Estruturas',
    description: 'Renderiza uma coleção como uma estrutura nomeada no painel lateral.',
    example: `${base}    vector<int> fila = {3, 8, 13};
    viz::show("fila", fila);
${finish}`,
  },
  {
    name: 'show_matrix',
    signature: 'void show_matrix(const string& name, const vector<vector<T>>& matrix)',
    category: 'Estruturas',
    description: 'Renderiza uma matriz no painel de estruturas auxiliares.',
    example: `${base}    vector<vector<int>> matriz = {{0, 1}, {1, 0}};
    viz::show_matrix("adjacência", matriz);
${finish}`,
  },
  {
    name: 'vector_init',
    signature: 'void vector_init(const string& name, const vector<T>& values)',
    category: 'Vetores',
    description: 'Inicializa um vetor visualizável com valores inteiros.',
    example: `${base}    viz::vector_init("a", vector<int>{7, 2, 5});
${finish}`,
  },
  {
    name: 'vector_compare',
    signature: 'void vector_compare(const string& name, int a, int b, const string& caption = "")',
    category: 'Vetores',
    description: 'Marca dois índices como comparação no frame atual.',
    example: `${base}    viz::vector_init("a", vector<int>{7, 2, 5});
    viz::vector_compare("a", 0, 1, "7 > 2");
    viz::vector_step("a");
${finish}`,
  },
  {
    name: 'vector_swap',
    signature: 'void vector_swap(const string& name, int a, int b, const string& caption = "")',
    category: 'Vetores',
    description: 'Registra uma troca entre dois índices.',
    example: `${base}    vector<int> a = {7, 2};
    viz::vector_init("a", a);
    swap(a[0], a[1]);
    viz::vector_swap("a", 0, 1, "troca");
${finish}`,
  },
  {
    name: 'vector_set',
    signature: 'void vector_set(const string& name, int index, long long value, const string& caption = "")',
    category: 'Vetores',
    description: 'Atualiza o valor de uma posição do vetor visualizado.',
    example: `${base}    viz::vector_init("a", vector<int>{1, 2, 3});
    viz::vector_set("a", 1, 99, "novo valor");
${finish}`,
  },
  {
    name: 'vector_mark',
    signature: 'void vector_mark(const string& name, int index, VectorState state)',
    category: 'Vetores',
    description: 'Aplica um estado visual: Sorted, Pivot, Active, Found e outros.',
    example: `${base}    viz::vector_init("a", vector<int>{4, 9});
    viz::vector_mark("a", 1, viz::VectorState::Found);
${finish}`,
  },
  {
    name: 'vector_range',
    signature: 'void vector_range(const string& name, int begin, int end, const string& caption = "")',
    category: 'Vetores',
    description: 'Seleciona um intervalo inclusivo do vetor.',
    example: `${base}    viz::vector_init("a", vector<int>{1, 2, 3, 4, 5});
    viz::vector_range("a", 1, 3, "intervalo ativo");
${finish}`,
  },
  {
    name: 'vector_discard',
    signature: 'void vector_discard(const string& name, int begin, int end)',
    category: 'Vetores',
    description: 'Marca um intervalo como descartado, útil em buscas.',
    example: `${base}    viz::vector_init("a", vector<int>{1, 3, 5, 7});
    viz::vector_discard("a", 0, 1);
${finish}`,
  },
  {
    name: 'vector_probe',
    signature: 'void vector_probe(const string& name, int index, const string& caption = "")',
    category: 'Vetores',
    description: 'Marca uma posição como o índice investigado.',
    example: `${base}    viz::vector_init("a", vector<int>{2, 4, 6});
    viz::vector_probe("a", 1, "meio do intervalo");
${finish}`,
  },
  {
    name: 'vector_pivot',
    signature: 'void vector_pivot(const string& name, int index, const string& caption = "")',
    category: 'Vetores',
    description: 'Marca uma posição como pivô.',
    example: `${base}    viz::vector_init("a", vector<int>{3, 1, 2});
    viz::vector_pivot("a", 0, "pivô escolhido");
${finish}`,
  },
  {
    name: 'vector_reset',
    signature: 'void vector_reset(const string& name)',
    category: 'Vetores',
    description: 'Limpa as marcações visuais do vetor sem remover seus valores.',
    example: `${base}    viz::vector_init("a", vector<int>{3, 1});
    viz::vector_mark("a", 0, viz::VectorState::Comparing);
    viz::vector_reset("a");
${finish}`,
  },
  {
    name: 'vector_step',
    signature: 'void vector_step(const string& name, const string& caption = "")',
    category: 'Vetores',
    description: 'Congela um frame do vetor e opcionalmente adiciona uma legenda.',
    example: `${base}    viz::vector_init("a", vector<int>{3, 1});
    viz::vector_step("a", "estado inicial");
${finish}`,
  },
  {
    name: 'vector_result',
    signature: 'void vector_result(const string& name, const vector<T>& values)',
    category: 'Vetores',
    description: 'Registra o resultado final do vetor.',
    example: `${base}    vector<int> ordenado = {1, 2, 3};
    viz::vector_result("a", ordenado);
${finish}`,
  },
  {
    name: 'graph_node_state',
    signature: 'void graph_node_state(int id, NodeState state)',
    category: 'Grafo',
    description: 'Marca um vértice como Queued, Visiting ou Done.',
    example: `${base}    viz::add_node(1, "A");
    viz::graph_node_state(1, viz::NodeState::Visiting);
${finish}`,
  },
  {
    name: 'graph_edge_state',
    signature: 'void graph_edge_state(int u, int v, EdgeState state)',
    category: 'Grafo',
    description: 'Marca o estado algorítmico de uma aresta.',
    example: `${base}    viz::add_node(1);
    viz::add_node(2);
    viz::add_edge(1, 2);
    viz::graph_edge_state(1, 2, viz::EdgeState::Accepted);
${finish}`,
  },
  {
    name: 'graph_value',
    signature: 'void graph_value(int id, const string& text)',
    category: 'Grafo',
    description: 'Exibe um valor auxiliar associado a um vértice.',
    example: `${base}    viz::add_node(1, "A");
    viz::graph_value(1, "dist = 4");
${finish}`,
  },
  {
    name: 'graph_component',
    signature: 'void graph_component(int id, int component)',
    category: 'Grafo',
    description: 'Atribui um vértice a um componente para coloração analítica.',
    example: `${base}    viz::add_node(1);
    viz::graph_component(1, 2);
${finish}`,
  },
  {
    name: 'graph_path',
    signature: 'void graph_path(const vector<int>& path)',
    category: 'Grafo',
    description: 'Destaca um caminho inteiro de uma só vez.',
    example: `${base}    for (int id = 1; id <= 3; id++) viz::add_node(id);
    viz::add_edge(1, 2);
    viz::add_edge(2, 3);
    viz::graph_path({1, 2, 3});
${finish}`,
  },
  {
    name: 'graph_reset',
    signature: 'void graph_reset()',
    category: 'Grafo',
    description: 'Limpa estados algorítmicos e destaques do grafo.',
    example: `${base}    viz::add_node(1);
    viz::highlight(1);
    viz::graph_reset();
${finish}`,
  },
  {
    name: 'escape_json',
    signature: 'string escape_json(const string& value)',
    category: 'Auxiliares',
    description: 'Escapa textos para JSON; normalmente é usado internamente pelas outras funções.',
    example: `${base}    cout << viz::escape_json("texto com \\"aspas\\"");
${finish}`,
    notes: 'É uma função auxiliar pública, mas não cria um passo visual por si só.',
  },
  {
    name: 'state_name',
    signature: 'const char* state_name(VectorState | NodeState | EdgeState)',
    category: 'Auxiliares',
    description: 'Converte um estado visual em seu nome textual; há uma sobrecarga para cada enum de estado.',
    example: `${base}    auto vetor = viz::state_name(viz::VectorState::Sorted);
    auto no = viz::state_name(viz::NodeState::Visiting);
    auto aresta = viz::state_name(viz::EdgeState::Accepted);
    viz::print(string(vetor) + ", " + no + ", " + aresta);
${finish}`,
    notes: 'Os estados disponíveis são VectorState, NodeState e EdgeState.',
  },
];
