export interface Example {
  id: string;
  name: string;
  code: string;
  stdin?: string;
}

const baseExamples: Example[] = [
  {
    id: 'binary-search',
    name: 'Busca binária',
    stdin: `8
1 3 5 7 9 11 13 15
11
`,
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n, alvo;
    cin >> n;
    vector<int> a(n);
    for (int& x : a) cin >> x;
    cin >> alvo;
    for (int i = 0; i < n; i++) viz::add_node(i + 1, to_string(a[i]));
    int l = 0, r = n - 1, resposta = -1;
    while (l <= r) {
        int m = l + (r - l) / 2;
        viz::set_color(m + 1, "yellow");
        viz::show("intervalo", vector<int>{l, r, m});
        if (a[m] == alvo) { resposta = m; viz::set_color(m + 1, "emerald"); break; }
        if (a[m] < alvo) l = m + 1;
        else r = m - 1;
    }
    viz::print(resposta == -1 ? "Elemento nao encontrado" : "Indice: " + to_string(resposta));
}`,
  },
  {
    id: 'prefix-sum',
    name: 'Soma prefixada e consultas',
    stdin: `6
2 4 1 7 3 5
3
1 3
2 5
4 6
`,
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n, q;
    cin >> n;
    vector<long long> pref(n + 1);
    for (int i = 1; i <= n; i++) { cin >> pref[i]; pref[i] += pref[i - 1]; }
    for (int i = 1; i <= n; i++) viz::add_node(i, to_string(pref[i] - pref[i - 1]));
    cin >> q;
    while (q--) {
        int l, r; cin >> l >> r;
        long long resposta = pref[r] - pref[l - 1];
        for (int i = l; i <= r; i++) viz::set_color(i, "emerald");
        viz::show("consulta", vector<int>{l, r});
        viz::print("Soma [" + to_string(l) + "," + to_string(r) + "]: " + to_string(resposta));
    }
}`,
  },
  {
    id: 'two-pointers',
    name: 'Dois ponteiros',
    stdin: `7 10
1 2 3 4 6 8 9
`,
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n, alvo; cin >> n >> alvo;
    vector<int> a(n);
    for (int& x : a) cin >> x;
    for (int i = 0; i < n; i++) viz::add_node(i + 1, to_string(a[i]));
    int l = 0, r = n - 1;
    while (l < r) {
        viz::set_color(l + 1, "yellow"); viz::set_color(r + 1, "orange");
        viz::show("ponteiros", vector<int>{l, r});
        if (a[l] + a[r] == alvo) {
            viz::highlight_edge(l + 1, r + 1, "emerald");
            viz::print("Par encontrado: " + to_string(a[l]) + " + " + to_string(a[r]));
            return 0;
        }
        if (a[l] + a[r] < alvo) l++; else r--;
    }
    viz::print("Nenhum par encontrado");
}`,
  },
  {
    id: 'dsu',
    name: 'DSU e componentes dinâmicas',
    stdin: `5 4
1 2
2 3
4 5
1 5
`,
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

struct DSU {
    vector<int> p, sz;
    DSU(int n): p(n + 1), sz(n + 1, 1) { iota(p.begin(), p.end(), 0); }
    int find(int x) { return p[x] == x ? x : p[x] = find(p[x]); }
    bool unite(int a, int b) {
        a = find(a); b = find(b);
        if (a == b) return false;
        if (sz[a] < sz[b]) swap(a, b);
        p[b] = a; sz[a] += sz[b]; return true;
    }
};

int main() {
    int n, m; cin >> n >> m;
    DSU dsu(n);
    for (int i = 1; i <= n; i++) viz::add_node(i, to_string(i));
    for (int i = 0; i < m; i++) {
        int u, v; cin >> u >> v;
        viz::add_edge(u, v);
        bool novo = dsu.unite(u, v);
        viz::highlight_edge(u, v, novo ? "emerald" : "red");
        for (int x = 1; x <= n; x++) viz::set_badge(x, "c=" + to_string(dsu.find(x)));
        viz::step(novo ? "componentes unidas" : "ciclo detectado");
    }
    set<int> raizes;
    for (int i = 1; i <= n; i++) raizes.insert(dsu.find(i));
    viz::print("Componentes: " + to_string(raizes.size()));
}`,
  },
  {
    id: 'bfs-shortest-path',
    name: 'BFS: menor caminho não ponderado',
    stdin: `7 7
1 2
1 3
2 4
3 4
4 5
5 6
6 7
1 7
`,
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n, m, s, t;
    cin >> n >> m;
    vector<vector<int>> adj(n + 1);
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
    q.push(s);
    d[s] = 0;
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        viz::set_color(u, "orange");
        for (int v : adj[u]) {
            if (d[v] != -1) continue;
            d[v] = d[u] + 1;
            pai[v] = u;
            q.push(v);
            viz::highlight_edge(u, v, "emerald");
            viz::set_badge(v, "d=" + to_string(d[v]));
        }
        viz::set_color(u, "emerald");
    }
    vector<int> caminho;
    for (int v = t; v; v = pai[v]) caminho.push_back(v);
    reverse(caminho.begin(), caminho.end());
    if (d[t] != -1) viz::highlight_path(caminho, "red");
    viz::print(d[t] == -1 ? "Sem caminho" : "Distancia: " + to_string(d[t]));
}`,
  },
  {
    id: 'dijkstra',
    name: 'Dijkstra',
    stdin: `5 7
1 2 4
1 3 2
2 3 1
2 4 5
3 4 8
3 5 10
4 5 2
1 5
`,
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n, m, s, t;
    cin >> n >> m;
    vector<vector<pair<int,int>>> adj(n + 1);
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
    priority_queue<pair<int,int>, vector<pair<int,int>>, greater<>> pq;
    d[s] = 0;
    pq.push({0, s});
    while (!pq.empty()) {
        auto [du, u] = pq.top();
        pq.pop();
        if (du != d[u]) continue;
        viz::set_color(u, "orange");
        for (auto [v, w] : adj[u]) {
            if (d[v] <= d[u] + w) continue;
            d[v] = d[u] + w;
            pai[v] = u;
            pq.push({d[v], v});
            viz::highlight_edge(u, v, "yellow");
            viz::set_badge(v, to_string(d[v]));
        }
        viz::set_color(u, "emerald");
    }
    vector<int> path;
    for (int v = t; v; v = pai[v]) path.push_back(v);
    reverse(path.begin(), path.end());
    if (d[t] < INF) viz::highlight_path(path, "red");
    viz::print(d[t] == INF ? "Sem caminho" : "Distancia minima: " + to_string(d[t]));
}`,
  },
  {
    id: 'kruskal',
    name: 'Kruskal: árvore geradora mínima',
    stdin: `5 7
1 2 4
1 3 2
2 3 1
2 4 5
3 4 8
3 5 10
4 5 2
`,
    code: `#include <bits/stdc++.h>
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
    int total = 0;
    for (auto [u, v, w] : e) {
        viz::highlight_edge(u, v, "yellow");
        if (dsu.join(u, v)) {
            total += w;
            viz::highlight_edge(u, v, "emerald");
        } else {
            viz::highlight_edge(u, v, "red");
        }
        viz::show("custo", vector<int>{total});
    }
    viz::print("Custo da AGM: " + to_string(total));
}`,
  },
  {
    id: 'topological-sort',
    name: 'Kahn: ordenação topológica',
    stdin: `6 6
1 2
1 3
2 4
3 4
4 5
4 6
`,
    code: `#include <bits/stdc++.h>
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
    for (int i = 1; i <= n; i++) if (!in[i]) q.push(i);
    vector<int> order;
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        order.push_back(u);
        viz::set_color(u, "emerald");
        for (int v : adj[u]) {
            viz::highlight_edge(u, v, "yellow");
            if (!--in[v]) q.push(v);
        }
        viz::show("ordem", order);
    }
    viz::print(order.size() == n ? "DAG: ordem valida" : "Ciclo detectado");
}`,
  },
  {
    id: 'scc-kosaraju',
    name: 'Kosaraju: componentes fortemente conexas',
    stdin: `6 7
1 2
2 3
3 1
3 4
4 5
5 4
5 6
`,
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;
int main() {
    int n, m;
    cin >> n >> m;
    vector<vector<int>> g(n + 1), rg(n + 1);
    for (int i = 1; i <= n; i++) viz::add_node(i, to_string(i));
    for (int i = 0; i < m; i++) {
        int u, v;
        cin >> u >> v;
        viz::add_edge(u, v);
        g[u].push_back(v);
        rg[v].push_back(u);
    }

    vector<int> vis(n + 1), ordem, comp(n + 1, -1);
    function<void(int)> dfs1 = [&](int u) {
        vis[u] = 1;
        for (int v : g[u]) if (!vis[v]) dfs1(v);
        ordem.push_back(u);
    };
    function<void(int, int)> dfs2 = [&](int u, int c) {
        comp[u] = c;
        viz::set_color(u, c % 2 ? "orange" : "emerald");
        for (int v : rg[u]) if (comp[v] < 0) dfs2(v, c);
    };
    for (int i = 1; i <= n; i++) if (!vis[i]) dfs1(i);
    reverse(ordem.begin(), ordem.end());
    int total = 0;
    for (int u : ordem) if (comp[u] < 0) dfs2(u, total++);
    viz::print("SCCs: " + to_string(total));
}`,
  },
  {
    id: 'segment-tree',
    name: 'Árvore de segmentos: soma',
    stdin: `6
2 4 1 7 3 5
3
1 3
2 6
4 5
`,
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;
vector<long long> a,seg;
void build(int p,int l,int r){if(l==r){seg[p]=a[l];return;}int m=(l+r)/2;build(p*2,l,m);build(p*2+1,m+1,r);seg[p]=seg[p*2]+seg[p*2+1];}
long long query(int p,int l,int r,int ql,int qr){if(qr<l||r<ql)return 0;if(ql<=l&&r<=qr)return seg[p];int m=(l+r)/2;return query(p*2,l,m,ql,qr)+query(p*2+1,m+1,r,ql,qr);}
int main() {
    int n, q;
    cin >> n;
    a.assign(n + 1, 0);
    for (int i = 1; i <= n; i++) {
        cin >> a[i];
        viz::add_node(i, to_string(a[i]));
    }
    seg.assign(4 * n + 4, 0);
    build(1, 1, n);
    cin >> q;
    while (q--) {
        int l, r;
        cin >> l >> r;
        for (int i = l; i <= r; i++) viz::set_color(i, "emerald");
        viz::print("Soma: " + to_string(query(1, 1, n, l, r)));
    }
}
`,
  },
  {
    id: 'knapsack',
    name: 'Programação dinâmica: mochila 0/1',
    stdin: `4 7
1 1
3 4
4 5
5 7
`,
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;
int main() {
    int n, W;
    cin >> n >> W;
    vector<int> w(n), v(n);
    for (int i = 0; i < n; i++) {
        cin >> w[i] >> v[i];
        viz::add_node(i + 1, "item " + to_string(i + 1));
    }
    vector<int> dp(W + 1);
    for (int i = 0; i < n; i++) {
        for (int cap = W; cap >= w[i]; cap--) {
            dp[cap] = max(dp[cap], dp[cap - w[i]] + v[i]);
        }
        viz::set_color(i + 1, "emerald");
        viz::show("dp", dp);
    }
    viz::print("Valor maximo: " + to_string(dp[W]));
}
`,
  },
  {
    id: 'sieve',
    name: 'Crivo de Eratóstenes',
    stdin: `30
`,
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;
int main() {
    int n;
    cin >> n;
    for (int i = 2; i <= n; i++) viz::add_node(i, to_string(i));
    vector<bool> prime(n + 1, true);
    prime[0] = prime[1] = false;
    for (int p = 2; p * p <= n; p++) {
        if (!prime[p]) continue;
        viz::set_color(p, "emerald");
        for (int x = p * p; x <= n; x += p) {
            prime[x] = false;
            viz::set_color(x, "red");
        }
    }
    vector<int> ans;
    for (int i = 2; i <= n; i++) if (prime[i]) ans.push_back(i);
    viz::show("primos", ans);
    viz::print("Quantidade de primos: " + to_string(ans.size()));
}
`,
  },
];

const techniqueComments: Record<string, string> = {
  'binary-search': 'Busca binaria em vetor ordenado. Entrada: n, vetor, alvo.',
  'prefix-sum': 'Soma prefixada para consultas em intervalos. Entrada: n, vetor, consultas.',
  'two-pointers': 'Dois ponteiros em vetor ordenado. Entrada: n, alvo e vetor.',
  dsu: 'DSU/Union-Find para componentes dinamicas. Entrada: n, m e arestas.',
  'bfs-shortest-path': 'BFS para menor caminho nao ponderado. Entrada: n, m, arestas, origem e destino.',
  dijkstra: 'Dijkstra para pesos nao negativos. Entrada: n, m, arestas, origem e destino.',
  kruskal: 'Kruskal para arvore geradora minima. Entrada: n, m e arestas ponderadas.',
  'topological-sort': 'Kahn para ordenacao topologica. Entrada: n, m e arestas dirigidas.',
  'scc-kosaraju': 'Kosaraju para componentes fortemente conexas. Entrada: n, m e arestas dirigidas.',
  'segment-tree': 'Arvore de segmentos para consultas de soma. Entrada: n, vetor e consultas.',
  knapsack: 'Programacao dinamica para mochila 0/1. Entrada: n, capacidade e itens.',
  sieve: 'Crivo de Eratostenes. Entrada: limite superior n.',
};

const visualizerMethods = `\
// Metodos de visualizacao disponiveis:
// viz::set_directed(bool), viz::set_weighted(bool), viz::set_multigraph(bool)
// viz::add_node(id, label), viz::add_edge(u, v, peso)
// viz::remove_node(id), viz::remove_edge(u, v), viz::set_weight(u, v, peso)
// viz::highlight(id, cor), viz::highlight_edge(u, v, cor), viz::highlight_path(caminho, cor)
// viz::set_color(id, cor), viz::reset_colors(), viz::set_label(id, texto)
// viz::set_badge(id, texto), viz::set_edge_style(u, v, estilo), viz::set_edge_label(u, v, texto)
// viz::step(mensagem), viz::show(nome, valores), viz::show_matrix(nome, matriz), viz::print(mensagem)
`;

export const examples: Example[] = baseExamples.map((example) => ({
  ...example,
  code: `${visualizerMethods}// Tecnica: ${techniqueComments[example.id] ?? 'Resolva o problema usando stdin.'}
// Edite este template e execute com a entrada exibida acima.

${example.code}`,
}));
