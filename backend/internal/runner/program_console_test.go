package runner

import (
	"os"
	"strings"
	"testing"
)

func TestAutomaticPrefixQueriesOutputAndMissingInput(t *testing.T) {
	code, err := os.ReadFile("testdata/prefix_queries.cpp")
	if err != nil {
		t.Fatal(err)
	}
	r := newRunner(t)
	input := "4\n1 12\n2 8\n3 25\n4 20\n"
	complete := r.Run(string(code), input+"4\n1\n2\n3\n4\n")
	if !complete.Success || complete.TraceMode != "automatic" || complete.Output != "VENDA\nVENDA\nVENDA\nVENDA\n" || len(complete.TraceWarnings) != 0 {
		t.Fatalf("resultado=%+v", complete)
	}
	var visualOutput strings.Builder
	outputEvents := 0
	for _, step := range complete.Steps {
		if step.StepEvent == "PROGRAM_OUTPUT" {
			visualOutput.WriteString(step.Data["text"].(string))
			outputEvents++
			if step.Data["line"] != float64(31) {
				t.Fatalf("saída fora da linha cout: %+v", step)
			}
		}
	}
	if visualOutput.String() != complete.Output || outputEvents != 4 {
		t.Fatalf("saída não foi dividida pelas consultas: output=%q eventos=%d", visualOutput.String(), outputEvents)
	}
	missing := r.Run(string(code), input) // Same cached binary, current stdin.
	if missing.Success || missing.TraceMode != "automatic" || !strings.Contains(missing.Errors, "Entrada insuficiente na linha 23") || missing.Output != "" {
		t.Fatalf("entrada incompleta não diagnosticada: errors=%s warnings=%v", missing.Errors, missing.TraceWarnings)
	}
	for _, step := range missing.Steps {
		if step.StepEvent == "VECTOR_RESULT" {
			t.Fatal("executou até a conclusão após erro de entrada")
		}
	}
	for _, query := range []string{"0", "5"} {
		outOfRange := r.Run(string(code), input+"1\n"+query+"\n")
		if outOfRange.Success || outOfRange.Output != "" || !strings.Contains(outOfRange.Errors, "Índice fora dos limites") {
			t.Fatalf("consulta inválida %s executou: output=%q error=%s", query, outOfRange.Output, outOfRange.Errors)
		}
	}
	recovered := r.Run(string(code), "3\n5 1\n0 4\n0 2\n3\n1\n2\n3\n")
	if !recovered.Success || recovered.Output != "COMPRA\nNEUTRO\nVENDA\n" || len(recovered.TraceWarnings) != 0 {
		t.Fatalf("nova entrada reutilizou saída ou avisos antigos: output=%q errors=%s warnings=%v", recovered.Output, recovered.Errors, recovered.TraceWarnings)
	}
}

func TestAutomaticInputErrorsStopExecution(t *testing.T) {
	for _, tc := range []struct{ name, code, input, want, inputError string }{
		{"missing", "int q = 7; std::cin >> q; std::cout << q;", "", "", "Entrada insuficiente"},
		{"invalid", "int q = 7; std::cin >> q; std::cout << std::cin.fail();", "wrong", "", "Entrada inválida"},
		{"partial", "std::cout << \"before\\n\"; int a,b; std::cin >> a >> b; std::cout << \"after\";", "1", "before\n", "Entrada insuficiente"},
		{"valid_last_token", "int q; std::cin >> q; std::cout << q;", "4", "4", ""},
		{"handled_eof", "int q; while (std::cin >> q) std::cout << q;", "1 2", "12", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res := newRunner(t).Run("#include <iostream>\nint main() {"+tc.code+"}", tc.input)
			if res.Success != (tc.inputError == "") || res.TraceMode != "automatic" || res.Output != tc.want {
				t.Fatalf("output=%q error=%s", res.Output, res.Errors)
			}
			if tc.inputError == "" && res.Errors != "" {
				t.Fatalf("erro inesperado: %s", res.Errors)
			}
			if tc.inputError != "" && !strings.Contains(res.Errors, tc.inputError) {
				t.Fatalf("erro ausente: %s", res.Errors)
			}
		})
	}
}

func TestAutomaticOutputChunksPreserveFormatting(t *testing.T) {
	res := newRunner(t).Run(`#include <bits/stdc++.h>
int main() {
    std::cin.tie(nullptr)->sync_with_stdio(false);
    int i = 10;
    std::cout << std::hex << i++ << " ";
    std::cout << std::dec << std::setw(3) << i << "\n";
    std::cout.write("a\0b", 3);
}`, "")
	if !res.Success || res.TraceMode != "automatic" || res.Output != "a  11\na\x00b" {
		t.Fatalf("output=%q errors=%s", res.Output, res.Errors)
	}
	var chunks []string
	for _, step := range res.Steps {
		if step.StepEvent == "PROGRAM_OUTPUT" {
			chunks = append(chunks, step.Data["text"].(string))
		}
	}
	if len(chunks) != 3 || chunks[0] != "a " || chunks[1] != " 11\n" || chunks[2] != "a\x00b" {
		t.Fatalf("formatação alterada ou saída duplicada: %q", chunks)
	}
}
