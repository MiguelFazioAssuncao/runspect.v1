import { describe, expect, it } from 'vitest';
import { convertToPureCpp } from './codeConversion';

describe('code conversion', () => {
  it('removes visualizer dependency and preserves standard output', () => {
    const result = convertToPureCpp(`#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;
int main() {
    viz::add_node(1, "A");
    viz::set_color(1, "emerald");
    viz::print("resultado");
}`);

    expect(result).not.toContain('visualizer.h');
    expect(result).not.toContain('viz::');
    expect(result).toContain('cout << ("resultado") << "\\n";');
  });

  it('converts step output and keeps algorithm code', () => {
    const result = convertToPureCpp('int answer = 42; viz::step("fim");');
    expect(result).toContain('int answer = 42;');
    expect(result).toContain('cout << ("fim") << "\\n";');
  });
});
