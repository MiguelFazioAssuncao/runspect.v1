import { describe, expect, it } from 'vitest';
import { buildCppProgram, CPP_HEADER, CPP_MAIN, DEFAULT_CPP_CODE } from './cppTemplate';
import { documentationMethods } from './documentation';

describe('template de C++ competitivo', () => {
  it('mantém exatamente o template fornecido como código inicial', () => {
    expect(DEFAULT_CPP_CODE).toBe(`#include <bits/stdc++.h>
#define endl '\\n'
using namespace std;
using ll = long long;

void solve() { }

signed main() {
    cin.tie(0)->sync_with_stdio(0);
    solve();
}
`);
  });

  it('posiciona auxiliares antes de solve e usa um único main', () => {
    const code = buildCppProgram('    cout << dobro(4) << endl;', 'll dobro(ll n) { return 2 * n; }');
    expect(code.startsWith(CPP_HEADER)).toBe(true);
    expect(code.endsWith(CPP_MAIN)).toBe(true);
    expect(code.indexOf('ll dobro')).toBeLessThan(code.indexOf('void solve()'));
    expect(code.match(/\bmain\s*\(/g)).toHaveLength(1);
  });

  it('aplica o template às demonstrações da API e inclui o header antes da macro endl', () => {
    for (const method of documentationMethods) {
      expect(method.example, method.name).toContain('void solve()');
      expect(method.example, method.name).toContain('using ll = long long;');
      expect(method.example.endsWith(`${CPP_MAIN}\n`), method.name).toBe(true);
      expect(method.example.indexOf('#include "visualizer.h"')).toBeLessThan(method.example.indexOf('#define endl'));
    }
  });
});
