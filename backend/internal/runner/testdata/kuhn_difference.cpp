#include <bits/stdc++.h>
#define endl '\n'
using namespace std;
using ll = long long;

set<pair<int, int>> s1, s2;
vector<pair<int, int>> A, B;
vector<vector<int>> g;
vector<int> par, visited;

bool dfs(int v) {
    if (visited[v]) return false;
    visited[v] = 1;
    for (int to : g[v]) {
        if (par[to] == -1 || dfs(par[to])) {
            par[to] = v;
            return true;
        }
    }
    return false;
}

void solve() {
    int n, m1, m2;
    cin >> n >> m1 >> m2;
    for (int i = 0; i < m1; i++) {
        int u, v;
        cin >> u >> v;
        if (u > v) swap(u, v);
        s1.insert({u, v});
    }
    for (int i = 0; i < m2; i++) {
        int u, v;
        cin >> u >> v;
        if (u > v) swap(u, v);
        s2.insert({u, v});
    }
    for (auto edge : s1) {
        if (!s2.count(edge)) A.push_back(edge);
    }
    for (auto edge : s2) {
        if (!s1.count(edge)) B.push_back(edge);
    }
    int k = static_cast<int>(A.size());
    g.assign(k, {});
    for (int i = 0; i < k; i++) {
        for (int j = 0; j < static_cast<int>(B.size()); j++) {
            if (A[i].first == B[j].first || A[i].first == B[j].second ||
                A[i].second == B[j].first || A[i].second == B[j].second) {
                g[i].push_back(j);
            }
        }
    }
    par.assign(B.size(), -1);
    visited.assign(k, 0);
    int mt = 0;
    for (int i = 0; i < k; i++) {
        visited.assign(k, 0);
        if (dfs(i)) mt++;
    }
    cout << 2 * k - mt << endl;
}

signed main() {
    cin.tie(0)->sync_with_stdio(0);
    solve();
}
