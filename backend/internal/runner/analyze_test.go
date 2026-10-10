package runner

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestAnalyzeDetectsSupportedSourceCapabilities(t *testing.T) {
	r := NewCppRunner(headerPath)
	// These trusted fixtures test the compiler frontend without host namespaces.
	r.Sandbox = false
	cases := []struct {
		name, code string
		want       []string
	}{
		{"output only", `#include <iostream>
int main() { std::cout << "hello"; }`, []string{"output"}},
		{"renamed vector and type alias", `#include <bits/stdc++.h>
using Data = std::vector<int>;
int main() { Data g{3,1,2}; std::sort(g.begin(),g.end()); }`, []string{"vectors"}},
		{"const containers", `#include <vector>
int main() { const std::vector<int> values{1,2}; }`, []string{"vectors"}},
		{"unsupported adapter items", `#include <queue>
struct Data { int value; }; int main() { std::queue<std::pair<int,Data>> tasks; }`, []string{}},
		{"matrix aliases", `#include <array>
using Row = std::array<int,2>; using Table = std::array<Row,2>;
int main() { Table dp{{Row{{0,1}},Row{{1,2}}}}; }`, []string{"matrices"}},
		{"arbitrary adjacency name", `#include <vector>
int main() { std::vector<std::vector<int>> roads(3); roads[0].push_back(1); }`, []string{"graph"}},
		{"scalars and queue", `#include <queue>
int main() { int value=4; std::queue<int> tasks; tasks.push(value); }`, []string{"structures"}},
		{"string adapter", `#include <queue>
#include <string>
int main() { std::queue<std::string> tasks; tasks.push("hello"); }`, []string{"structures"}},
		{"reachable recursion", `int recurse(int n) { return n ? recurse(n-1) : 0; }
int main() { return recurse(2); }`, []string{"calls", "structures"}},
		{"unused graph helper", `#include <vector>
void unused() { std::vector<std::vector<int>> graph(2); graph[0].push_back(1); }
int main() { std::vector<int> data{1,2}; }`, []string{"vectors"}},
		{"macros", `#include <vector>
#define DATA std::vector<int>
int main() { DATA values{1,2}; }`, []string{"vectors"}},
		{"manual namespace alias", `#include "visualizer.h"
namespace display = viz;
int main() { display::vector_init("values",std::vector<int>{1,2}); }`, []string{"vectors"}},
		{"comments and strings", `int main() {
// viz::add_node(1); std::vector<std::vector<int>> graph;
const char* text = R"tag(viz::add_node(1); std::vector<int> v;)tag";
}`, []string{}},
		{"unsupported objects", `#include <vector>
struct Data { int value; }; int main() { std::vector<Data> objects; }`, []string{}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res := r.Analyze(context.Background(), tc.code)
			if !res.Success || !reflect.DeepEqual(res.Capabilities, tc.want) {
				t.Fatalf("capabilities=%v want=%v error=%s", res.Capabilities, tc.want, res.Errors)
			}
		})
	}
}

func TestAnalyzeNeverExecutesCode(t *testing.T) {
	r := NewCppRunner(headerPath)
	r.Sandbox = false
	marker := filepath.Join(t.TempDir(), "executed.txt")
	code := `#include <fstream>
int main() { std::ofstream("` + marker + `") << "executed"; while (true) {} }`
	res := r.Analyze(context.Background(), code)
	if !res.Success {
		t.Fatal(res.Errors)
	}
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatal("analysis must not execute user code")
	}
}

func TestAnalyzeRejectsInvalidCode(t *testing.T) {
	r := NewCppRunner(headerPath)
	r.Sandbox = false
	res := r.Analyze(context.Background(), "int main() { invalid C++ }")
	if res.Success || res.Errors == "" || len(res.Capabilities) != 0 {
		t.Fatalf("invalid code returned usable capabilities: %+v", res)
	}
}
