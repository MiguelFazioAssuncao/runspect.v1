#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<int> a(n);
    for (int& x : a) cin >> x;
    for (int i = 0; i < n - 1; i++) {
        bool trocou = false;
        for (int j = 0; j + 1 < n - i; j++) {
            if (a[j] > a[j + 1]) {
                swap(a[j], a[j + 1]);
                trocou = true;
            }
        }
        if (!trocou) {
            for (int k = 0; k < n - 1 - i; k++) ;
            break;
        }
    }
    if (n > 0) ;
    for (int i = 0; i < n; i++) cout << a[i] << " ";
    cout << endl;
}
