#include <bits/stdc++.h>
using namespace std;

int main() {
    string s, p;
    getline(cin, s);
    getline(cin, p);
    int n = s.size(), m = p.size();
    if (m == 0 || n < m) {
        cout << "Padrao nao encontrado" << "\n";
        return 0;
    }
    vector<int> texto(s.begin(), s.end()), padrao(p.begin(), p.end()), pi(m);
    for (int i = 1, j = 0; i < m; i++) {
        while (j > 0 && p[i] != p[j]) {
            j = pi[j - 1];
        }
        if (p[i] == p[j]) j++;
        pi[i] = j;
    }
    auto compara = [&](int i, int j, const string& legenda) {};
    int pos = -1;
    for (int i = 0, j = 0; i < n; i++) {
        while (j > 0 && s[i] != p[j]) {
            compara(i, j, "recuo");
            j = pi[j - 1];
        }
        compara(i, j, "comparação");
        if (s[i] == p[j]) j++;
        if (j == m) {
            pos = i - m + 1;
            for (int k = 0; k < m; k++) {}
            break;
        }
    }
    if (pos == -1) ;
    cout << (pos == -1 ? "Padrao nao encontrado" : "Posicao: " + to_string(pos)) << "\n";
}
