export interface Example {
  id: string;
  name: string;
  code: string;
  stdin?: string;
}

export const examples: Example[] = [
  {
    id: 'inicial',
    name: 'Inicial',
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    viz::add_node(1, "Start");
    viz::add_node(2, "Explore");
    viz::add_edge(1, 2, 4);
    viz::highlight(1, "emerald");
    viz::highlight(2, "orange");
}`,
  },
  {
    id: 'kahn',
    name: 'Ordenação topológica (Kahn)',
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n = 8;
    vector<pair<int,int>> arestas = {
        {1,2}, {1,3}, {2,4}, {3,4}, {3,5},
        {4,6}, {5,6}, {6,7}, {8,5}
    };

    vector<vector<int>> adj(n + 1);
    vector<int> grau(n + 1, 0);

    for (int i = 1; i <= n; i++) viz::add_node(i, to_string(i));
    for (auto [u, v] : arestas) {
        viz::add_edge(u, v, 1);
        adj[u].push_back(v);
        grau[v]++;
    }

    queue<int> q;
    vector<int> ordem;

    auto mostrar = [&]() {
        vector<string> f, g;
        queue<int> c = q;
        while (!c.empty()) { f.push_back(to_string(c.front())); c.pop(); }
        for (int i = 1; i <= n; i++) g.push_back(to_string(i) + "=" + to_string(grau[i]));
        viz::show("fila", f);
        viz::show("grau", g);
        viz::show("ordem", ordem);
    };

    for (int i = 1; i <= n; i++) {
        if (grau[i] == 0) {
            q.push(i);
            viz::set_color(i, "yellow");
        }
    }
    mostrar();

    while (!q.empty()) {
        int u = q.front(); q.pop();
        ordem.push_back(u);
        viz::set_color(u, "orange");

        for (int v : adj[u]) {
            grau[v]--;
            viz::highlight_edge(u, v, "emerald");
            if (grau[v] == 0) {
                q.push(v);
                viz::set_color(v, "yellow");
            }
        }

        viz::set_color(u, "emerald");
        mostrar();
    }

    if ((int)ordem.size() == n) {
        viz::print("Ordem topologica valida");
    } else {
        viz::print("Ciclo detectado: " + to_string(n - (int)ordem.size()) + " nos ficaram de fora");
    }
}`,
  },
  {
    id: 'bfs',
    name: 'Busca em largura (BFS)',
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n = 7;
    vector<pair<int,int>> arestas = {{1,2},{1,3},{2,4},{2,5},{3,6},{3,7}};

    viz::set_directed(false);
    viz::set_weighted(false);

    vector<vector<int>> adj(n + 1);
    for (int i = 1; i <= n; i++) viz::add_node(i, to_string(i));
    for (auto [u, v] : arestas) {
        viz::add_edge(u, v);
        adj[u].push_back(v);
        adj[v].push_back(u);
    }

    vector<int> dist(n + 1, -1);
    queue<int> q;

    auto mostrar = [&]() {
        vector<string> f;
        queue<int> c = q;
        while (!c.empty()) { f.push_back(to_string(c.front())); c.pop(); }
        viz::show("fila", f);
        vector<vector<string>> t(2);
        for (int i = 1; i <= n; i++) {
            t[0].push_back(to_string(i));
            t[1].push_back(dist[i] < 0 ? "-" : to_string(dist[i]));
        }
        viz::show_matrix("dist", t);
    };

    dist[1] = 0;
    q.push(1);
    viz::set_color(1, "yellow");
    mostrar();

    while (!q.empty()) {
        int u = q.front(); q.pop();
        viz::set_color(u, "orange");
        for (int v : adj[u]) {
            if (dist[v] == -1) {
                dist[v] = dist[u] + 1;
                q.push(v);
                viz::highlight_edge(u, v, "emerald");
                viz::set_color(v, "yellow");
            }
        }
        viz::set_color(u, "emerald");
        mostrar();
    }
    viz::print("BFS concluida");
}`,
  },
  {
    id: 'dijkstra',
    name: 'Menor caminho (Dijkstra)',
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n = 6;
    vector<array<int,3>> es = {
        {1,2,7},{1,3,9},{1,6,14},{2,3,10},{2,4,15},
        {3,4,11},{3,6,2},{4,5,6},{6,5,9}
    };

    viz::set_directed(true);
    vector<vector<pair<int,int>>> adj(n + 1);
    for (int i = 1; i <= n; i++) viz::add_node(i, to_string(i));
    for (auto [u, v, w] : es) {
        viz::add_edge(u, v, w);
        adj[u].push_back({v, w});
    }

    const int INF = 1e9;
    vector<int> dist(n + 1, INF), pai(n + 1, 0);
    vector<bool> feito(n + 1, false);
    priority_queue<pair<int,int>, vector<pair<int,int>>, greater<>> pq;

    auto mostrar = [&]() {
        vector<vector<string>> t(2);
        for (int i = 1; i <= n; i++) {
            t[0].push_back(to_string(i));
            t[1].push_back(dist[i] == INF ? "∞" : to_string(dist[i]));
        }
        viz::show_matrix("dist", t);
    };

    dist[1] = 0;
    pq.push({0, 1});
    viz::set_color(1, "yellow");
    mostrar();

    while (!pq.empty()) {
        auto [d, u] = pq.top(); pq.pop();
        if (feito[u]) continue;
        feito[u] = true;
        viz::set_color(u, "orange");

        for (auto [v, w] : adj[u]) {
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                pai[v] = u;
                pq.push({dist[v], v});
                viz::highlight_edge(u, v, "yellow");
                if (!feito[v]) viz::set_color(v, "yellow");
            }
        }
        viz::set_color(u, "emerald");
        mostrar();
    }

    viz::reset_colors();
    vector<int> caminho;
    for (int x = 5; x; x = pai[x]) caminho.push_back(x);
    reverse(caminho.begin(), caminho.end());
    viz::highlight_path(caminho, "red");
    viz::print("Distancia 1 -> 5: " + to_string(dist[5]));
}`,
  },
  {
    id: 'dfs',
    name: 'Busca em profundidade (DFS)',
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int n = 8;
vector<vector<int>> adj;
vector<int> estado, saida;

void dfs(int u) {
    estado[u] = 1;
    viz::set_color(u, "orange");
    for (int v : adj[u]) {
        if (estado[v] == 0) {
            viz::highlight_edge(u, v, "emerald");
            dfs(v);
        }
    }
    estado[u] = 2;
    saida.push_back(u);
    viz::set_color(u, "emerald");
    viz::show("saida", saida);
}

int main() {
    viz::set_directed(false);
    viz::set_weighted(false);

    vector<pair<int,int>> arestas = {{1,2},{1,3},{2,4},{2,5},{3,6},{5,7},{6,8}};
    adj.assign(n + 1, {});
    estado.assign(n + 1, 0);

    for (int i = 1; i <= n; i++) viz::add_node(i, to_string(i));
    for (auto [u, v] : arestas) {
        viz::add_edge(u, v);
        adj[u].push_back(v);
        adj[v].push_back(u);
    }

    dfs(1);
    viz::print("DFS concluida");
}`,
  },
  {
    id: 'prim',
    name: 'Árvore geradora mínima (Prim)',
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n = 6;
    vector<array<int,3>> es = {
        {1,2,4},{1,3,3},{2,3,1},{2,4,2},{3,4,4},{4,5,2},{4,6,3},{5,6,6}
    };

    viz::set_directed(false);
    vector<vector<pair<int,int>>> adj(n + 1);
    for (int i = 1; i <= n; i++) viz::add_node(i, to_string(i));
    for (auto [u, v, w] : es) {
        viz::add_edge(u, v, w);
        adj[u].push_back({v, w});
        adj[v].push_back({u, w});
    }

    vector<bool> dentro(n + 1, false);
    priority_queue<array<int,3>, vector<array<int,3>>, greater<>> pq;
    pq.push({0, 1, 0});
    int total = 0;

    while (!pq.empty()) {
        auto [w, u, pai] = pq.top(); pq.pop();
        if (dentro[u]) continue;
        dentro[u] = true;
        total += w;
        viz::set_color(u, "emerald");
        if (pai) viz::highlight_edge(pai, u, "emerald");
        for (auto [v, c] : adj[u]) {
            if (!dentro[v]) pq.push({c, v, u});
        }
        viz::show("custo", vector<int>{total});
    }

    viz::print("Custo da AGM: " + to_string(total));
}`,
  },
  {
    id: 'kruskal',
    name: 'Árvore geradora mínima (Kruskal)',
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

struct DSU {
    vector<int> p;
    DSU(int n) : p(n + 1) { iota(p.begin(), p.end(), 0); }
    int find(int x) { return p[x] == x ? x : p[x] = find(p[x]); }
    bool unite(int a, int b) {
        a = find(a);
        b = find(b);
        if (a == b) return false;
        p[a] = b;
        return true;
    }
};

int main() {
    int n = 6;
    vector<array<int,3>> es = {
        {1,2,4},{1,3,3},{2,3,1},{2,4,2},{3,4,4},{4,5,2},{4,6,3},{5,6,6}
    };

    viz::set_directed(false);
    for (int i = 1; i <= n; i++) viz::add_node(i, to_string(i));
    for (auto [u, v, w] : es) viz::add_edge(u, v, w);

    sort(es.begin(), es.end(), [](const array<int,3>& a, const array<int,3>& b) {
        return a[2] < b[2];
    });

    DSU dsu(n);
    int total = 0;

    for (auto [u, v, w] : es) {
        viz::highlight_edge(u, v, "yellow");
        if (dsu.unite(u, v)) {
            total += w;
            viz::highlight_edge(u, v, "emerald");
            viz::set_color(u, "emerald");
            viz::set_color(v, "emerald");
        } else {
            viz::highlight_edge(u, v, "red");
        }
        vector<string> raiz;
        for (int i = 1; i <= n; i++) raiz.push_back(to_string(i) + "->" + to_string(dsu.find(i)));
        viz::show("raiz", raiz);
        viz::show("custo", vector<int>{total});
    }

    viz::print("Custo da AGM: " + to_string(total));
}`,
  },
  {
    id: 'componentes',
    name: 'Componentes conexas',
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n = 9;
    vector<pair<int,int>> arestas = {{1,2},{2,3},{4,5},{5,6},{6,4},{7,8}};

    viz::set_directed(false);
    viz::set_weighted(false);

    vector<vector<int>> adj(n + 1);
    for (int i = 1; i <= n; i++) viz::add_node(i, to_string(i));
    for (auto [u, v] : arestas) {
        viz::add_edge(u, v);
        adj[u].push_back(v);
        adj[v].push_back(u);
    }

    vector<string> cores = {"emerald", "orange", "sky", "purple", "pink", "yellow"};
    vector<int> comp(n + 1, -1);
    int total = 0;

    for (int s = 1; s <= n; s++) {
        if (comp[s] != -1) continue;
        string cor = cores[total % cores.size()];
        stack<int> st;
        st.push(s);
        comp[s] = total;
        vector<int> membros;

        while (!st.empty()) {
            int u = st.top(); st.pop();
            membros.push_back(u);
            viz::set_color(u, cor);
            for (int v : adj[u]) {
                if (comp[v] == -1) {
                    comp[v] = total;
                    viz::highlight_edge(u, v, cor);
                    st.push(v);
                }
            }
        }

        viz::show("componente " + to_string(total + 1), membros);
        total++;
    }

    viz::print("Componentes: " + to_string(total));
}`,
  },
  {
    id: 'ciclo',
    name: 'Detecção de ciclo (dirigido)',
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int n = 6;
vector<vector<int>> adj;
vector<int> estado, pilha;

bool dfs(int u) {
    estado[u] = 1;
    pilha.push_back(u);
    viz::set_color(u, "orange");
    viz::show("pilha", pilha);

    for (int v : adj[u]) {
        viz::highlight_edge(u, v, "yellow");
        if (estado[v] == 1) {
            viz::highlight_edge(u, v, "red");
            viz::set_color(v, "red");
            viz::print("Ciclo encontrado ao chegar em " + to_string(v));
            return true;
        }
        if (estado[v] == 0 && dfs(v)) return true;
    }

    estado[u] = 2;
    pilha.pop_back();
    viz::set_color(u, "emerald");
    viz::show("pilha", pilha);
    return false;
}

int main() {
    vector<pair<int,int>> arestas = {{1,2},{2,3},{3,4},{4,2},{1,5},{5,6}};

    adj.assign(n + 1, {});
    estado.assign(n + 1, 0);

    for (int i = 1; i <= n; i++) viz::add_node(i, to_string(i));
    for (auto [u, v] : arestas) {
        viz::add_edge(u, v);
        adj[u].push_back(v);
    }

    bool achou = false;
    for (int i = 1; i <= n && !achou; i++) {
        if (estado[i] == 0) achou = dfs(i);
    }

    if (!achou) viz::print("Grafo aciclico");
}`,
  },
  {
    id: 'floyd',
    name: 'Todos os pares (Floyd-Warshall)',
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n = 4;
    const int INF = 1000000000;
    vector<array<int,3>> es = {{1,2,5},{1,4,10},{2,3,3},{3,4,1}};

    viz::set_directed(true);
    vector<vector<int>> d(n + 1, vector<int>(n + 1, INF));
    for (int i = 1; i <= n; i++) {
        viz::add_node(i, to_string(i));
        d[i][i] = 0;
    }
    for (auto [u, v, w] : es) {
        viz::add_edge(u, v, w);
        d[u][v] = w;
    }

    auto mostrar = [&](int k) {
        vector<vector<string>> t(n + 1, vector<string>(n + 1));
        t[0][0] = "k=" + to_string(k);
        for (int i = 1; i <= n; i++) {
            t[0][i] = to_string(i);
            t[i][0] = to_string(i);
            for (int j = 1; j <= n; j++) {
                t[i][j] = d[i][j] >= INF ? "∞" : to_string(d[i][j]);
            }
        }
        viz::show_matrix("dist", t);
    };

    mostrar(0);

    for (int k = 1; k <= n; k++) {
        viz::set_color(k, "orange");
        for (int i = 1; i <= n; i++) {
            for (int j = 1; j <= n; j++) {
                if (d[i][k] < INF && d[k][j] < INF && d[i][k] + d[k][j] < d[i][j]) {
                    d[i][j] = d[i][k] + d[k][j];
                }
            }
        }
        mostrar(k);
        viz::set_color(k, "emerald");
    }

    viz::print("Distancia 1 -> 4: " + to_string(d[1][4]));
}`,
  },
  {
    id: 'fluxo',
    name: 'Fluxo máximo (Edmonds-Karp)',
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n = 6, s = 1, t = 6;
    vector<array<int,3>> es = {
        {1,2,10},{1,3,10},{2,3,2},{2,4,4},{2,5,8},
        {3,5,9},{4,6,10},{5,4,6},{5,6,10}
    };

    viz::set_directed(true);
    vector<vector<int>> cap(n + 1, vector<int>(n + 1, 0));
    vector<vector<bool>> original(n + 1, vector<bool>(n + 1, false));
    vector<vector<int>> adj(n + 1);

    for (int i = 1; i <= n; i++) viz::add_node(i, to_string(i));
    for (auto [u, v, c] : es) {
        viz::add_edge(u, v, c);
        cap[u][v] += c;
        original[u][v] = true;
        adj[u].push_back(v);
        adj[v].push_back(u);
    }

    int fluxo = 0;

    while (true) {
        vector<int> pai(n + 1, 0);
        queue<int> q;
        q.push(s);
        pai[s] = s;

        while (!q.empty() && !pai[t]) {
            int u = q.front(); q.pop();
            for (int v : adj[u]) {
                if (!pai[v] && cap[u][v] > 0) {
                    pai[v] = u;
                    q.push(v);
                }
            }
        }

        if (!pai[t]) break;

        int gargalo = INT_MAX;
        vector<int> caminho;
        for (int x = t; x != s; x = pai[x]) {
            gargalo = min(gargalo, cap[pai[x]][x]);
            caminho.push_back(x);
        }
        caminho.push_back(s);
        reverse(caminho.begin(), caminho.end());

        viz::reset_colors();
        viz::highlight_path(caminho, "yellow");

        for (int x = t; x != s; x = pai[x]) {
            int u = pai[x];
            cap[u][x] -= gargalo;
            cap[x][u] += gargalo;
            if (original[u][x]) viz::set_weight(u, x, cap[u][x]);
            if (original[x][u]) viz::set_weight(x, u, cap[x][u]);
        }

        fluxo += gargalo;
        viz::show("fluxo", vector<int>{fluxo});
        viz::print("Caminho aumentante com gargalo " + to_string(gargalo));
    }

    viz::reset_colors();
    viz::print("Fluxo maximo: " + to_string(fluxo));
}`,
  },
  {
    id: 'bfs-stdin',
    name: 'BFS com entrada (stdin + frames)',
    stdin: `6 7
1 2
1 3
2 4
3 4
4 5
5 6
3 6
`,
    code: `#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    int n, m;
    cin >> n >> m;

    viz::set_directed(false);
    viz::set_weighted(false);

    vector<vector<int>> adj(n + 1);
    for (int i = 1; i <= n; i++) viz::add_node(i, to_string(i));
    for (int i = 0; i < m; i++) {
        int u, v;
        cin >> u >> v;
        viz::add_edge(u, v);
        adj[u].push_back(v);
        adj[v].push_back(u);
    }
    viz::step("Grafo lido: " + to_string(n) + " nos, " + to_string(m) + " arestas");

    vector<int> dist(n + 1, -1);
    queue<int> q;
    dist[1] = 0;
    q.push(1);
    viz::set_color(1, "yellow");
    viz::set_badge(1, "d=0");
    viz::step("Origem: 1");

    while (!q.empty()) {
        int u = q.front(); q.pop();
        viz::set_color(u, "orange");
        for (int v : adj[u]) {
            if (dist[v] == -1) {
                dist[v] = dist[u] + 1;
                q.push(v);
                viz::highlight_edge(u, v, "emerald");
                viz::set_color(v, "yellow");
                viz::set_badge(v, "d=" + to_string(dist[v]));
            }
        }
        viz::set_color(u, "emerald");
        viz::step("Processou " + to_string(u));
    }
    viz::print("BFS concluida");
}`,
  },
];