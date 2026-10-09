export const CPP_HEADER = `#include <bits/stdc++.h>
#define endl '\\n'
using namespace std;
using ll = long long;
`;

export const CPP_MAIN = `signed main() {
    cin.tie(0)->sync_with_stdio(0);
    solve();
}
`;

export const DEFAULT_CPP_CODE = `${CPP_HEADER}
void solve() { }

${CPP_MAIN}`;

export function buildCppProgram(body: string, helpers = ''): string {
  return `${CPP_HEADER}\n${helpers ? `${helpers.trim()}\n\n` : ''}void solve() {\n${body.trimEnd()}\n}\n\n${CPP_MAIN}`;
}
