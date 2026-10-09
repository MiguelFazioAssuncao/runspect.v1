package runner

import (
	"strings"
	"testing"

	"github.com/MiguelFazioAssuncao/runspect.v1/internal/domain"
)

func hasStructureItems(res domain.ExecutionResult, name string, want ...string) bool {
	for _, step := range res.Steps {
		if step.StepEvent != "SET_STRUCT" || step.Data["name"] != name {
			continue
		}
		items, _ := step.Data["items"].([]any)
		if len(items) != len(want) {
			continue
		}
		match := true
		for i, value := range want {
			match = match && items[i] == value
		}
		if match {
			return true
		}
	}
	return false
}

func TestAutomaticTupleOptionalAndBits(t *testing.T) {
	res := newRunner(t).Run(`#include <bits/stdc++.h>
using namespace std;
int main() {
 tuple<int,string,optional<int>> registro{3, "início", nullopt};
 optional<int> resposta;
 bitset<8> flags(5);
 get<0>(registro) = 7;
 get<2>(registro) = 11;
 resposta = 42;
 flags.set(1);
 resposta.reset();
 tuple<> vazio;
 vector<tuple<int,string>> registros{{1,"um"},{2,"dois"}};
 cout << get<0>(registro) << ':' << flags.to_ulong() << ':' << resposta.has_value();
}`, "")
	if !res.Success || res.TraceMode != "automatic" || res.Output != "7:7:0" {
		t.Fatalf("mode=%s output=%q error=%s warnings=%v", res.TraceMode, res.Output, res.Errors, res.TraceWarnings)
	}
	for _, tc := range []struct {
		name  string
		items []string
	}{
		{"registro", []string{"0 = 3", "1 = início", "2 = sem valor"}},
		{"registro", []string{"0 = 7", "1 = início", "2 = valor = 11"}},
		{"resposta", []string{"valor = 42"}},
		{"resposta", []string{"sem valor"}},
		{"vazio", []string{}},
		{"registros", []string{"(0 = 1, 1 = um)", "(0 = 2, 1 = dois)"}},
	} {
		if !hasStructureItems(res, tc.name, tc.items...) {
			t.Errorf("estado ausente em %s: %v", tc.name, tc.items)
		}
	}
	initialized, changed := false, false
	for _, step := range res.Steps {
		if step.Data["name"] != "flags" {
			continue
		}
		if step.StepEvent == "VECTOR_INIT" {
			values, _ := step.Data["values"].([]any)
			initialized = len(values) == 8 && values[0] == float64(1) && values[1] == float64(0) && values[2] == float64(1)
		}
		changed = changed || step.StepEvent == "VECTOR_SET" && step.Data["index"] == float64(1) && step.Data["value"] == float64(1)
	}
	if !initialized || !changed {
		t.Fatalf("bits: initialized=%v changed=%v", initialized, changed)
	}
}

func TestAutomaticNewTypesNeverCopyCustomObjectsOrReadTupleReferences(t *testing.T) {
	res := newRunner(t).Run(`#include <bits/stdc++.h>
using namespace std;
struct SemCopia {
 int valor;
 SemCopia() : valor(9) {}
 SemCopia(const SemCopia&) = delete;
};
int main() {
 optional<SemCopia> objeto(in_place);
 tuple<unique_ptr<int>, int> registro{make_unique<int>(4), 6};
 int nao_inicializado;
 tuple<int&> referencia(nao_inicializado);
 tuple<volatile int> dispositivo{4};
 bitset<0> vazio;
 bitset<300> grande;
 grande.set(299);
 cout << objeto->valor << ':' << *get<0>(registro) << ':' << grande.count();
}`, "")
	if !res.Success || res.TraceMode != "automatic" || res.Output != "9:4:1" {
		t.Fatalf("mode=%s output=%q error=%s warnings=%v", res.TraceMode, res.Output, res.Errors, res.TraceWarnings)
	}
	if !hasStructureItems(res, "referencia", "0 = referência não expandida") {
		t.Fatal("referência não inicializada foi expandida")
	}
	if !hasStructureItems(res, "objeto", "valor = tipo não expandido") {
		t.Fatal("objeto personalizado deveria permanecer opaco")
	}
	if !hasStructureItems(res, "dispositivo", "0 = valor volatile não expandido") {
		t.Fatal("elemento volatile deveria permanecer opaco")
	}
	limited := false
	for _, step := range res.Steps {
		if step.StepEvent == "VECTOR_INIT" && step.Data["name"] == "grande" {
			values, _ := step.Data["values"].([]any)
			if len(values) != 256 {
				t.Fatalf("bits excedem limite: %d", len(values))
			}
		}
		message, _ := step.Data["message"].(string)
		limited = limited || strings.Contains(message, "256 elementos")
	}
	if !limited {
		t.Fatal("não informou limite de bits")
	}
}

func TestAutomaticSwitchPreservesBranchesAndSingleEvaluation(t *testing.T) {
	code := `#include <bits/stdc++.h>
using namespace std;
int main() {
 int escolha = 0; cin >> escolha;
 vector<int> valores{0,0,0};
 switch (int incremento=2; escolha++) {
 case 0:
 case 1: valores[0] += incremento; [[fallthrough]];
 case 2: {
   int local; local=5;
   valores[1] = local;
   switch(local) { case 5: valores[2]=9; break; default: valores[2]=-1; }
   break;
 }
 default: valores[0]=-3; break;
 }
 cout << escolha << ':' << valores[0] << ':' << valores[1] << ':' << valores[2];
}`
	for _, tc := range []struct{ input, want string }{
		{"0", "1:2:5:9"}, {"1", "2:2:5:9"}, {"2", "3:0:5:9"}, {"8", "9:-3:0:0"},
	} {
		t.Run(tc.input, func(t *testing.T) {
			res := newRunner(t).Run(code, tc.input)
			if !res.Success || res.TraceMode != "automatic" || res.Output != tc.want {
				t.Fatalf("mode=%s output=%q error=%s warnings=%v", res.TraceMode, res.Output, res.Errors, res.TraceWarnings)
			}
			changed, selected := false, false
			for _, step := range res.Steps {
				changed = changed || step.StepEvent == "VECTOR_SET" && step.Data["name"] == "valores"
				caption, _ := step.Data["caption"].(string)
				selected = selected || strings.HasPrefix(caption, "Caso ")
			}
			if !changed || !selected {
				t.Fatalf("switch sem passos internos: changed=%v selected=%v", changed, selected)
			}
		})
	}
}

func TestAutomaticSwitchDoesNotIntroduceInitializationAcrossCaseJumps(t *testing.T) {
	for _, input := range []string{"0", "1"} {
		res := newRunner(t).Run(`#include <iostream>
int main() {
 int escolha=0; std::cin >> escolha;
 switch(escolha) {
 case 0: int ignorado; ignorado=7; [[fallthrough]];
 case 1: std::cout << "ok"; break;
 }
 for(int i=0;i<2;i++) switch(i) case 0: continue;
}`, input)
		if !res.Success || res.TraceMode != "automatic" || res.Output != "ok" {
			t.Fatalf("input=%s mode=%s output=%q error=%s warnings=%v", input, res.TraceMode, res.Output, res.Errors, res.TraceWarnings)
		}
		for _, step := range res.Steps {
			if step.StepEvent == "SET_STRUCT" && step.Data["name"] == "Variáveis" {
				items, _ := step.Data["items"].([]any)
				for _, item := range items {
					if strings.Contains(item.(string), "ignorado =") {
						t.Fatal("observou escalar cuja declaração pode ser saltada")
					}
				}
			}
		}
	}
}
