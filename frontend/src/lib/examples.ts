export interface Example {
  id: string;
  name: string;
  code: string;
  stdin: string;
  description: string;
  category: string;
  tags: string[];
  timeComplexity: string;
  memoryComplexity: string;
}

const define = (
  id: string,
  name: string,
  category: string,
  stdin: string,
  code: string,
  description: string,
  timeComplexity: string,
  memoryComplexity: string,
  tags: string[],
): Example => ({ id, name, category, stdin, code, description, timeComplexity, memoryComplexity, tags });

export const examples: Example[] = [
  define(
    'bubble-sort',
    'Bubble Sort',
    'Ordenação',
    `7
6 3 8 2 9 1 5
`,
    `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<int> a(n);
    for (int& x : a) cin >> x;
    viz::vector_init("a", a);
    viz::vector_step("a", "vetor inicial");
    for (int i = 0; i < n - 1; i++) {
        bool trocou = false;
        viz::vector_range("a", 0, n - 1 - i, "passada " + to_string(i + 1) + ": compara pares adjacentes em [0, " + to_string(n - 1 - i) + "]");
        for (int j = 0; j + 1 < n - i; j++) {
            viz::vector_compare("a", j, j + 1, "a[" + to_string(j) + "] > a[" + to_string(j + 1) + "]?");
            viz::vector_step("a");
            if (a[j] > a[j + 1]) {
                swap(a[j], a[j + 1]);
                trocou = true;
                viz::vector_swap("a", j, j + 1, "troca a[" + to_string(j) + "] com a[" + to_string(j + 1) + "]");
                viz::vector_step("a");
            }
        }
        viz::vector_mark("a", n - 1 - i, viz::VectorState::Sorted);
        viz::vector_step("a", "a[" + to_string(n - 1 - i) + "] está na posição final");
        if (!trocou) {
            for (int k = 0; k < n - 1 - i; k++) viz::vector_mark("a", k, viz::VectorState::Sorted);
            viz::vector_step("a", "nenhuma troca na passada: o vetor já está ordenado");
            break;
        }
    }
    if (n > 0) viz::vector_mark("a", 0, viz::VectorState::Sorted);
    viz::vector_result("a", a);
    for (int i = 0; i < n; i++) cout << a[i] << " ";
    cout << endl;
}
`,
    'Percorre o vetor trocando pares adjacentes fora de ordem; o maior elemento do trecho "flutua" até o fim a cada passada, com parada antecipada. Entrada: n e os valores.',
    'O(n²)',
    'O(1)',
    ['ordenação', 'bubble sort', 'vetores', 'trocas'],
  ),
  define(
    'binary-search',
    'Busca binária',
    'Busca',
    `8
1 3 5 7 9 11 13 15
11
`,
    `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n, alvo;
    cin >> n;
    vector<int> a(n);
    for (int& x : a) cin >> x;
    cin >> alvo;
    viz::vector_init("a", a);
    viz::vector_step("a", "vetor ordenado; alvo = " + to_string(alvo));
    int l = 0, r = n - 1, resposta = -1;
    while (l <= r) {
        int m = l + (r - l) / 2;
        viz::vector_range("a", l, r, "intervalo [" + to_string(l) + ", " + to_string(r) + "]");
        viz::vector_probe("a", m, "meio = " + to_string(m) + ", a[m] = " + to_string(a[m]) + ", alvo = " + to_string(alvo));
        viz::vector_step("a");
        if (a[m] == alvo) {
            resposta = m;
            viz::vector_mark("a", m, viz::VectorState::Found);
            viz::vector_step("a", "alvo encontrado no índice " + to_string(m));
            break;
        }
        if (a[m] < alvo) {
            viz::vector_discard("a", l, m);
            l = m + 1;
            viz::vector_step("a", "a[m] < alvo: descarta a metade esquerda");
        } else {
            viz::vector_discard("a", m, r);
            r = m - 1;
            viz::vector_step("a", "a[m] > alvo: descarta a metade direita");
        }
    }
    if (resposta == -1) viz::vector_step("a", "intervalo vazio: alvo ausente");
    viz::print(resposta == -1 ? "Elemento nao encontrado" : "Indice: " + to_string(resposta));
}`,
    'Busca binária em vetor ordenado, descartando metade do intervalo a cada comparação. Entrada: n, vetor, alvo.',
    'O(log n)',
    'O(1)',
    ['busca', 'binária', 'vetores', 'intervalo'],
  ),
  define(
    'two-pointers',
    'Dois ponteiros',
    'Vetores',
    `7 10
1 2 3 4 6 8 9
`,
    `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n, alvo;
    cin >> n >> alvo;
    vector<int> a(n);
    for (int& x : a) cin >> x;
    viz::vector_init("a", a);
    viz::vector_step("a", "vetor ordenado; soma alvo = " + to_string(alvo));
    int l = 0, r = n - 1;
    while (l < r) {
        int soma = a[l] + a[r];
        viz::vector_range("a", l, r, "ponteiros l = " + to_string(l) + ", r = " + to_string(r));
        viz::vector_compare("a", l, r, "a[l] + a[r] = " + to_string(soma) + ", alvo = " + to_string(alvo));
        viz::vector_step("a");
        if (soma == alvo) {
            viz::vector_mark("a", l, viz::VectorState::Found);
            viz::vector_mark("a", r, viz::VectorState::Found);
            viz::vector_step("a", "par encontrado: " + to_string(a[l]) + " + " + to_string(a[r]));
            viz::print("Par encontrado: " + to_string(a[l]) + " + " + to_string(a[r]));
            return 0;
        }
        if (soma < alvo) {
            viz::vector_mark("a", l, viz::VectorState::Discarded);
            l++;
            viz::vector_step("a", "soma menor que o alvo: l avança");
        } else {
            viz::vector_mark("a", r, viz::VectorState::Discarded);
            r--;
            viz::vector_step("a", "soma maior que o alvo: r recua");
        }
    }
    viz::vector_step("a", "ponteiros se cruzaram: nenhum par");
    viz::print("Nenhum par encontrado");
}`,
    'Dois ponteiros em vetor ordenado para achar um par com soma alvo. Entrada: n, alvo e vetor.',
    'O(n)',
    'O(1)',
    ['ponteiros', 'vetores', 'soma'],
  ),
  define(
    'segment-tree',
    'Árvore de segmentos: soma',
    'Estruturas',
    `6
2 4 1 7 3 5
3
1 3
2 6
4 5
`,
    `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;
vector<long long> a, seg;

void build(int p, int l, int r) {
    viz::add_node(p, "[" + to_string(l) + "," + to_string(r) + "]");
    if (p > 1) viz::add_edge(p / 2, p);
    viz::graph_node_state(p, viz::NodeState::Visiting);
    viz::step("constrói o nó " + to_string(p) + " para o intervalo [" + to_string(l) + ", " + to_string(r) + "]");
    if (l == r) {
        seg[p] = a[l];
    } else {
        int m = (l + r) / 2;
        build(p * 2, l, m);
        build(p * 2 + 1, m + 1, r);
        seg[p] = seg[p * 2] + seg[p * 2 + 1];
    }
    viz::graph_value(p, to_string(seg[p]));
    viz::graph_node_state(p, viz::NodeState::Done);
    viz::step("nó " + to_string(p) + " guarda a soma " + to_string(seg[p]));
}

long long query(int p, int l, int r, int ql, int qr) {
    if (qr < l || r < ql) return 0;
    viz::graph_node_state(p, viz::NodeState::Visiting);
    viz::step("visita o nó " + to_string(p) + " [" + to_string(l) + ", " + to_string(r) + "]");
    if (ql <= l && r <= qr) {
        viz::graph_node_state(p, viz::NodeState::Done);
        viz::step("intervalo totalmente coberto: usa " + to_string(seg[p]));
        return seg[p];
    }
    int m = (l + r) / 2;
    return query(p * 2, l, m, ql, qr) + query(p * 2 + 1, m + 1, r, ql, qr);
}

int main() {
    int n, q;
    cin >> n;
    a.assign(n + 1, 0);
    for (int i = 1; i <= n; i++) cin >> a[i];
    seg.assign(4 * n + 4, 0);
    build(1, 1, n);
    cin >> q;
    while (q--) {
        int l, r;
        cin >> l >> r;
        viz::graph_reset();
        viz::step("consulta [" + to_string(l) + ", " + to_string(r) + "]");
        long long resposta = query(1, 1, n, l, r);
        viz::print("Soma: " + to_string(resposta));
    }
}
`,
    'Árvore de segmentos para soma: construção, intervalos dos nós e caminho percorrido nas consultas. Entrada: n, vetor e consultas.',
    'O((n + q) log n)',
    'O(n)',
    ['segment tree', 'consulta', 'árvore', 'intervalo'],
  ),
  define(
    'bfs-shortest-path',
    'BFS: menor caminho não ponderado',
    'Grafos',
    `7 7
1 2
1 3
2 4
3 4
4 5
5 6
6 7
1 7
`,
    `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n, m, s, t;
    cin >> n >> m;
    vector<vector<int>> adj(n + 1);
    viz::set_directed(false);
    for (int i = 1; i <= n; i++) viz::add_node(i, to_string(i));
    for (int i = 0; i < m; i++) {
        int u, v;
        cin >> u >> v;
        viz::add_edge(u, v);
        adj[u].push_back(v);
        adj[v].push_back(u);
    }
    cin >> s >> t;
    vector<int> d(n + 1, -1), pai(n + 1);
    queue<int> q;
    auto fila = [&]() {
        vector<int> itens;
        for (queue<int> c = q; !c.empty(); c.pop()) itens.push_back(c.front());
        return itens;
    };
    q.push(s);
    d[s] = 0;
    viz::graph_node_state(s, viz::NodeState::Queued);
    viz::graph_value(s, "d=0");
    viz::vector_init("fila", fila());
    viz::vector_init("dist", d);
    viz::step("origem " + to_string(s) + " entra na fila; dist -1 significa não visitado");
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        viz::graph_node_state(u, viz::NodeState::Visiting);
        viz::vector_init("fila", fila());
        viz::step("extrai " + to_string(u) + " da fila (d = " + to_string(d[u]) + ")");
        for (int v : adj[u]) {
            if (d[v] != -1) continue;
            d[v] = d[u] + 1;
            pai[v] = u;
            q.push(v);
            viz::graph_edge_state(u, v, viz::EdgeState::Tree);
            viz::graph_node_state(v, viz::NodeState::Queued);
            viz::graph_value(v, "d=" + to_string(d[v]));
            viz::vector_set("dist", v, d[v]);
            viz::vector_init("fila", fila());
            viz::step("descobre " + to_string(v) + " a partir de " + to_string(u));
        }
        viz::graph_node_state(u, viz::NodeState::Done);
        viz::step("vértice " + to_string(u) + " concluído");
    }
    vector<int> caminho;
    for (int v = t; v; v = pai[v]) caminho.push_back(v);
    reverse(caminho.begin(), caminho.end());
    if (d[t] != -1) {
        viz::graph_path(caminho);
        viz::step("caminho mínimo destacado");
    }
    viz::print(d[t] == -1 ? "Sem caminho" : "Distancia: " + to_string(d[t]));
}`,
    'BFS para menor caminho em grafo não ponderado, com fila, distâncias e caminho final. Entrada: n, m, arestas, origem e destino.',
    'O(V + E)',
    'O(V)',
    ['bfs', 'fila', 'menor caminho', 'grafos'],
  ),
  define(
    'dfs',
    'DFS: busca em profundidade',
    'Grafos',
    `7 8
1 2
1 3
2 4
2 5
3 6
5 7
6 7
4 5
1
`,
    `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n, m, s;
    cin >> n >> m;
    vector<vector<int>> adj(n + 1);
    viz::set_directed(false);
    for (int i = 1; i <= n; i++) viz::add_node(i, to_string(i));
    for (int i = 0; i < m; i++) {
        int u, v;
        cin >> u >> v;
        viz::add_edge(u, v);
        adj[u].push_back(v);
        adj[v].push_back(u);
    }
    cin >> s;
    vector<int> vis(n + 1), pilha, ordem;
    viz::vector_init("pilha", pilha);
    viz::vector_init("ordem", ordem);
    viz::step("DFS começa em " + to_string(s));
    function<void(int, int)> dfs = [&](int u, int pai) {
        vis[u] = 1;
        pilha.push_back(u);
        ordem.push_back(u);
        viz::graph_node_state(u, viz::NodeState::Visiting);
        viz::graph_value(u, "t=" + to_string(ordem.size()));
        viz::vector_init("pilha", pilha);
        viz::vector_init("ordem", ordem);
        viz::step("entra em " + to_string(u) + " (ordem de visita " + to_string(ordem.size()) + ")");
        for (int v : adj[u]) {
            if (v == pai) continue;
            if (vis[v]) {
                viz::graph_edge_state(u, v, viz::EdgeState::Rejected);
                viz::step("aresta " + to_string(u) + " - " + to_string(v) + " leva a um vértice já visitado");
                continue;
            }
            viz::graph_edge_state(u, v, viz::EdgeState::Tree);
            viz::step("desce de " + to_string(u) + " para " + to_string(v));
            dfs(v, u);
            viz::step("volta para " + to_string(u));
        }
        pilha.pop_back();
        viz::graph_node_state(u, viz::NodeState::Done);
        viz::vector_init("pilha", pilha);
        viz::step("vértice " + to_string(u) + " concluído");
    };
    dfs(s, 0);
    viz::print("Vertices visitados: " + to_string(ordem.size()));
}`,
    'DFS recursiva: pilha de chamadas, ordem de visita, arestas da árvore e arestas para vértices já visitados. Entrada: n, m, arestas e origem.',
    'O(V + E)',
    'O(V)',
    ['dfs', 'pilha', 'recursão', 'grafos'],
  ),
  define(
    'dijkstra',
    'Dijkstra',
    'Grafos',
    `5 7
1 2 4
1 3 2
2 3 1
2 4 5
3 4 8
3 5 10
4 5 2
1 5
`,
    `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n, m, s, t;
    cin >> n >> m;
    vector<vector<pair<int,int>>> adj(n + 1);
    viz::set_directed(false);
    for (int i = 1; i <= n; i++) viz::add_node(i, to_string(i));
    for (int i = 0; i < m; i++) {
        int u, v, w;
        cin >> u >> v >> w;
        viz::add_edge(u, v, w);
        adj[u].push_back({v, w});
        adj[v].push_back({u, w});
    }
    cin >> s >> t;
    const int INF = 1e9;
    vector<int> d(n + 1, INF), pai(n + 1);
    auto visivel = [&]() {
        vector<int> out(d);
        for (int& x : out) if (x == INF) x = -1;
        return out;
    };
    priority_queue<pair<int,int>, vector<pair<int,int>>, greater<>> pq;
    d[s] = 0;
    pq.push({0, s});
    viz::graph_value(s, "0");
    viz::vector_init("dist", visivel());
    viz::vector_init("pai", pai);
    viz::step("origem " + to_string(s) + " com distância 0; dist -1 significa infinito");
    while (!pq.empty()) {
        auto [du, u] = pq.top();
        pq.pop();
        if (du != d[u]) continue;
        viz::graph_node_state(u, viz::NodeState::Visiting);
        viz::step("extrai " + to_string(u) + " da fila de prioridade com distância " + to_string(du));
        for (auto [v, w] : adj[u]) {
            if (d[v] <= d[u] + w) continue;
            d[v] = d[u] + w;
            pai[v] = u;
            pq.push({d[v], v});
            viz::graph_edge_state(u, v, viz::EdgeState::Relaxed);
            viz::graph_value(v, to_string(d[v]));
            viz::vector_set("dist", v, d[v]);
            viz::vector_set("pai", v, u);
            viz::step("relaxa " + to_string(u) + " -> " + to_string(v) + ": dist[" + to_string(v) + "] = " + to_string(d[v]));
        }
        viz::graph_node_state(u, viz::NodeState::Done);
        viz::step("vértice " + to_string(u) + " finalizado");
    }
    vector<int> path;
    for (int v = t; v; v = pai[v]) path.push_back(v);
    reverse(path.begin(), path.end());
    if (d[t] < INF) {
        viz::graph_path(path);
        viz::step("caminho mínimo destacado");
    }
    viz::print(d[t] == INF ? "Sem caminho" : "Distancia minima: " + to_string(d[t]));
}`,
    'Dijkstra para pesos não negativos: extração, relaxamento, predecessores e caminho final. Entrada: n, m, arestas, origem e destino.',
    'O((V + E) log V)',
    'O(V + E)',
    ['dijkstra', 'relaxamento', 'menor caminho', 'grafos'],
  ),
  define(
    'kruskal',
    'Kruskal: árvore geradora mínima',
    'Grafos',
    `5 7
1 2 4
1 3 2
2 3 1
2 4 5
3 4 8
3 5 10
4 5 2
`,
    `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;
struct DSU {
    vector<int> p;

    DSU(int n) : p(n + 1) {
        iota(p.begin(), p.end(), 0);
    }

    int find(int x) {
        return p[x] == x ? x : p[x] = find(p[x]);
    }

    bool join(int a, int b) {
        a = find(a);
        b = find(b);
        if (a == b) return false;
        p[a] = b;
        return true;
    }
};
int main() {
    int n, m;
    cin >> n >> m;
    vector<array<int, 3>> e(m);
    for (auto& [u, v, w] : e) cin >> u >> v >> w;

    viz::set_directed(false);
    for (int i = 1; i <= n; i++) viz::add_node(i, to_string(i));
    for (auto [u, v, w] : e) viz::add_edge(u, v, w);

    sort(e.begin(), e.end(), [](auto a, auto b) {
        return a[2] < b[2];
    });
    DSU dsu(n);
    auto componentes = [&]() {
        vector<int> comp(n + 1);
        for (int i = 1; i <= n; i++) comp[i] = dsu.find(i);
        return comp;
    };
    viz::vector_init("componente", componentes());
    viz::step("arestas ordenadas por peso");
    int total = 0;
    for (auto [u, v, w] : e) {
        viz::graph_edge_state(u, v, viz::EdgeState::Candidate);
        viz::step("candidata (" + to_string(u) + ", " + to_string(v) + ") com peso " + to_string(w));
        if (dsu.join(u, v)) {
            total += w;
            viz::graph_edge_state(u, v, viz::EdgeState::Accepted);
            viz::vector_init("componente", componentes());
            viz::step("aceita: une componentes; custo acumulado = " + to_string(total));
        } else {
            viz::graph_edge_state(u, v, viz::EdgeState::Rejected);
            viz::step("rejeita: formaria ciclo");
        }
    }
    viz::print("Custo da AGM: " + to_string(total));
}`,
    'Kruskal com DSU: arestas candidatas, aceitação ou rejeição e componentes antes e depois. Entrada: n, m e arestas ponderadas.',
    'O(E log E)',
    'O(V)',
    ['kruskal', 'agm', 'dsu', 'grafos'],
  ),
  define(
    'topological-sort',
    'Kahn: ordenação topológica',
    'Grafos',
    `6 6
1 2
1 3
2 4
3 4
4 5
4 6
`,
    `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;
int main() {
    int n, m;
    cin >> n >> m;
    vector<vector<int>> adj(n + 1);
    vector<int> in(n + 1);
    for (int i = 1; i <= n; i++) viz::add_node(i, to_string(i));
    for (int i = 0; i < m; i++) {
        int u, v;
        cin >> u >> v;
        viz::add_edge(u, v);
        adj[u].push_back(v);
        in[v]++;
    }
    queue<int> q;
    auto fila = [&]() {
        vector<int> itens;
        for (queue<int> c = q; !c.empty(); c.pop()) itens.push_back(c.front());
        return itens;
    };
    for (int i = 1; i <= n; i++) {
        if (in[i]) continue;
        q.push(i);
        viz::graph_node_state(i, viz::NodeState::Queued);
    }
    vector<int> order;
    viz::vector_init("grau", in);
    viz::vector_init("fila", fila());
    viz::vector_init("ordem", order);
    viz::step("vértices com grau de entrada 0 entram na fila");
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        order.push_back(u);
        viz::graph_node_state(u, viz::NodeState::Visiting);
        viz::vector_init("fila", fila());
        viz::vector_init("ordem", order);
        viz::step("processa " + to_string(u));
        for (int v : adj[u]) {
            viz::graph_edge_state(u, v, viz::EdgeState::Removed);
            --in[v];
            viz::vector_set("grau", v, in[v]);
            if (!in[v]) {
                q.push(v);
                viz::graph_node_state(v, viz::NodeState::Queued);
            }
            viz::vector_init("fila", fila());
            viz::step("remove a aresta " + to_string(u) + " -> " + to_string(v) + ": grau[" + to_string(v) + "] = " + to_string(in[v]));
        }
        viz::graph_node_state(u, viz::NodeState::Done);
    }
    viz::step(order.size() == n ? "todos os vértices foram processados" : "ciclo detectado: restaram vértices com grau de entrada maior que 0");
    viz::print(order.size() == n ? "DAG: ordem valida" : "Ciclo detectado");
}`,
    'Algoritmo de Kahn: graus de entrada, fila, arestas removidas e detecção de ciclo. Entrada: n, m e arestas dirigidas.',
    'O(V + E)',
    'O(V)',
    ['kahn', 'topológica', 'dag', 'grafos'],
  ),
  define(
    'knapsack',
    'Programação dinâmica: mochila 0/1',
    'DP',
    `4 7
1 1
3 4
4 5
5 7
`,
    `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;
int main() {
    int n, W;
    cin >> n >> W;
    vector<int> w(n), v(n);
    for (int i = 0; i < n; i++) cin >> w[i] >> v[i];
    vector<int> dp(W + 1);
    viz::vector_init("peso", w);
    viz::vector_init("valor", v);
    viz::vector_init("dp", dp);
    viz::vector_step("dp", "dp[c] guarda o melhor valor com capacidade c");
    for (int i = 0; i < n; i++) {
        viz::vector_reset("peso");
        viz::vector_reset("valor");
        viz::vector_mark("peso", i, viz::VectorState::Active);
        viz::vector_mark("valor", i, viz::VectorState::Active);
        viz::vector_range("dp", w[i], W, "item " + to_string(i + 1) + ": peso " + to_string(w[i]) + ", valor " + to_string(v[i]));
        for (int cap = W; cap >= w[i]; cap--) {
            int sem = dp[cap];
            int com = dp[cap - w[i]] + v[i];
            viz::vector_compare("dp", cap, cap - w[i], "capacidade " + to_string(cap) + ": sem o item = " + to_string(sem) + ", com o item = " + to_string(com));
            dp[cap] = max(sem, com);
            if (com > sem) viz::vector_set("dp", cap, dp[cap], "inclui o item: dp[" + to_string(cap) + "] = " + to_string(dp[cap]));
            viz::vector_step("dp");
        }
    }
    viz::vector_result("dp", dp);
    viz::print("Valor maximo: " + to_string(dp[W]));
}
`,
    'Mochila 0/1 com vetor dp unidimensional: item analisado, capacidade e decisão de incluir. Entrada: n, capacidade e itens.',
    'O(nW)',
    'O(W)',
    ['dp', 'mochila', 'knapsack', 'capacidade'],
  ),
  define(
    'sieve',
    'Crivo de Eratóstenes',
    'Matemática',
    `30
`,
    `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<int> numeros(n + 1);
    iota(numeros.begin(), numeros.end(), 0);
    viz::vector_init("crivo", numeros);
    vector<bool> prime(n + 1, true);
    prime[0] = prime[1] = false;
    viz::vector_mark("crivo", 0, viz::VectorState::Discarded);
    viz::vector_mark("crivo", 1, viz::VectorState::Discarded);
    viz::vector_step("crivo", "0 e 1 não são primos");
    for (int p = 2; p * p <= n; p++) {
        if (!prime[p]) continue;
        viz::vector_pivot("crivo", p, "primo atual: " + to_string(p));
        for (int x = p * p; x <= n; x += p) {
            prime[x] = false;
            viz::vector_mark("crivo", x, viz::VectorState::Discarded);
        }
        viz::vector_step("crivo", "múltiplos de " + to_string(p) + " eliminados a partir de " + to_string(p * p));
        viz::vector_pivot("crivo", -1);
    }
    vector<int> ans;
    for (int i = 2; i <= n; i++) {
        if (!prime[i]) continue;
        ans.push_back(i);
        viz::vector_mark("crivo", i, viz::VectorState::Found);
    }
    viz::vector_init("primos", ans);
    viz::vector_step("primos", "números confirmados como primos");
    viz::print("Quantidade de primos: " + to_string(ans.size()));
}
`,
    'Crivo de Eratóstenes: primo atual, múltiplos eliminados e primos confirmados. Entrada: limite superior n (n ≥ 1).',
    'O(n log log n)',
    'O(n)',
    ['crivo', 'primos', 'eratóstenes', 'vetores'],
  ),
  define(
    'greedy-activity',
    'Greedy: seleção de atividades',
    'Greedy',
    `6
1 3
2 5
4 7
6 9
8 10
5 6
`,
    `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<pair<int, int>> a(n);
    for (auto& [s, f] : a) cin >> s >> f;
    sort(a.begin(), a.end(), [](auto x, auto y) {
        return x.second < y.second;
    });
    vector<int> ini(n), fim(n), escolhidas;
    for (int i = 0; i < n; i++) {
        ini[i] = a[i].first;
        fim[i] = a[i].second;
    }
    viz::vector_init("inicio", ini);
    viz::vector_init("fim", fim);
    viz::vector_init("escolhidas", escolhidas);
    viz::vector_step("fim", "atividades ordenadas pelo horário de término");
    int ultimo = -1;
    for (int i = 0; i < n; i++) {
        viz::vector_mark("inicio", i, viz::VectorState::Active);
        viz::vector_mark("fim", i, viz::VectorState::Active);
        viz::step("avalia [" + to_string(ini[i]) + ", " + to_string(fim[i]) + "]; término da última escolhida = " + to_string(ultimo));
        if (ini[i] >= ultimo) {
            ultimo = fim[i];
            escolhidas.push_back(i + 1);
            viz::vector_mark("inicio", i, viz::VectorState::Found);
            viz::vector_mark("fim", i, viz::VectorState::Found);
            viz::vector_init("escolhidas", escolhidas);
            viz::step("começa depois do último término: escolhida");
        } else {
            viz::vector_mark("inicio", i, viz::VectorState::Discarded);
            viz::vector_mark("fim", i, viz::VectorState::Discarded);
            viz::step("sobrepõe a atividade escolhida: descartada");
        }
    }
    viz::print("Atividades escolhidas: " + to_string(escolhidas.size()));
}
`,
    'Escolhe sempre a atividade que termina primeiro e não conflita com as já escolhidas. Entrada: n e pares início/fim. "escolhidas" guarda a posição na ordem de término.',
    'O(n log n)',
    'O(n)',
    ['greedy', 'activity selection', 'ordenação', 'vetores'],
  ),
  define(
    'backtracking-subsets',
    'Backtracking: subconjuntos',
    'Backtracking',
    `3
1 2 3
`,
    `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<int> a(n), atual;
    for (int& x : a) cin >> x;
    int total = 0;
    viz::vector_init("a", a);
    viz::show("atual", atual);
    viz::step("cada elemento pode ficar de fora ou entrar no subconjunto");
    function<void(int)> go = [&](int i) {
        if (i == n) {
            total++;
            viz::show("atual", atual);
            viz::step("subconjunto " + to_string(total) + " completo");
            return;
        }
        viz::vector_reset("a");
        viz::vector_mark("a", i, viz::VectorState::Active);
        viz::step("decide a[" + to_string(i) + "] = " + to_string(a[i]) + ": primeiro sem ele");
        go(i + 1);
        atual.push_back(a[i]);
        viz::vector_reset("a");
        viz::vector_mark("a", i, viz::VectorState::Active);
        viz::show("atual", atual);
        viz::step("inclui " + to_string(a[i]));
        go(i + 1);
        atual.pop_back();
        viz::vector_reset("a");
        viz::vector_mark("a", i, viz::VectorState::Discarded);
        viz::show("atual", atual);
        viz::step("desfaz a escolha de " + to_string(a[i]) + " e volta");
    };
    go(0);
    viz::print("Subconjuntos: " + to_string(total));
}
`,
    'Gera todos os subconjuntos explorando as escolhas incluir/não incluir, com desfazer (backtrack) visível. Entrada: n e os valores.',
    'O(2ⁿ)',
    'O(n)',
    ['backtracking', 'recursão', 'subconjuntos'],
  ),
  define(
    'kmp',
    'KMP: busca de padrão',
    'Strings',
    `abracadabra
cada
`,
    `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    string s, p;
    getline(cin, s);
    getline(cin, p);
    int n = s.size(), m = p.size();
    if (m == 0 || n < m) {
        viz::print("Padrao nao encontrado");
        return 0;
    }
    vector<int> texto(s.begin(), s.end()), padrao(p.begin(), p.end()), pi(m);
    viz::vector_init("texto", texto);
    viz::vector_init("padrao", padrao);
    viz::vector_init("pi", pi);
    viz::vector_step("pi", "texto e padrão aparecem como códigos ASCII; pi[i] é a maior borda de padrao[0..i]");
    for (int i = 1, j = 0; i < m; i++) {
        while (j > 0 && p[i] != p[j]) {
            viz::vector_compare("padrao", i, j, "'" + string(1, p[i]) + "' != '" + string(1, p[j]) + "': j recua para pi[" + to_string(j - 1) + "] = " + to_string(pi[j - 1]));
            viz::vector_step("padrao");
            j = pi[j - 1];
        }
        viz::vector_compare("padrao", i, j, "compara '" + string(1, p[i]) + "' com '" + string(1, p[j]) + "'");
        if (p[i] == p[j]) j++;
        pi[i] = j;
        viz::vector_set("pi", i, j, "pi[" + to_string(i) + "] = " + to_string(j));
        viz::vector_step("pi");
    }
    auto compara = [&](int i, int j, const string& legenda) {
        viz::vector_reset("texto");
        viz::vector_reset("padrao");
        viz::vector_mark("texto", i, viz::VectorState::Comparing);
        viz::vector_mark("padrao", j, viz::VectorState::Comparing);
        viz::step(legenda);
    };
    int pos = -1;
    for (int i = 0, j = 0; i < n; i++) {
        while (j > 0 && s[i] != p[j]) {
            compara(i, j, "'" + string(1, s[i]) + "' != '" + string(1, p[j]) + "': j recua para pi[" + to_string(j - 1) + "] = " + to_string(pi[j - 1]));
            j = pi[j - 1];
        }
        compara(i, j, "compara texto[" + to_string(i) + "] = '" + string(1, s[i]) + "' com padrao[" + to_string(j) + "] = '" + string(1, p[j]) + "'");
        if (s[i] == p[j]) j++;
        if (j == m) {
            pos = i - m + 1;
            viz::vector_reset("texto");
            viz::vector_reset("padrao");
            for (int k = 0; k < m; k++) {
                viz::vector_mark("texto", pos + k, viz::VectorState::Found);
                viz::vector_mark("padrao", k, viz::VectorState::Found);
            }
            viz::step("padrão encontrado na posição " + to_string(pos));
            break;
        }
    }
    if (pos == -1) viz::step("fim do texto: padrão ausente");
    viz::print(pos == -1 ? "Padrao nao encontrado" : "Posicao: " + to_string(pos));
}
`,
    'KMP: monta a tabela de bordas (pi) e usa para nunca recuar no texto. Entrada: texto na primeira linha, padrão na segunda. Os vetores mostram códigos ASCII.',
    'O(n + m)',
    'O(m)',
    ['kmp', 'strings', 'padrão', 'prefix function'],
  ),
  define(
    'max-flow',
    'Fluxo máximo (Edmonds-Karp)',
    'Fluxo',
    `4 5 1 4
1 2 3
1 3 2
2 3 1
2 4 2
3 4 3
`,
    `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n, m, s, t;
    cin >> n >> m >> s >> t;
    vector<vector<int>> c(n + 1, vector<int>(n + 1));
    vector<vector<bool>> existe(n + 1, vector<bool>(n + 1));
    viz::set_directed(true);
    for (int i = 1; i <= n; i++) viz::add_node(i, to_string(i));
    for (int i = 0; i < m; i++) {
        int u, v, w;
        cin >> u >> v >> w;
        c[u][v] += w;
        existe[u][v] = true;
        viz::add_edge(u, v, w);
    }
    viz::step("o peso de cada aresta é a capacidade residual; origem " + to_string(s) + ", destino " + to_string(t));
    int fluxo = 0;
    while (true) {
        vector<int> p(n + 1, -1);
        queue<int> q;
        q.push(s);
        p[s] = s;
        while (!q.empty() && p[t] < 0) {
            int u = q.front();
            q.pop();
            for (int v = 1; v <= n; v++) {
                if (p[v] >= 0 || c[u][v] <= 0) continue;
                p[v] = u;
                q.push(v);
            }
        }
        if (p[t] < 0) break;
        int gargalo = INT_MAX;
        vector<int> caminho;
        for (int v = t; v != s; v = p[v]) {
            gargalo = min(gargalo, c[p[v]][v]);
            caminho.push_back(v);
        }
        caminho.push_back(s);
        reverse(caminho.begin(), caminho.end());
        viz::graph_path(caminho);
        viz::step("caminho aumentante encontrado pela BFS; gargalo = " + to_string(gargalo));
        for (int v = t; v != s; v = p[v]) {
            int u = p[v];
            c[u][v] -= gargalo;
            c[v][u] += gargalo;
            if (existe[u][v]) viz::set_weight(u, v, c[u][v]);
            if (existe[v][u]) viz::set_weight(v, u, c[v][u]);
        }
        fluxo += gargalo;
        viz::step("envia " + to_string(gargalo) + " unidades; fluxo total = " + to_string(fluxo));
        viz::graph_reset();
    }
    viz::step("não há mais caminho aumentante: fluxo máximo = " + to_string(fluxo));
    viz::print("Fluxo maximo: " + to_string(fluxo));
}
`,
    'Edmonds-Karp: BFS acha caminhos aumentantes, o gargalo é enviado e as capacidades residuais são atualizadas nas arestas. Entrada: n, m, origem, destino e arestas com capacidade.',
    'O(V³E)',
    'O(V²)',
    ['fluxo', 'edmonds-karp', 'max flow', 'grafos'],
  ),
  define(
    'two-sum',
    'Two Sum com tabela hash',
    'Problemas clássicos',
    `5 9
2 7 11 15 1
`,
    `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n, alvo;
    cin >> n >> alvo;
    vector<int> a(n), vistos;
    for (int& x : a) cin >> x;
    viz::vector_init("a", a);
    viz::show("vistos", vistos);
    viz::vector_step("a", "procura dois índices com soma " + to_string(alvo));
    unordered_map<int, int> pos;
    for (int i = 0; i < n; i++) {
        int falta = alvo - a[i];
        viz::vector_reset("a");
        viz::vector_probe("a", i, "a[" + to_string(i) + "] = " + to_string(a[i]) + "; precisa encontrar " + to_string(falta));
        viz::vector_step("a");
        if (pos.count(falta)) {
            viz::vector_mark("a", pos[falta], viz::VectorState::Found);
            viz::vector_mark("a", i, viz::VectorState::Found);
            viz::vector_step("a", "par encontrado: " + to_string(falta) + " + " + to_string(a[i]) + " = " + to_string(alvo));
            viz::print("Indices: " + to_string(pos[falta]) + " " + to_string(i));
            return 0;
        }
        pos[a[i]] = i;
        vistos.push_back(a[i]);
        viz::show("vistos", vistos);
        viz::vector_step("a", to_string(falta) + " ainda não apareceu: guarda " + to_string(a[i]) + " na tabela");
    }
    viz::print("Nenhum par encontrado");
}
`,
    'Em uma única passada, guarda os valores vistos e procura o complemento do atual. Entrada: n, alvo e vetor.',
    'O(n)',
    'O(n)',
    ['hash', 'two sum', 'vetores', 'complemento'],
  ),
];