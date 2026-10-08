package runner

import (
	"os/exec"
	"strings"
	"testing"

	"github.com/MiguelFazioAssuncao/runspect.v1/internal/domain"
)

const headerPath = "../../pkg/visualizer/visualizer.h"

func newRunner(t *testing.T) *CppRunner {
	t.Helper()
	for _, tool := range []string{"g++", "bwrap", "prlimit"} {
		if _, err := exec.LookPath(tool); err != nil {
			t.Skipf("%s não encontrado", tool)
		}
	}
	return NewCppRunner(headerPath)
}

func firstMessage(t *testing.T, res domain.ExecutionResult) string {
	t.Helper()
	if !res.Success {
		t.Fatalf("esperava sucesso, erro: %s", res.Errors)
	}
	for _, step := range res.Steps {
		if step.StepEvent == "PRINT" {
			message, _ := step.Data["message"].(string)
			return message
		}
	}
	t.Fatal("nenhum PRINT emitido")
	return ""
}

func TestRunEmitsGraphEvents(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`#include <bits/stdc++.h>
#include "visualizer.h"
int main() {
    viz::add_node(1, "a");
    viz::add_node(2, "b");
    viz::add_edge(1, 2, 0);
    viz::set_weight(1, 2, 7);
    viz::remove_edge(1, 2);
    viz::remove_node(2);
    viz::reset_colors();
}`, "")
	if !res.Success {
		t.Fatalf("esperava sucesso, erro: %s", res.Errors)
	}

	want := []string{"ADD_NODE", "ADD_NODE", "ADD_EDGE", "SET_WEIGHT", "REMOVE_EDGE", "REMOVE_NODE", "RESET_COLORS"}
	if len(res.Steps) != len(want) {
		t.Fatalf("esperava %d eventos, veio %d", len(want), len(res.Steps))
	}
	for i, w := range want {
		if res.Steps[i].StepEvent != w {
			t.Errorf("passo %d: esperava %s, veio %s", i, w, res.Steps[i].StepEvent)
		}
	}
	if got := res.Steps[3].Data["weight"]; got != float64(7) {
		t.Errorf("SET_WEIGHT weight = %v, esperava 7", got)
	}
	if got := res.Steps[2].Data["weight"]; got != float64(0) {
		t.Errorf("ADD_EDGE weight = %v, esperava 0", got)
	}
}

func TestRunPreservesCallSiteLineInsideLambda(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`#include <bits/stdc++.h>
#include "visualizer.h"
int main() {
    auto emit = []() {
        viz::add_node(1, "lambda");
    };
    emit();
}`, "")
	if !res.Success {
		t.Fatalf("esperava sucesso, erro: %s", res.Errors)
	}
	if len(res.Steps) != 1 {
		t.Fatalf("esperava 1 evento, veio %d", len(res.Steps))
	}
	if got := res.Steps[0].Data["line"]; got != float64(5) {
		t.Errorf("line = %v, esperava 5", got)
	}
}

func TestRunNewFlagsAndMatrix(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`#include <bits/stdc++.h>
#include "visualizer.h"
int main() {
    viz::set_weighted(false);
    viz::set_multigraph(true);
    viz::show_matrix("m", std::vector<std::vector<int>>{{1, 2}, {3, 4}});
}`, "")
	if !res.Success {
		t.Fatalf("esperava sucesso, erro: %s", res.Errors)
	}
	if len(res.Steps) != 3 {
		t.Fatalf("esperava 3 eventos, veio %d", len(res.Steps))
	}
	if got := res.Steps[0].Data["weighted"]; got != false {
		t.Errorf("weighted = %v, esperava false", got)
	}
	if got := res.Steps[1].Data["multi"]; got != true {
		t.Errorf("multi = %v, esperava true", got)
	}
	rows, ok := res.Steps[2].Data["rows"].([]any)
	if !ok || len(rows) != 2 {
		t.Fatalf("rows inválido: %v", res.Steps[2].Data["rows"])
	}
}

func TestRunAnnotationEvents(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`#include <bits/stdc++.h>
#include "visualizer.h"
int main() {
    viz::add_node(1, "a");
    viz::add_node(2, "b");
    viz::add_edge(1, 2, 3);
    viz::set_badge(1, "d=\"0\"");
    viz::set_edge_style(1, 2, "dashed");
    viz::set_edge_label(1, 2, "3/10");
    viz::step("legenda\nlinha");
}`, "")
	if !res.Success {
		t.Fatalf("esperava sucesso, erro: %s", res.Errors)
	}
	want := []string{"ADD_NODE", "ADD_NODE", "ADD_EDGE", "SET_BADGE", "SET_EDGE_STYLE", "SET_EDGE_LABEL", "STEP"}
	if len(res.Steps) != len(want) {
		t.Fatalf("esperava %d eventos, veio %d", len(want), len(res.Steps))
	}
	for i, w := range want {
		if res.Steps[i].StepEvent != w {
			t.Errorf("passo %d: esperava %s, veio %s", i, w, res.Steps[i].StepEvent)
		}
	}
	if got := res.Steps[3].Data["text"]; got != "d=\"0\"" {
		t.Errorf("badge text = %q", got)
	}
	if got := res.Steps[4].Data["style"]; got != "dashed" {
		t.Errorf("style = %v", got)
	}
	if got := res.Steps[5].Data["label"]; got != "3/10" {
		t.Errorf("label = %v", got)
	}
	if got := res.Steps[6].Data["caption"]; got != "legenda\nlinha" {
		t.Errorf("caption = %q", got)
	}
}

func TestRunEscapesLabels(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`#include <bits/stdc++.h>
#include "visualizer.h"
int main() {
    viz::add_node(1, "a\"b\nc");
}`, "")
	if !res.Success {
		t.Fatalf("esperava sucesso, erro: %s", res.Errors)
	}
	if got := res.Steps[0].Data["label"]; got != "a\"b\nc" {
		t.Errorf("label = %q", got)
	}
}

func TestRunLargeLine(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`#include <bits/stdc++.h>
#include "visualizer.h"
int main() {
    std::vector<int> v(30000, 123456);
    viz::show("grande", v);
}`, "")
	if !res.Success {
		t.Fatalf("esperava sucesso, erro: %s", res.Errors)
	}
	items, ok := res.Steps[0].Data["items"].([]any)
	if !ok || len(items) != 30000 {
		t.Fatalf("items inválido")
	}
}

func TestRunCompileError(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`int main() { return x; }`, "")
	if res.Success {
		t.Fatal("esperava falha de compilação")
	}
	if strings.TrimSpace(res.Errors) == "" {
		t.Error("esperava mensagem de erro")
	}
}

func TestRunTimeout(t *testing.T) {
	if testing.Short() {
		t.Skip("teste lento")
	}
	r := newRunner(t)
	res := r.Run(`int main() { while (true) {} }`, "")
	if res.Success {
		t.Fatal("esperava falha por timeout")
	}
	if !strings.Contains(res.Errors, "TLE") {
		t.Errorf("esperava TLE, veio: %s", res.Errors)
	}
}

func TestRunReadsStdin(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`#include <bits/stdc++.h>
#include "visualizer.h"
int main() {
    int a, b;
    std::cin >> a >> b;
    viz::print(std::to_string(a + b));
}`, "2 3\n")
	if got := firstMessage(t, res); got != "5" {
		t.Errorf("soma = %s, esperava 5", got)
	}
}

func TestRunEmptyStdinGivesEOF(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`#include <bits/stdc++.h>
#include "visualizer.h"
int main() {
    int a;
    viz::print(std::cin >> a ? "leu" : "eof");
}`, "")
	if got := firstMessage(t, res); got != "eof" {
		t.Errorf("leitura = %s, esperava eof", got)
	}
}

func TestRunIgnoresPlainCout(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`#include <bits/stdc++.h>
#include "visualizer.h"
int main() {
    std::cout << "texto solto" << std::endl;
    viz::print("ok");
}`, "")
	if got := firstMessage(t, res); got != "ok" {
		t.Errorf("mensagem = %s", got)
	}
	if len(res.Steps) != 1 {
		t.Errorf("esperava 1 evento, veio %d", len(res.Steps))
	}
}

func TestSandboxHidesHostFiles(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`#include <bits/stdc++.h>
#include "visualizer.h"
int main() {
    std::ifstream f("/etc/passwd");
    viz::print(f.is_open() ? "visivel" : "oculto");
}`, "")
	if got := firstMessage(t, res); got != "oculto" {
		t.Errorf("/etc/passwd = %s, esperava oculto", got)
	}
}

func TestSandboxBlocksIncludeOfHostFile(t *testing.T) {
	r := newRunner(t)
	res := r.Run("#include \"/etc/passwd\"\nint main() {}", "")
	if res.Success {
		t.Fatal("esperava falha de compilação")
	}
	if strings.Contains(res.Errors, "root:") {
		t.Errorf("conteúdo do host vazou: %s", res.Errors)
	}
}

func TestSandboxBlocksNetwork(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`#include <bits/stdc++.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include "visualizer.h"
int main() {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    sockaddr_in a{};
    a.sin_family = AF_INET;
    a.sin_port = htons(53);
    inet_pton(AF_INET, "1.1.1.1", &a.sin_addr);
    int r = connect(fd, (sockaddr*)&a, sizeof(a));
    viz::print(r == 0 ? "conectou" : "bloqueado");
}`, "")
	if got := firstMessage(t, res); got != "bloqueado" {
		t.Errorf("rede = %s, esperava bloqueado", got)
	}
}

func TestSandboxBlocksFork(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`#include <bits/stdc++.h>
#include <unistd.h>
#include <sys/wait.h>
#include "visualizer.h"
int main() {
    pid_t p = fork();
    if (p == 0) _exit(0);
    viz::print(p < 0 ? "bloqueado" : "fork ok");
    if (p > 0) waitpid(p, nullptr, 0);
}`, "")
	if got := firstMessage(t, res); got != "bloqueado" {
		t.Errorf("fork = %s, esperava bloqueado", got)
	}
}

func TestMemoryLimit(t *testing.T) {
	r := newRunner(t)
	res := r.Run(`#include <bits/stdc++.h>
#include "visualizer.h"
int main() {
    volatile size_t n = 3ULL << 30;
    char* p = (char*)malloc(n);
    if (!p) {
        viz::print("falhou");
        return 0;
    }
    memset(p, 1, n);
    viz::print((int)p[n - 1]);
}`, "")
	if got := firstMessage(t, res); got != "falhou" {
		t.Errorf("alocação = %s, esperava falhou", got)
	}
}

func TestOutputFloodIsCapped(t *testing.T) {
	r := newRunner(t)
	r.MaxEvents = 1000
	res := r.Run(`#include <bits/stdc++.h>
#include "visualizer.h"
int main() {
    for (;;) viz::print(1);
}`, "")
	if res.Success {
		t.Fatal("esperava falha por excesso de eventos")
	}
	if !strings.Contains(res.Errors, "Limite") {
		t.Errorf("mensagem inesperada: %s", res.Errors)
	}
	if len(res.Steps) != 1000 {
		t.Errorf("esperava 1000 eventos, veio %d", len(res.Steps))
	}
}