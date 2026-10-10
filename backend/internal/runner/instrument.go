package runner

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type instrumentation struct {
	Mode         string   `json:"mode"`
	Warnings     []string `json:"warnings"`
	Capabilities []string `json:"capabilities"`
}

func compilerCachePath() string {
	path := os.Getenv("RUNSPECT_CPP_CACHE")
	if path == "" {
		return ""
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return ""
	}
	return absolute
}

func clangRuntimePath(headerPath string) string {
	if path := os.Getenv("RUNSPECT_CLANG_RUNTIME"); path != "" {
		absolute, err := filepath.Abs(path)
		if err == nil {
			return absolute
		}
		return path
	}
	path := filepath.Join(filepath.Dir(headerPath), "..", "..", ".runtime", "clang")
	if _, err := os.Stat(filepath.Join(path, "usr/lib/python3/dist-packages/clang/cindex.py")); err == nil {
		absolute, err := filepath.Abs(path)
		if err == nil {
			return absolute
		}
	}
	return ""
}

// Legacy annotated programs can keep running without installing the optional
// compiler frontend. The AST also detects unqualified calls and aliases.
func explicitlyInstrumented(code string) bool {
	tokens := cppTokens(code)
	methods := map[string]bool{}
	for _, name := range strings.Fields("set_directed set_weighted set_multigraph add_node add_edge remove_node remove_edge set_weight highlight highlight_edge highlight_path set_label set_color reset_colors set_badge set_edge_style set_edge_label step print show show_matrix vector_init vector_compare vector_swap vector_set vector_mark vector_range vector_discard vector_probe vector_pivot vector_reset vector_step vector_result graph_node_state graph_edge_state graph_value graph_component graph_path graph_reset") {
		methods[name] = true
	}
	for i := 0; i+3 < len(tokens); i++ {
		if tokens[i] == "viz" && tokens[i+1] == "::" && methods[tokens[i+2]] && tokens[i+3] == "(" {
			return true
		}
	}
	return false
}

// This lexer only finds explicit API calls; source transformation is performed
// by the compiler AST. Strings and comments must never select manual mode.
func cppTokens(code string) []string {
	var tokens []string
	for i := 0; i < len(code); {
		if strings.HasPrefix(code[i:], "//") {
			end := strings.IndexByte(code[i:], '\n')
			if end < 0 {
				break
			}
			i += end + 1
			continue
		}
		if strings.HasPrefix(code[i:], "/*") {
			end := strings.Index(code[i+2:], "*/")
			if end < 0 {
				break
			}
			i += end + 4
			continue
		}
		if strings.HasPrefix(code[i:], `R"`) {
			open := strings.IndexByte(code[i+2:], '(')
			if open >= 0 && open <= 16 {
				delimiter := code[i+2 : i+2+open]
				closing := ")" + delimiter + `"`
				end := strings.Index(code[i+3+open:], closing)
				if end < 0 {
					break
				}
				i += 3 + open + end + len(closing)
				continue
			}
		}
		if code[i] == '\'' && i > 0 && i+1 < len(code) && code[i-1] >= '0' && code[i-1] <= '9' && (code[i+1] >= '0' && code[i+1] <= '9' || code[i+1] >= 'a' && code[i+1] <= 'f' || code[i+1] >= 'A' && code[i+1] <= 'F') {
			i++
			continue
		}
		if code[i] == '"' || code[i] == '\'' {
			quote := code[i]
			i++
			for i < len(code) {
				if code[i] == '\\' {
					i += 2
				} else if code[i] == quote {
					i++
					break
				} else {
					i++
				}
			}
			continue
		}
		if code[i] == ' ' || code[i] == '\t' || code[i] == '\r' || code[i] == '\n' {
			i++
			continue
		}
		if strings.HasPrefix(code[i:], "::") {
			tokens = append(tokens, "::")
			i += 2
			continue
		}
		start := i
		if code[i] == '_' || code[i] >= 'a' && code[i] <= 'z' || code[i] >= 'A' && code[i] <= 'Z' {
			i++
			for i < len(code) && (code[i] == '_' || code[i] >= 'a' && code[i] <= 'z' || code[i] >= 'A' && code[i] <= 'Z' || code[i] >= '0' && code[i] <= '9') {
				i++
			}
		} else {
			i++
		}
		tokens = append(tokens, code[start:i])
	}
	return tokens
}

func (r *CppRunner) instrument(dir, code string) (instrumentation, string) {
	return r.instrumentSource(context.Background(), dir, code, false)
}

func (r *CppRunner) instrumentSource(parent context.Context, dir, code string, analyzeOnly bool) (instrumentation, string) {
	if !analyzeOnly && explicitlyInstrumented(code) {
		return instrumentation{Mode: "manual"}, ""
	}
	for _, name := range []string{"automatic.h", "instrument_cpp.py"} {
		data, err := os.ReadFile(filepath.Join(filepath.Dir(r.HeaderPath), name))
		if err != nil {
			return instrumentation{}, "Arquivos da visualização automática não encontrados"
		}
		if err := os.WriteFile(filepath.Join(dir, name), data, 0644); err != nil {
			return instrumentation{}, "Falha ao preparar a visualização automática"
		}
	}
	ctx, cancel := context.WithTimeout(parent, r.AnalysisTimeout)
	defer cancel()
	base := r.baseDir(dir)
	args := []string{"python3", "-B", base + "/instrument_cpp.py", base + "/solution.cpp"}
	if analyzeOnly {
		args = append(args, "--analyze-only")
	}
	if r.CompilerCachePath != "" {
		args = append(args, "--cache", r.CompilerCachePath)
	}
	if r.ClangRuntimePath != "" {
		args = append(args, "--runtime", r.ClangRuntimePath)
	}
	argv := r.wrap(dir, true, r.compileLimits(), args)
	// Analysis has a separate wall-clock and CPU budget from GCC compilation.
	for i, arg := range argv {
		if strings.HasPrefix(arg, "--cpu=") {
			argv[i] = fmt.Sprintf("--cpu=%d", int(r.AnalysisTimeout.Seconds())+2)
		}
	}
	if r.Sandbox && r.ClangRuntimePath != "" {
		// Only trusted compiler dependencies are exposed, during analysis only.
		// Keep trusted dependency paths identical to those embedded in a PCH.
		argv = append(argv[:1], append([]string{"--ro-bind", r.ClangRuntimePath, r.ClangRuntimePath}, argv[1:]...)...)
	}
	cmd := r.command(ctx, dir, argv)
	stdout := &limitedBuffer{max: 64 << 10}
	stderr := &limitedBuffer{max: r.MaxStderrBytes}
	cmd.Stdout, cmd.Stderr = stdout, stderr
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return instrumentation{}, "Tempo de análise automática excedido"
		}
		return instrumentation{}, fmt.Sprintf("Falha na análise automática (%v):\n%s", err, stderr.String())
	}
	var result instrumentation
	if err := json.Unmarshal([]byte(stdout.String()), &result); err != nil || (result.Mode != "manual" && result.Mode != "automatic") {
		return instrumentation{}, "Resposta inválida da análise automática"
	}
	return result, ""
}
