#include <bits/stdc++.h>
#define endl '\n'
using namespace std;
using ll = long long;

void solve() {
    int n;
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
    cout << endl;
}

signed main() {
    cin.tie(0)->sync_with_stdio(0);
    solve();
}
