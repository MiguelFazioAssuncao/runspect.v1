import { buildCppProgram } from './cppTemplate';

export interface Example {
  id: string;
  name: string;
  code: string;
  stdin: string;
  expectedOutput: string;
  description: string;
  category: string;
  tags: string[];
  timeComplexity: string;
  memoryComplexity: string;
}

const define = (
  id: string, name: string, category: string, stdin: string, body: string,
  description: string, timeComplexity: string, memoryComplexity: string,
  tags: string[], expectedOutput: string, helpers = '',
): Example => ({ id, name, category, stdin, code: buildCppProgram(body, helpers), description, timeComplexity, memoryComplexity, tags, expectedOutput });

export const examples: Example[] = [
  define('bubble-sort', 'Bubble Sort', 'Ordenação', `7
6 3 8 2 9 1 5
`, `    int n;
    cin >> n;
    vector<ll> a(n);
    for (ll& x : a) cin >> x;

    for (int i = 0; i + 1 < n; i++) {
        bool trocou = false;
        for (int j = 0; j + 1 < n - i; j++) {
            if (a[j] > a[j + 1]) {
                swap(a[j], a[j + 1]);
                trocou = true;
            }
        }
        if (!trocou) break;
    }

    for (int i = 0; i < n; i++) {
        if (i) cout << ' ';
        cout << a[i];
    }
    cout << endl;`,
  'Ordena por trocas de pares adjacentes, com parada antecipada. Entrada: n e n valores. Saída: vetor em ordem crescente.', 'O(n²)', 'O(1) auxiliar', ['bubble sort', 'ordenação', 'vetores', 'trocas'], '1 2 3 5 6 8 9\n'),

  define('binary-search', 'Busca binária', 'Busca', `8
1 3 5 7 9 11 13 15
11
`, `    int n;
    cin >> n;
    vector<ll> a(n);
    for (ll& x : a) cin >> x;
    ll alvo;
    cin >> alvo;

    int l = 0, r = n - 1, resposta = -1;
    while (l <= r) {
        int m = l + (r - l) / 2;
        if (a[m] == alvo) {
            resposta = m;
            break;
        }
        if (a[m] < alvo) l = m + 1;
        else r = m - 1;
    }
    cout << resposta << endl;`,
  'Busca em vetor previamente ordenado. Entrada: n, n valores e alvo. Saída: um índice a partir de 0, ou -1 se o alvo não existir.', 'O(log n) na busca', 'O(1) auxiliar', ['busca', 'binária', 'vetores', 'intervalo'], '5\n'),

  define('two-pointers', 'Dois ponteiros', 'Vetores', `7 10
1 2 3 4 6 8 9
`, `    int n;
    ll alvo;
    cin >> n >> alvo;
    vector<ll> a(n);
    for (ll& x : a) cin >> x;

    int l = 0, r = n - 1;
    while (l < r) {
        ll soma = a[l] + a[r];
        if (soma == alvo) {
            cout << l << ' ' << r << endl;
            return;
        }
        if (soma < alvo) l++;
        else r--;
    }
    cout << -1 << endl;`,
  'Encontra dois elementos distintos com soma alvo em um vetor ordenado. Entrada: n, alvo e n valores. Saída: dois índices a partir de 0, ou -1.', 'O(n)', 'O(1) auxiliar', ['ponteiros', 'vetores', 'soma'], '0 6\n'),

  define('segment-tree', 'Árvore de segmentos: soma', 'Estruturas', `6
2 4 1 7 3 5
3
1 3
2 6
4 5
`, `    int n;
    cin >> n;
    a.resize(n);
    for (ll& x : a) cin >> x;
    seg.assign(4 * n + 4, 0);
    if (n > 0) build(1, 0, n - 1);

    int q;
    cin >> q;
    while (q--) {
        int l, r;
        cin >> l >> r;
        cout << query(1, 0, n - 1, l - 1, r - 1) << endl;
    }`,
  'Constrói uma árvore de segmentos e responde somas de intervalos. Entrada: n, vetor, q e q pares l r (inclusivos, a partir de 1). Saída: uma soma por consulta.', 'O(n + q log n)', 'O(n)', ['segment tree', 'consulta', 'árvore', 'intervalo'], '7\n20\n10\n',
  `vector<ll> a, seg;

void build(int p, int l, int r) {
    if (l == r) {
        seg[p] = a[l];
        return;
    }
    int m = l + (r - l) / 2;
    build(2 * p, l, m);
    build(2 * p + 1, m + 1, r);
    seg[p] = seg[2 * p] + seg[2 * p + 1];
}

ll query(int p, int l, int r, int ql, int qr) {
    if (l > r || qr < l || r < ql) return 0;
    if (ql <= l && r <= qr) return seg[p];
    int m = l + (r - l) / 2;
    return query(2 * p, l, m, ql, qr)
         + query(2 * p + 1, m + 1, r, ql, qr);
}`),

  define('bfs-shortest-path', 'BFS: menor caminho não ponderado', 'Grafos', `7 7
1 2
1 3
2 4
3 4
4 5
5 6
6 7
1 7
`, `    int n, m;
    cin >> n >> m;
    vector<vector<int>> adj(n + 1);
    for (int i = 0; i < m; i++) {
        int u, v;
        cin >> u >> v;
        adj[u].push_back(v);
        adj[v].push_back(u);
    }
    int s, t;
    cin >> s >> t;

    vector<int> dist(n + 1, -1), pai(n + 1, -1);
    queue<int> q;
    dist[s] = 0;
    q.push(s);
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        for (int v : adj[u]) {
            if (dist[v] != -1) continue;
            dist[v] = dist[u] + 1;
            pai[v] = u;
            q.push(v);
        }
    }
    cout << dist[t] << endl;
    if (dist[t] == -1) return;

    vector<int> caminho;
    for (int v = t; v != -1; v = pai[v]) caminho.push_back(v);
    reverse(caminho.begin(), caminho.end());
    for (int i = 0; i < (int)caminho.size(); i++) {
        if (i) cout << ' ';
        cout << caminho[i];
    }
    cout << endl;`,
  'BFS em grafo não direcionado com vértices de 1 a n. Entrada: n, m, m arestas, origem e destino. Saída: distância e caminho; apenas -1 se não houver caminho.', 'O(V + E)', 'O(V + E)', ['bfs', 'fila', 'menor caminho', 'grafos'], '5\n1 2 4 5 6 7\n'),

  define('dfs', 'DFS: busca em profundidade', 'Grafos', `7 8
1 2
1 3
2 4
2 5
3 6
5 7
6 7
4 5
1
`, `    int n, m;
    cin >> n >> m;
    vector<vector<int>> adj(n + 1);
    for (int i = 0; i < m; i++) {
        int u, v;
        cin >> u >> v;
        adj[u].push_back(v);
        adj[v].push_back(u);
    }
    int s;
    cin >> s;
    vector<int> vis(n + 1), ordem;

    function<void(int)> dfs = [&](int u) {
        vis[u] = 1;
        ordem.push_back(u);
        for (int v : adj[u]) {
            if (!vis[v]) dfs(v);
        }
    };
    dfs(s);

    for (int i = 0; i < (int)ordem.size(); i++) {
        if (i) cout << ' ';
        cout << ordem[i];
    }
    cout << endl;`,
  'DFS recursiva em grafo não direcionado. Entrada: n, m, m arestas e origem (vértices de 1 a n). Saída: ordem de visita dos vértices alcançáveis. Grafos muito profundos exigem versão iterativa.', 'O(V + E)', 'O(V + E)', ['dfs', 'pilha', 'recursão', 'grafos'], '1 2 4 5 7 6 3\n'),

  define('dijkstra', 'Dijkstra', 'Grafos', `5 7
1 2 4
1 3 2
2 3 1
2 4 5
3 4 8
3 5 10
4 5 2
1 5
`, `    int n, m;
    cin >> n >> m;
    vector<vector<pair<int, ll>>> adj(n + 1);
    for (int i = 0; i < m; i++) {
        int u, v;
        ll w;
        cin >> u >> v >> w;
        adj[u].push_back({v, w});
        adj[v].push_back({u, w});
    }
    int s, t;
    cin >> s >> t;

    const ll INF = numeric_limits<ll>::max();
    vector<ll> dist(n + 1, INF);
    vector<int> pai(n + 1, -1);
    priority_queue<pair<ll, int>, vector<pair<ll, int>>, greater<pair<ll, int>>> pq;
    dist[s] = 0;
    pq.push({0, s});
    while (!pq.empty()) {
        auto [du, u] = pq.top();
        pq.pop();
        if (du != dist[u]) continue;
        for (auto [v, w] : adj[u]) {
            if (w > INF - du || du + w >= dist[v]) continue;
            dist[v] = du + w;
            pai[v] = u;
            pq.push({dist[v], v});
        }
    }
    if (dist[t] == INF) {
        cout << -1 << endl;
        return;
    }
    cout << dist[t] << endl;
    vector<int> caminho;
    for (int v = t; v != -1; v = pai[v]) caminho.push_back(v);
    reverse(caminho.begin(), caminho.end());
    for (int i = 0; i < (int)caminho.size(); i++) {
        if (i) cout << ' ';
        cout << caminho[i];
    }
    cout << endl;`,
  'Menor caminho em grafo não direcionado com pesos não negativos e distâncias menores que LLONG_MAX. Entrada: n, m, arestas u v peso, origem e destino. Saída: distância e caminho, ou -1.', 'O((V + E) log V)', 'O(V + E)', ['dijkstra', 'relaxamento', 'menor caminho', 'grafos'], '10\n1 3 2 4 5\n'),

  define('kruskal', 'Kruskal: árvore geradora mínima', 'Grafos', `5 7
1 2 4
1 3 2
2 3 1
2 4 5
3 4 8
3 5 10
4 5 2
`, `    int n, m;
    cin >> n >> m;
    vector<pair<int, int>> arestas(m);
    vector<ll> peso(m);
    for (int i = 0; i < m; i++) {
        cin >> arestas[i].first >> arestas[i].second >> peso[i];
    }
    vector<int> ordem(m);
    iota(ordem.begin(), ordem.end(), 0);
    sort(ordem.begin(), ordem.end(), [&](int i, int j) {
        return peso[i] < peso[j];
    });

    DSU dsu(n);
    ll custo = 0;
    int usadas = 0;
    for (int i : ordem) {
        auto [u, v] = arestas[i];
        if (dsu.join(u, v)) {
            custo += peso[i];
            usadas++;
        }
    }
    if (usadas != n - 1) cout << "IMPOSSIVEL" << endl;
    else cout << custo << endl;`,
  'Ordena arestas por peso e usa DSU com compressão de caminho e união por tamanho. Entrada: n ≥ 1, m e arestas u v peso. Saída: custo da AGM, ou IMPOSSIVEL se o grafo for desconectado.', 'O(E log E + V)', 'O(V + E)', ['kruskal', 'agm', 'dsu', 'grafos'], '10\n',
  `struct DSU {
    vector<int> pai, tamanho;

    DSU(int n) : pai(n + 1), tamanho(n + 1, 1) {
        iota(pai.begin(), pai.end(), 0);
    }

    int find(int u) {
        if (pai[u] == u) return u;
        return pai[u] = find(pai[u]);
    }

    bool join(int u, int v) {
        u = find(u);
        v = find(v);
        if (u == v) return false;
        if (tamanho[u] < tamanho[v]) swap(u, v);
        pai[v] = u;
        tamanho[u] += tamanho[v];
        return true;
    }
};`),

  define('topological-sort', 'Kahn: ordenação topológica', 'Grafos', `6 6
1 2
1 3
2 4
3 4
4 5
4 6
`, `    int n, m;
    cin >> n >> m;
    vector<vector<int>> adj(n + 1);
    vector<int> grau(n + 1);
    for (int i = 0; i < m; i++) {
        int u, v;
        cin >> u >> v;
        adj[u].push_back(v);
        grau[v]++;
    }

    queue<int> q;
    for (int u = 1; u <= n; u++) {
        if (grau[u] == 0) q.push(u);
    }
    vector<int> ordem;
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        ordem.push_back(u);
        for (int v : adj[u]) {
            grau[v]--;
            if (grau[v] == 0) q.push(v);
        }
    }
    if ((int)ordem.size() != n) {
        cout << "CICLO" << endl;
        return;
    }
    for (int i = 0; i < n; i++) {
        if (i) cout << ' ';
        cout << ordem[i];
    }
    cout << endl;`,
  'Kahn em grafo direcionado com vértices de 1 a n. Entrada: n, m e m arestas. Saída: uma ordem topológica, ou CICLO se houver ciclo.', 'O(V + E)', 'O(V + E)', ['kahn', 'topológica', 'dag', 'grafos'], '1 2 3 4 5 6\n'),

  define('knapsack', 'Programação dinâmica: mochila 0/1', 'DP', `4 7
1 1
3 4
4 5
5 7
`, `    int n, capacidade;
    cin >> n >> capacidade;
    vector<int> peso(n);
    vector<ll> valor(n);
    for (int i = 0; i < n; i++) cin >> peso[i] >> valor[i];

    vector<ll> dp(capacidade + 1);
    for (int i = 0; i < n; i++) {
        for (int c = capacidade; c >= peso[i]; c--) {
            dp[c] = max(dp[c], dp[c - peso[i]] + valor[i]);
        }
    }
    cout << dp[capacidade] << endl;`,
  'Mochila 0/1: percorre capacidades em ordem decrescente para usar cada item no máximo uma vez. Entrada: n, capacidade W e n pares peso valor (pesos positivos). Saída: maior valor possível.', 'O(nW)', 'O(n + W)', ['dp', 'mochila', 'knapsack', 'capacidade'], '9\n'),

  define('sieve', 'Crivo de Eratóstenes', 'Matemática', `30
`, `    int n;
    cin >> n;
    vector<int> primo(n + 1, 1);
    primo[0] = 0;
    if (n >= 1) primo[1] = 0;

    for (int p = 2; p <= n / p; p++) {
        if (!primo[p]) continue;
        for (ll x = 1LL * p * p; x <= n; x += p) primo[x] = 0;
    }
    vector<int> primos;
    for (int i = 2; i <= n; i++) {
        if (primo[i]) primos.push_back(i);
    }
    for (int i = 0; i < (int)primos.size(); i++) {
        if (i) cout << ' ';
        cout << primos[i];
    }
    cout << endl;`,
  'Marca múltiplos a partir de p². Entrada: limite n ≥ 0. Saída: todos os primos de 2 até n, em ordem crescente.', 'O(n log log n)', 'O(n)', ['crivo', 'primos', 'eratóstenes', 'vetores'], '2 3 5 7 11 13 17 19 23 29\n'),

  define('greedy-activity', 'Greedy: seleção de atividades', 'Greedy', `6
1 3
2 5
4 7
6 9
8 10
5 6
`, `    int n;
    cin >> n;
    vector<tuple<ll, ll, int>> atividades;
    for (int i = 1; i <= n; i++) {
        ll inicio, fim;
        cin >> inicio >> fim;
        atividades.push_back({fim, inicio, i});
    }
    sort(atividades.begin(), atividades.end());

    ll ultimo = numeric_limits<ll>::lowest();
    vector<int> escolhidas;
    for (auto [fim, inicio, id] : atividades) {
        if (inicio >= ultimo) {
            ultimo = fim;
            escolhidas.push_back(id);
        }
    }
    cout << escolhidas.size() << endl;
    for (int i = 0; i < (int)escolhidas.size(); i++) {
        if (i) cout << ' ';
        cout << escolhidas[i];
    }
    cout << endl;`,
  'Maximiza a quantidade de atividades sem sobreposição, escolhendo os menores términos. Entrada: n e pares início fim (início < fim). Saída: quantidade e IDs originais a partir de 1. Atividades podem se tocar nas extremidades.', 'O(n log n)', 'O(n)', ['greedy', 'activity selection', 'ordenação', 'vetores'], '3\n1 6 4\n'),

  define('backtracking-subsets', 'Backtracking: subconjuntos', 'Backtracking', `3
1 2 3
`, `    int n;
    cin >> n;
    vector<ll> a(n), atual;
    for (ll& x : a) cin >> x;

    function<void(int)> go = [&](int i) {
        if (i == n) {
            cout << '{';
            for (int j = 0; j < (int)atual.size(); j++) {
                if (j) cout << ' ';
                cout << atual[j];
            }
            cout << '}' << endl;
            return;
        }
        go(i + 1);
        atual.push_back(a[i]);
        go(i + 1);
        atual.pop_back();
    };
    go(0);`,
  'Gera subconjuntos por incluir ou excluir cada posição, desfazendo escolhas ao retornar. Entrada: n e n valores. Saída: um subconjunto por linha, incluindo {}. Use n pequeno; valores repetidos podem gerar linhas iguais.', 'O(n · 2ⁿ), incluindo a saída', 'O(n) auxiliar', ['backtracking', 'recursão', 'subconjuntos'], '{}\n{3}\n{2}\n{2 3}\n{1}\n{1 3}\n{1 2}\n{1 2 3}\n'),

  define('kmp', 'KMP: busca de padrão', 'Strings', `abracadabra
cada
`, `    string s, p;
    getline(cin, s);
    getline(cin, p);
    int n = (int)s.size(), m = (int)p.size();
    if (m == 0) {
        cout << 0 << endl;
        return;
    }

    vector<int> pi(m);
    for (int i = 1, j = 0; i < m; i++) {
        while (j > 0 && p[i] != p[j]) j = pi[j - 1];
        if (p[i] == p[j]) j++;
        pi[i] = j;
    }

    int pos = -1;
    for (int i = 0, j = 0; i < n; i++) {
        while (j > 0 && s[i] != p[j]) j = pi[j - 1];
        if (s[i] == p[j]) j++;
        if (j == m) {
            pos = i - m + 1;
            break;
        }
    }
    cout << pos << endl;`,
  'Usa a função de prefixo para buscar sem recuar no texto. Entrada: texto na primeira linha e padrão na segunda, permitindo espaços. Saída: primeira posição a partir de 0, ou -1; padrão vazio retorna 0.', 'O(n + m)', 'O(m) auxiliar', ['kmp', 'strings', 'padrão', 'prefix function'], '4\n'),

  define('max-flow', 'Fluxo máximo (Edmonds-Karp)', 'Fluxo', `4 5 1 4
1 2 3
1 3 2
2 3 1
2 4 2
3 4 3
`, `    int n, m, s, t;
    cin >> n >> m >> s >> t;
    vector<vector<ll>> capacidade(n + 1, vector<ll>(n + 1));
    vector<vector<int>> adj(n + 1);
    for (int i = 0; i < m; i++) {
        int u, v;
        ll c;
        cin >> u >> v >> c;
        capacidade[u][v] += c;
        adj[u].push_back(v);
        adj[v].push_back(u);
    }
    if (s == t) {
        cout << 0 << endl;
        return;
    }

    ll fluxo = 0;
    while (true) {
        vector<int> pai(n + 1, -1);
        queue<int> q;
        pai[s] = s;
        q.push(s);
        while (!q.empty() && pai[t] == -1) {
            int u = q.front();
            q.pop();
            for (int v : adj[u]) {
                if (pai[v] != -1 || capacidade[u][v] == 0) continue;
                pai[v] = u;
                q.push(v);
            }
        }
        if (pai[t] == -1) break;

        ll aumento = numeric_limits<ll>::max();
        for (int v = t; v != s; v = pai[v]) {
            aumento = min(aumento, capacidade[pai[v]][v]);
        }
        for (int v = t; v != s; v = pai[v]) {
            int u = pai[v];
            capacidade[u][v] -= aumento;
            capacidade[v][u] += aumento;
        }
        fluxo += aumento;
    }
    cout << fluxo << endl;`,
  'BFS encontra caminhos aumentantes na rede residual. Entrada: n, m, origem, destino e m arestas dirigidas u v capacidade (não negativa). Saída: fluxo máximo. A matriz guarda capacidades residuais; adj inclui arestas reversas. Somas devem caber em ll.', 'O(VE²)', 'O(V² + E)', ['fluxo', 'edmonds-karp', 'max flow', 'grafos'], '5\n'),

  define('two-sum', 'Two Sum com tabela hash', 'Problemas clássicos', `5 9
2 7 11 15 1
`, `    int n;
    ll alvo;
    cin >> n >> alvo;
    vector<ll> a(n);
    for (ll& x : a) cin >> x;

    unordered_map<ll, int> pos;
    for (int i = 0; i < n; i++) {
        ll falta = alvo - a[i];
        auto it = pos.find(falta);
        if (it != pos.end()) {
            cout << it->second << ' ' << i << endl;
            return;
        }
        pos[a[i]] = i;
    }
    cout << -1 << endl;`,
  'Procura o complemento na tabela antes de inserir o elemento atual, garantindo índices distintos. Entrada: n, alvo e vetor não necessariamente ordenado. Saída: dois índices a partir de 0, ou -1.', 'O(n) esperado; O(n²) no pior caso', 'O(n)', ['hash', 'two sum', 'vetores', 'complemento'], '0 1\n'),

  define('merge-sort', 'Merge Sort', 'Ordenação', `7
6 3 8 2 9 1 5
`, `    int n;
    cin >> n;
    vector<ll> a(n), aux(n);
    for (ll& x : a) cin >> x;
    merge_sort(a, aux, 0, n);
    for (int i = 0; i < n; i++) {
        if (i) cout << ' ';
        cout << a[i];
    }
    cout << endl;`,
  'Ordenação estável por divisão e conquista: divide e intercala duas metades ordenadas. Entrada: n e n valores. Saída: vetor em ordem crescente.', 'O(n log n)', 'O(n) auxiliar', ['merge sort', 'ordenação', 'divisão e conquista', 'recursão'], '1 2 3 5 6 8 9\n',
  `void merge_sort(vector<ll>& a, vector<ll>& aux, int l, int r) {
    if (r - l <= 1) return;
    int m = l + (r - l) / 2;
    merge_sort(a, aux, l, m);
    merge_sort(a, aux, m, r);

    int i = l, j = m;
    for (int k = l; k < r; k++) {
        if (j == r || (i < m && a[i] <= a[j])) aux[k] = a[i++];
        else aux[k] = a[j++];
    }
    for (int k = l; k < r; k++) a[k] = aux[k];
}`),

  define('prefix-sum', 'Somas de prefixos', 'Vetores', `6
2 4 1 7 3 5
3
1 3
2 6
4 5
`, `    int n;
    cin >> n;
    vector<ll> a(n), prefixo(n + 1);
    for (ll& x : a) cin >> x;
    for (int i = 0; i < n; i++) prefixo[i + 1] = prefixo[i] + a[i];

    int q;
    cin >> q;
    while (q--) {
        int l, r;
        cin >> l >> r;
        cout << prefixo[r] - prefixo[l - 1] << endl;
    }`,
  'Pré-processa somas para consultas em O(1), sem atualizações do vetor. Entrada: n, vetor, q e intervalos l r (inclusivos, a partir de 1). Saída: uma soma por consulta.', 'O(n + q)', 'O(n)', ['prefix sum', 'prefixos', 'consulta', 'intervalo'], '7\n20\n10\n'),

  define('sliding-window', 'Janela deslizante: soma máxima', 'Vetores', `8 3
2 1 5 1 3 2 8 1
`, `    int n, k;
    cin >> n >> k;
    vector<ll> a(n);
    for (ll& x : a) cin >> x;
    if (k <= 0 || k > n) {
        cout << "IMPOSSIVEL" << endl;
        return;
    }

    ll soma = 0;
    for (int i = 0; i < k; i++) soma += a[i];
    ll melhor = soma;
    for (int r = k; r < n; r++) {
        soma += a[r] - a[r - k];
        melhor = max(melhor, soma);
    }
    cout << melhor << endl;`,
  'Mantém a soma de uma janela fixa, removendo o primeiro e acrescentando o próximo elemento. Entrada: n, tamanho k e vetor (permite negativos). Saída: maior soma de k elementos consecutivos, ou IMPOSSIVEL se k for inválido.', 'O(n)', 'O(1) auxiliar', ['sliding window', 'janela', 'soma', 'vetores'], '13\n'),

  define('fenwick-tree', 'Fenwick Tree: soma e atualização', 'Estruturas', `6 5
2 4 1 7 3 5
2 1 3
1 3 5
2 1 3
1 6 -2
2 4 6
`, `    int n, q;
    cin >> n >> q;
    vector<ll> bit(n + 1);
    auto add = [&](int i, ll delta) {
        for (; i <= n; i += i & -i) bit[i] += delta;
    };
    auto sum = [&](int i) {
        ll soma = 0;
        for (; i > 0; i -= i & -i) soma += bit[i];
        return soma;
    };
    for (int i = 1; i <= n; i++) {
        ll x;
        cin >> x;
        add(i, x);
    }
    while (q--) {
        int tipo;
        cin >> tipo;
        if (tipo == 1) {
            int i;
            ll delta;
            cin >> i >> delta;
            add(i, delta);
        } else {
            int l, r;
            cin >> l >> r;
            cout << sum(r) - sum(l - 1) << endl;
        }
    }`,
  'Somas e incrementos pontuais usando uma árvore de Fenwick. Entrada: n, q, vetor e operações 1 i delta (somar) ou 2 l r (consultar). Índices válidos de 1 a n. Saída: uma soma por consulta.', 'O((n + q) log n)', 'O(n)', ['fenwick', 'bit', 'binary indexed tree', 'soma', 'atualização'], '7\n12\n13\n'),

  define('lis', 'LIS: subsequência crescente máxima', 'DP', `8
10 9 2 5 3 7 101 18
`, `    int n;
    cin >> n;
    vector<ll> a(n), caudas;
    for (ll& x : a) cin >> x;

    for (ll x : a) {
        int pos = (int)(lower_bound(caudas.begin(), caudas.end(), x) - caudas.begin());
        if (pos == (int)caudas.size()) caudas.push_back(x);
        else caudas[pos] = x;
    }
    cout << caudas.size() << endl;`,
  'Mantém o menor término possível para cada tamanho de subsequência, usando lower_bound. Entrada: n e vetor. Saída: tamanho da maior subsequência estritamente crescente; valores iguais não aumentam o tamanho.', 'O(n log n)', 'O(n)', ['lis', 'subsequência', 'dp', 'busca binária'], '4\n'),

  define('zero-one-bfs', '0-1 BFS', 'Grafos', `5 6
1 2 0
1 3 1
2 3 0
2 4 1
3 4 0
4 5 1
1 5
`, `    int n, m;
    cin >> n >> m;
    vector<vector<pair<int, int>>> adj(n + 1);
    for (int i = 0; i < m; i++) {
        int u, v, w;
        cin >> u >> v >> w;
        adj[u].push_back({v, w});
    }
    int s, t;
    cin >> s >> t;

    const int INF = numeric_limits<int>::max();
    vector<int> dist(n + 1, INF), vis(n + 1);
    deque<int> dq;
    dist[s] = 0;
    dq.push_front(s);
    while (!dq.empty()) {
        int u = dq.front();
        dq.pop_front();
        if (vis[u]) continue;
        vis[u] = 1;
        for (auto [v, w] : adj[u]) {
            if (dist[u] + w >= dist[v]) continue;
            dist[v] = dist[u] + w;
            if (w == 0) dq.push_front(v);
            else dq.push_back(v);
        }
    }
    cout << (dist[t] == INF ? -1 : dist[t]) << endl;`,
  'Menor caminho em grafo direcionado cujos pesos são exclusivamente 0 ou 1. Entrada: n, m, arestas u v peso, origem e destino (vértices de 1 a n). Saída: distância mínima, ou -1.', 'O(V + E)', 'O(V + E)', ['0-1 bfs', 'deque', 'menor caminho', 'grafos'], '1\n'),

  define('binary-exponentiation', 'Exponenciação binária modular', 'Matemática', `2 10 1000000007
`, `    ll base, expoente, modulo;
    cin >> base >> expoente >> modulo;
    base %= modulo;
    if (base < 0) base += modulo;
    ll resultado = 1 % modulo;
    while (expoente > 0) {
        if (expoente & 1) resultado = (ll)((__int128)resultado * base % modulo);
        base = (ll)((__int128)base * base % modulo);
        expoente >>= 1;
    }
    cout << resultado << endl;`,
  'Calcula base^expoente módulo m por quadrados sucessivos. Entrada: base, expoente ≥ 0 e módulo > 0. Saída: resíduo. Usa __int128 do GCC para evitar overflow nas multiplicações de ll.', 'O(log expoente)', 'O(1)', ['fast power', 'binpow', 'modular', 'potência'], '1024\n'),

  define('tuple-optional', 'Tuplas e resultado opcional', 'Estruturas', `4
1 12
2 8
3 25
4 20
`, `    int n;
    cin >> n;
    vector<tuple<ll, ll>> registros;
    optional<tuple<ll, ll>> melhor;
    for (int i = 0; i < n; i++) {
        ll id, pontos;
        cin >> id >> pontos;
        tuple<ll, ll> registro{id, pontos};
        registros.push_back(registro);
        if (!melhor || get<1>(registro) > get<1>(*melhor)) melhor = registro;
    }
    if (melhor) cout << get<0>(*melhor) << ' ' << get<1>(*melhor) << endl;
    else cout << "SEM RESULTADO" << endl;`,
  'Acompanha tuplas de identificador e pontuação e um resultado que começa vazio. Entrada: n e n pares id pontos. Saída: id e pontos do primeiro registro com a maior pontuação, ou SEM RESULTADO.', 'O(n)', 'O(n)', ['tuple', 'optional', 'tuplas', 'registros'], '3 25\n'),

  define('bitset-switch', 'Bits e seleção com switch', 'Estruturas', `4
1 0
1 3
3 0
1 6
`, `    int q;
    cin >> q;
    bitset<8> flags;
    while (q--) {
        int operacao, indice;
        cin >> operacao >> indice;
        if (indice < 0 || indice >= 8) continue;
        switch (operacao) {
            case 1: flags.set(indice); break;
            case 2: flags.reset(indice); break;
            case 3: flags.flip(indice); break;
            default: break;
        }
    }
    cout << flags.to_string() << endl;`,
  'Visualiza oito bits e cada caso executado no switch. O índice 0 é o bit menos significativo, à direita na saída textual. Entrada: q e q pares operação índice (1 liga, 2 desliga, 3 inverte); índices de 0 a 7. Saída: os oito bits finais.', 'O(q)', 'O(1)', ['bitset', 'bits', 'switch', 'máscara'], '01001000\n'),

  define('euclidean-gcd', 'Euclides: máximo divisor comum', 'Matemática', `48 18
`, `    ll a, b;
    cin >> a >> b;
    while (b != 0) {
        ll resto = a % b;
        a = b;
        b = resto;
    }
    cout << a << endl;`,
  'Calcula o MDC por divisões sucessivas. Entrada: a e b não negativos. Saída: MDC(a, b); para 0 e 0, retorna 0.', 'O(log min(a, b)), para a,b > 0', 'O(1)', ['gcd', 'mdc', 'euclides', 'divisibilidade'], '6\n'),

  define('linked-list-reversal', 'Lista ligada: reversão de ponteiros', 'Ponteiros', `5
1 2 3 4 5
`, `    int n;
    cin >> n;
    ListNode* head = nullptr;
    ListNode* tail = nullptr;
    for (int i = 0; i < n; i++) {
        ll value;
        cin >> value;
        ListNode* node = new ListNode{value};
        if (tail) tail->next = node;
        else head = node;
        tail = node;
    }
    ListNode* previous = nullptr;
    ListNode* current = head;
    while (current) {
        ListNode* next = current->next;
        current->next = previous;
        previous = current;
        current = next;
    }
    head = previous;
    bool first = true;
    for (ListNode* node = head; node; node = node->next) {
        if (!first) cout << ' ';
        first = false;
        cout << node->value;
    }
    cout << endl;
    while (head) {
        ListNode* next = head->next;
        delete head;
        head = next;
    }`,
  'Inverte uma lista simplesmente ligada e libera os nós. Entrada: n ≥ 0 e n valores. Saída: valores na ordem inversa. A visualização acompanha head, next e cada alteração de ligação.', 'O(n)', 'O(n) para os nós; O(1) auxiliar', ['lista ligada', 'ponteiros', 'struct', 'reversão'], '5 4 3 2 1\n',
  `struct ListNode {
    ll value = 0;
    ListNode* next = nullptr;
};`),

  define('bst-insertion', 'Árvore binária de busca: inserção e percurso', 'Ponteiros', `7
5 3 7 2 4 6 8
`, `    int n;
    cin >> n;
    SearchNode* root = nullptr;
    for (int i = 0; i < n; i++) {
        ll value;
        cin >> value;
        root = insertNode(root, value);
    }
    vector<ll> ordered;
    inorder(root, ordered);
    for (int i = 0; i < (int)ordered.size(); i++) {
        if (i) cout << ' ';
        cout << ordered[i];
    }
    cout << endl;
    destroyTree(root);
    root = nullptr;`,
  'Insere valores em uma BST, preservando repetidos no ramo direito. Entrada: n ≥ 0 e n valores. Saída: percurso em ordem. Mostra nós, filhos e chamadas recursivas; árvores muito profundas exigem uma versão iterativa.', 'O(nh), h é a altura; O(n²) no pior caso', 'O(n) para os nós; O(h) na pilha', ['bst', 'árvore binária', 'ponteiros', 'recursão'], '2 3 4 5 6 7 8\n',
  `struct SearchNode {
    ll value = 0;
    SearchNode* left = nullptr;
    SearchNode* right = nullptr;
};

SearchNode* insertNode(SearchNode* root, ll value) {
    if (!root) return new SearchNode{value};
    if (value < root->value) root->left = insertNode(root->left, value);
    else root->right = insertNode(root->right, value);
    return root;
}

void inorder(SearchNode* root, vector<ll>& ordered) {
    if (!root) return;
    inorder(root->left, ordered);
    ordered.push_back(root->value);
    inorder(root->right, ordered);
}

void destroyTree(SearchNode* root) {
    if (!root) return;
    destroyTree(root->left);
    destroyTree(root->right);
    delete root;
}`),

  define('trie-prefix-count', 'Trie: contagem por prefixo', 'Estruturas', `4
casa
casaco
carro
bola
3
ca
cas
bo
`, `    int n;
    cin >> n;
    vector<TrieNode> trie(1);
    for (int i = 0; i < n; i++) {
        string word;
        cin >> word;
        int node = 0;
        trie[node].count++;
        for (char letter : word) {
            int c = letter - 'a';
            if (trie[node].children[c] == 0) {
                int next = (int)trie.size();
                trie[node].children[c] = next;
                trie.push_back(TrieNode{});
            }
            node = trie[node].children[c];
            trie[node].count++;
        }
    }
    int q;
    cin >> q;
    while (q--) {
        string prefix;
        cin >> prefix;
        int node = 0;
        bool found = true;
        for (char letter : prefix) {
            int next = trie[node].children[letter - 'a'];
            if (next == 0) { found = false; break; }
            node = next;
        }
        cout << (found ? trie[node].count : 0) << endl;
    }`,
  'Conta palavras que começam com cada prefixo, incluindo repetições. Entrada: n palavras e q prefixos, somente letras minúsculas a–z. Saída: uma contagem por prefixo. Usa vetor de structs com campos e array de filhos.', 'O(total de caracteres da entrada e consultas)', 'O(total de caracteres das palavras · 26)', ['trie', 'prefixos', 'struct', 'vector de objetos'], '3\n2\n1\n',
  `struct TrieNode {
    array<int, 26> children{};
    int count = 0;
};`),

  define('huffman-tree', 'Huffman: árvore de codificação', 'Greedy', `6
5 9 12 13 16 45
`, `    int n;
    cin >> n;
    priority_queue<HuffmanEntry, vector<HuffmanEntry>, HuffmanCompare> heap;
    int serial = 0;
    for (int i = 0; i < n; i++) {
        ll frequency;
        cin >> frequency;
        HuffmanNode* node = new HuffmanNode{frequency};
        heap.push(HuffmanEntry{frequency, serial++, node});
    }
    ll cost = 0;
    while (heap.size() > 1) {
        HuffmanEntry left = heap.top(); heap.pop();
        HuffmanEntry right = heap.top(); heap.pop();
        ll combined = left.frequency + right.frequency;
        HuffmanNode* node = new HuffmanNode{combined, left.node, right.node};
        cost += combined;
        heap.push(HuffmanEntry{combined, serial++, node});
    }
    HuffmanNode* root = heap.empty() ? nullptr : heap.top().node;
    cout << cost << endl;
    destroyHuffman(root);
    root = nullptr;`,
  'Combina repetidamente as duas menores frequências para construir a árvore de Huffman. Entrada: n ≥ 0 e n frequências não negativas, cuja soma e custo cabem em ll. Saída: custo ponderado mínimo. Mostra heap com comparador personalizado e nós ligados por ponteiros.', 'O(n log n)', 'O(n)', ['huffman', 'heap', 'comparador', 'struct', 'ponteiros'], '224\n',
  `struct HuffmanNode {
    ll frequency = 0;
    HuffmanNode* left = nullptr;
    HuffmanNode* right = nullptr;
};
struct HuffmanEntry {
    ll frequency = 0;
    int serial = 0;
    HuffmanNode* node = nullptr;
};
struct HuffmanCompare {
    bool operator()(const HuffmanEntry& a, const HuffmanEntry& b) const {
        return tie(a.frequency, a.serial) > tie(b.frequency, b.serial);
    }
};
void destroyHuffman(HuffmanNode* root) {
    if (!root) return;
    destroyHuffman(root->left);
    destroyHuffman(root->right);
    delete root;
}`),

  define('generic-insertion-sort', 'Insertion Sort genérico: template e if constexpr', 'Ordenação', `6
9 -2 7 7 0 3
`, `    int n;
    cin >> n;
    vector<ll> a(n);
    for (ll& value : a) cin >> value;
    insertionSort(a);
    for (int i = 0; i < n; i++) {
        if (i) cout << ' ';
        cout << a[i];
    }
    cout << endl;`,
  'Ordena uma sequência numérica com uma função template; if constexpr seleciona a implementação válida para o tipo. Entrada: n ≥ 0 e n valores. Saída: valores em ordem crescente.', 'O(n²)', 'O(1) auxiliar', ['insertion sort', 'template', 'if constexpr', 'trocas'], '-2 0 3 7 7 9\n',
  `template<class T> void insertionSort(vector<T>& a) {
    if constexpr (is_arithmetic_v<T>) {
        for (int i = 1; i < (int)a.size(); i++) {
            int j = i;
            while (j > 0 && a[j - 1] > a[j]) {
                swap(a[j - 1], a[j]);
                j--;
            }
        }
    }
}`),

  define('constexpr-factorial', 'Fatorial: constexpr e recursão em runtime', 'Matemática', `5
`, `    int n;
    cin >> n;
    if (n < 0 || n > 20) { cout << "FORA DO INTERVALO" << endl; return; }
    ll result = factorial(n);
    cout << result << endl;`,
  'Calcula n! com uma função constexpr. O static_assert continua sendo avaliado na compilação; a chamada com stdin aparece na árvore de chamadas. Entrada: n entre 0 e 20. Saída: n!, ou FORA DO INTERVALO para n inválido.', 'O(n)', 'O(n) na pilha', ['constexpr', 'fatorial', 'recursão', 'static_assert'], '120\n',
  `constexpr ll factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}
static_assert(factorial(5) == 120);`),

  define('postfix-evaluation', 'Expressão pós-fixa: pilha e exceções', 'Estruturas', `2 3 + 4 *
`, `    stack<ll> values;
    string token;
    try {
        while (cin >> token) {
            if (token.size() == 1 && string("+-*/").find(token[0]) != string::npos) {
                if (values.size() < 2) throw invalid_argument("operandos insuficientes");
                ll right = values.top(); values.pop();
                ll left = values.top(); values.pop();
                values.push(applyOperator(token[0], left, right));
            } else {
                size_t consumed = 0;
                ll value = stoll(token, &consumed);
                if (consumed != token.size()) throw invalid_argument("token inválido");
                values.push(value);
            }
        }
        if (values.size() != 1) throw invalid_argument("expressão incompleta");
        cout << values.top() << endl;
    } catch (const exception&) {
        cout << "EXPRESSAO INVALIDA" << endl;
    }`,
  'Avalia RPN com inteiros e operações +, -, * e divisão inteira. Entrada: tokens separados por espaços até EOF. Saída: resultado em ll, ou EXPRESSAO INVALIDA para tokens inválidos, falta de operandos, divisão por zero ou overflow. Mostra pilha, lançamento e captura de exceções.', 'O(número de tokens)', 'O(número de tokens)', ['rpn', 'pós-fixa', 'stack', 'try catch', 'exceção'], '20\n',
  `ll applyOperator(char operation, ll left, ll right) {
    if (operation == '/') {
        if (right == 0 || (left == LLONG_MIN && right == -1)) throw invalid_argument("divisão inválida");
        return left / right;
    }
    __int128 result = operation == '+' ? (__int128)left + right : operation == '-' ? (__int128)left - right : (__int128)left * right;
    if (result < LLONG_MIN || result > LLONG_MAX) throw overflow_error("overflow");
    return (ll)result;
}`),

  define('euclidean-gcd-goto', 'Euclides: saltos e rótulos', 'Matemática', `48 18
`, `    ll a, b;
    cin >> a >> b;
    cout << gcdWithLabels(a, b) << endl;`,
  'Executa Euclides com rótulo e goto para demonstrar o acompanhamento de saltos sem mudar o escopo das variáveis. Entrada: a e b não negativos. Saída: MDC(a, b), com MDC(0, 0) = 0.', 'O(log min(a, b)), para a,b > 0', 'O(1)', ['mdc', 'goto', 'rótulo', 'controle de fluxo'], '6\n',
  `ll gcdWithLabels(ll a, ll b) {
repeat:
    if (b == 0) return a;
    ll remainder = a % b;
    a = b;
    b = remainder;
    goto repeat;
}`),

  define('lcs-string-table', 'LCS: tabela de strings e reconstrução', 'DP', `ABCBDAB
BDCABA
`, `    string a, b;
    getline(cin, a);
    getline(cin, b);
    int n = (int)a.size(), m = (int)b.size();
    vector<vector<string>> dp(n + 1, vector<string>(m + 1));
    for (int i = 1; i <= n; i++) {
        for (int j = 1; j <= m; j++) {
            if (a[i - 1] == b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + a[i - 1];
            else dp[i][j] = dp[i - 1][j].size() >= dp[i][j - 1].size() ? dp[i - 1][j] : dp[i][j - 1];
        }
    }
    cout << dp[n][m].size() << endl;
    cout << dp[n][m] << endl;`,
  'Guarda uma LCS inteira em cada célula para tornar a reconstrução visível. Entrada: duas linhas de texto, que podem ser vazias. Saída: tamanho e uma subsequência comum máxima; empates escolhem a célula acima. É uma versão didática, com custo extra das cópias de strings.', 'O(nm · min(n, m))', 'O(nm · min(n, m))', ['lcs', 'strings', 'matriz textual', 'dp', 'reconstrução'], '4\nBCBA\n'),
];
