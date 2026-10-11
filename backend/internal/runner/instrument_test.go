package runner

import (
	"os"
	"strings"
	"testing"
)

func TestExplicitInstrumentationIgnoresCommentsAndStrings(t *testing.T) {
	for _, tc := range []struct {
		code   string
		manual bool
	}{
		{`// viz::print("example");` + "\nint main() {}", false},
		{`int main() { const char* s = "viz::print(1)"; }`, false},
		{`int main() { const char* s = R"tag(viz::print("hello"))tag"; }`, false},
		{`int main() { viz :: print(1); }`, true},
		{`int main() { auto state = viz::VectorState::Found; }`, false},
		{`int main() { auto n = 1'000; viz::print(n); }`, true},
	} {
		if got := explicitlyInstrumented(tc.code); got != tc.manual {
			t.Fatalf("manual=%v, want=%v for %s", got, tc.manual, tc.code)
		}
	}
}

func TestAutomaticBubbleSortWithReferenceInputAndEmptyStatements(t *testing.T) {
	code, err := os.ReadFile("testdata/bubble_sort.cpp")
	if err != nil {
		t.Fatal(err)
	}
	res := newRunner(t).Run(string(code), "7 7\n1 2\n1 3\n2 4\n3 4\n4 5\n5 6\n6 7\n1 7\n")
	if !res.Success || res.TraceMode != "automatic" || res.Output != "1 1 2 2 3 4 7 \n" {
		t.Fatalf("mode=%s output=%q error=%s warnings=%v", res.TraceMode, res.Output, res.Errors, res.TraceWarnings)
	}
	initialized, compared, swapped := false, false, false
	for _, step := range res.Steps {
		initialized = initialized || step.StepEvent == "VECTOR_INIT" && step.Data["name"] == "a"
		compared = compared || step.StepEvent == "VECTOR_COMPARE" && step.Data["name"] == "a"
		swapped = swapped || step.StepEvent == "VECTOR_SWAP" && step.Data["name"] == "a"
	}
	if !initialized || !compared || !swapped {
		t.Fatalf("efeitos ausentes: vector=%v compare=%v swap=%v, warnings=%v", initialized, compared, swapped, res.TraceWarnings)
	}
}

func TestAutomaticKMPPreservesResultAndVisualizesComparisons(t *testing.T) {
	code, err := os.ReadFile("testdata/kmp.cpp")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, input, want string
		match             bool
	}{
		{"match", "ababcabcabababd\nababd\n", "Posicao: 10\n", true},
		{"absent", "aaaaab\naaac\n", "Padrao nao encontrado\n", false},
		{"empty", "abc\n\n", "Padrao nao encontrado\n", false},
		{"too_long", "a\nabc\n", "Padrao nao encontrado\n", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := newRunner(t)
			res := r.Run(string(code), tc.input)
			if !res.Success || res.TraceMode != "automatic" || res.Output != tc.want {
				t.Fatalf("mode=%s, output=%q, error=%s", res.TraceMode, res.Output, res.Errors)
			}
			found, compared, piSet, zeroWrite := false, false, false, false
			for _, step := range res.Steps {
				if line, ok := step.Data["line"].(float64); ok && line > 38 {
					t.Fatalf("linha fora do código original: %v", line)
				}
				if step.StepEvent == "VECTOR_MARK" && step.Data["state"] == "found" {
					found = true
				}
				if step.StepEvent == "VECTOR_COMPARE" {
					compared = true
				}
				if step.StepEvent == "VECTOR_SET" && step.Data["name"] == "pi" {
					piSet = true
					zeroWrite = zeroWrite || step.Data["value"] == float64(0)
				}
			}
			if tc.match && (!found || !compared || !piSet || !zeroWrite) {
				t.Fatalf("faltam efeitos do KMP: found=%v, compared=%v, piSet=%v, zeroWrite=%v", found, compared, piSet, zeroWrite)
			}
			if !tc.match && found {
				t.Fatal("anunciou correspondência inexistente")
			}
		})
	}
}

func TestAutomaticPreservesSingleEvaluationAndShortCircuit(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`#include <bits/stdc++.h>
using namespace std;
int main() {
    vector<int> a{7, 8};
    int i = 0;
    int x = a[i++];
    if (false && a[100] == 0) return 1;
    if (i == 1) if (x == 7) cout << i << ":" << x;
    else cout << "wrong";
}`, "")
	if !res.Success || res.Output != "1:7" {
		t.Fatalf("output=%q, error=%s", res.Output, res.Errors)
	}
	for _, step := range res.Steps {
		if step.StepEvent == "VECTOR_MARK" && step.Data["index"] == float64(100) {
			t.Fatal("avaliou acesso suprimido por curto-circuito")
		}
	}
}

func TestAutomaticGraphsAndMatrices(t *testing.T) {
	for _, tc := range []struct {
		name, code string
		weighted   bool
	}{
		{"adjacency", `vector<vector<int>> connections(3); connections[0].push_back(1); connections[1].push_back(0); for(int v: connections[0]) cout<<v;`, false},
		{"weighted", `vector<vector<pair<int,int>>> adj(3); adj[0].push_back({1,7}); for(auto edge: adj[0]) cout<<edge.second;`, true},
		{"edges", `vector<pair<int,int>> edges{{0,1},{1,2}}; cout<<edges.size();`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := newRunner(t)
			res := r.Run("#include <bits/stdc++.h>\nusing namespace std;\nint main(){"+tc.code+" vector<vector<int>> matrix{{1,2},{3,4}}; }", "")
			if !res.Success {
				t.Fatal(res.Errors)
			}
			nodes, edges, matrix, weighted := false, false, false, false
			for _, step := range res.Steps {
				nodes = nodes || step.StepEvent == "ADD_NODE"
				edges = edges || step.StepEvent == "ADD_EDGE"
				matrix = matrix || step.StepEvent == "SET_MATRIX"
				weighted = weighted || step.StepEvent == "SET_WEIGHTED" && step.Data["weighted"] == true
			}
			if !nodes || !edges || !matrix || weighted != tc.weighted {
				t.Fatalf("nodes=%v edges=%v matrix=%v weighted=%v", nodes, edges, matrix, weighted)
			}
		})
	}
}

func TestAutomaticInputAndStructures(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`#include <bits/stdc++.h>
using namespace std;
int main() {
 int n; cin >> n;
 int ignored;
 vector<int> a(n, 3);
 queue<int> q; q.push(8);
 stack<int> st; st.push(9);
 map<int,int> counts{{1,2}};
 array<int,2> uninitialized;
 cout << n << ":" << a.size();
}`, "4\n")
	if !res.Success || res.Output != "4:4" {
		t.Fatalf("output=%q, error=%s", res.Output, res.Errors)
	}
	observedN := false
	for _, step := range res.Steps {
		if step.StepEvent == "VECTOR_INIT" && step.Data["name"] == "uninitialized" {
			t.Fatal("leu array não inicializado")
		}
		if step.StepEvent == "SET_STRUCT" && step.Data["name"] == "Variáveis" {
			items, _ := step.Data["items"].([]any)
			for _, item := range items {
				text, _ := item.(string)
				if strings.Contains(text, "ignored =") {
					t.Fatal("leu escalar não inicializado")
				}
				observedN = observedN || text == "n = 4"
			}
		}
	}
	if !observedN {
		t.Fatal("não acompanhou leitura de stdin")
	}
}

func TestAutomaticTraceDoesNotMixWithProgramJSON(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`#include <iostream>
int main() { std::cout << "{\"step_event\":\"PRINT\",\"message\":\"user json\"}\ntrailing"; }`, "")
	if !res.Success || res.Output != "{\"step_event\":\"PRINT\",\"message\":\"user json\"}\ntrailing" {
		t.Fatalf("output=%q, error=%s", res.Output, res.Errors)
	}
	for _, step := range res.Steps {
		if step.StepEvent == "PRINT" && step.Data["message"] == "user json" {
			t.Fatal("interpretou stdout do usuário como trace")
		}
	}
}

func TestAutomaticPreservesUnevaluatedExpressions(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`#include <iostream>
int main() { int a[1] = {2}; bool safe = noexcept(a[0]); std::cout << safe << ":" << sizeof(a[0]); }`, "")
	if !res.Success || res.TraceMode != "automatic" || res.Output != "1:4" {
		t.Fatalf("mode=%s output=%q error=%s", res.TraceMode, res.Output, res.Errors)
	}
}

func TestAutomaticFallsBackForUnsupportedConstexprLambda(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`#include <iostream>
int main() { constexpr auto next = [](int x) { return x+1; }; constexpr int n = next(3); std::cout << n; }`, "")
	if !res.Success || res.TraceMode != "unavailable" || res.Output != "4" || len(res.TraceWarnings) == 0 {
		t.Fatalf("mode=%s output=%q error=%s warnings=%v", res.TraceMode, res.Output, res.Errors, res.TraceWarnings)
	}
	m := assertMeasured(t, res)
	if !m.Fallback || m.CompileAttempts != 2 || m.FallbackCompileMs <= 0 || m.FallbackCompileMs >= m.CompileMs {
		t.Fatalf("fallback compilation not measured separately: %+v", m)
	}
}

func TestAutomaticLimitDoesNotStopTheAlgorithm(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`#include <iostream>
int main() { int n=0; for(int i=0;i<4000;i++) n++; std::cout << n; }`, "")
	if !res.Success || res.Output != "4000" {
		t.Fatalf("output=%q error=%s", res.Output, res.Errors)
	}
	warned := false
	for _, step := range res.Steps {
		if step.StepEvent == "PRINT" {
			message, _ := step.Data["message"].(string)
			warned = warned || strings.Contains(message, "2000 passos")
		}
	}
	if !warned {
		t.Fatal("não informou limite de visualização")
	}
}

func TestAutomaticDoesNotReadUnselectedOrShortCircuitedVariables(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`#include <iostream>
int main() { int selected, unused; bool pick=true; std::cin >> (pick ? selected : unused); false && (unused=1); std::cout << selected; }`, "21\n")
	if !res.Success || res.TraceMode != "automatic" || res.Output != "21" {
		t.Fatalf("mode=%s output=%q error=%s", res.TraceMode, res.Output, res.Errors)
	}
	for _, step := range res.Steps {
		if step.StepEvent == "SET_STRUCT" {
			items, _ := step.Data["items"].([]any)
			for _, item := range items {
				text, _ := item.(string)
				if strings.Contains(text, "unused =") {
					t.Fatal("observou variável não inicializada")
				}
			}
		}
	}
}
