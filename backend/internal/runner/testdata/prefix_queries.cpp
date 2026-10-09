#include <bits/stdc++.h>
#define endl '\n'
using namespace std;
using ll = long long;

void solve() {
    int n;
    cin >> n;
    vector<int> compras(n);
    vector<int> vendas(n);
    for (int i = 0; i < n; i++) {
        int c, v;
        cin >> c >> v;
        if (i == 0) {
            compras[i] = c;
            vendas[i] = v;
        } else {
            compras[i] = compras[i - 1] + c;
            vendas[i] = vendas[i - 1] + v;
        }
    }
    int q;
    cin >> q;
    for (int i = 0; i < q; i++) {
        int nj;
        cin >> nj;
        nj--;
        if (compras[nj] > vendas[nj]) {
            cout << "COMPRA" << endl;
        } else if (compras[nj] < vendas[nj]) {
            cout << "VENDA" << endl;
        } else {
            cout << "NEUTRO" << endl;
        }
    }
}
signed main() {
    cin.tie(0)->sync_with_stdio(0);
    solve();
}
