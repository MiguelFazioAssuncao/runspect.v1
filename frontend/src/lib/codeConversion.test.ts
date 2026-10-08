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

  it('removes step captions instead of printing them', () => {
    const result = convertToPureCpp('int answer = 42; viz::step("fim");');
    expect(result).toContain('int answer = 42;');
    expect(result).not.toContain('fim');
    expect(result).not.toContain('viz::');
  });

  it('removes vector api calls without changing algorithm code', () => {
    const result = convertToPureCpp(`#include "visualizer.h"
int main() {
    viz::vector_init("a", a);
    viz::vector_swap("a", i, j, "troca; (ok)");
    viz::vector_mark("a", i, viz::VectorState::Sorted);
    viz::vector_step("a");
    swap(a[i], a[j]);
}`);
    expect(result).not.toContain('viz::');
    expect(result).toContain('swap(a[i], a[j]);');
  });

  it('removes graph semantic calls', () => {
    const result = convertToPureCpp(`int main() {
    viz::graph_node_state(1, viz::NodeState::Visiting);
    viz::graph_edge_state(1, 2, viz::EdgeState::Tree);
    viz::graph_value(1, "d=0");
    viz::graph_component(1, 2);
    viz::graph_path(path);
    viz::graph_reset();
    int x = 1;
}`);
    expect(result).not.toContain('viz::');
    expect(result).toContain('int x = 1;');
  });

  it('keeps loop semantics when a removed call is a loop body', () => {
    const result = convertToPureCpp('for (int i = 0; i < n; i++) viz::add_node(i, "x");\nint k = 1;');
    expect(result).toContain('for (int i = 0; i < n; i++) ;');
    expect(result).toContain('int k = 1;');
  });

  it('keeps if semantics when a removed call is a branch', () => {
    const result = convertToPureCpp('if (x) viz::vector_set("a", 0, 1); else y = 2;');
    expect(result).toContain('if (x) ; else y = 2;');
  });

  it('handles semicolons and parentheses inside strings', () => {
    expect(convertToPureCpp('viz::print("a;b)");')).toContain('cout << ("a;b)") << "\\n";');
    expect(convertToPureCpp('viz::vector_step("a", "x;)(");\nint k = 1;')).not.toContain('x;');
  });

  it('rejects unknown viz methods instead of silently keeping them', () => {
    expect(() => convertToPureCpp('viz::inexistente(1);')).toThrow();
  });

  it('rejects viz usage outside the call pattern', () => {
    expect(() => convertToPureCpp('auto s = viz::VectorState::Sorted;')).toThrow();
  });
});