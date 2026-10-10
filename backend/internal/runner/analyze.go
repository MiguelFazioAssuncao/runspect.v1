package runner

import (
	"context"
	"os"
	"path/filepath"
)

type AnalysisResult struct {
	Success      bool     `json:"success"`
	Capabilities []string `json:"capabilities"`
	Errors       string   `json:"errors,omitempty"`
}

// Analyze uses the same sandbox and AST as instrumentation, without compiling
// or executing the submitted program. The original source remains untouched.
func (r *CppRunner) Analyze(ctx context.Context, code string) AnalysisResult {
	result := AnalysisResult{Capabilities: []string{}}
	if message := r.checkTools(); message != "" {
		result.Errors = message
		return result
	}
	dir, err := os.MkdirTemp("", "runspect-analysis-*")
	if err != nil {
		result.Errors = "Falha ao preparar a análise do código"
		return result
	}
	defer os.RemoveAll(dir)
	header, err := os.ReadFile(r.HeaderPath)
	if err != nil {
		result.Errors = "Header visualizer.h não encontrado"
		return result
	}
	if err := os.WriteFile(filepath.Join(dir, "visualizer.h"), header, 0644); err != nil {
		result.Errors = "Falha ao preparar o header visualizer.h"
		return result
	}
	if err := os.WriteFile(filepath.Join(dir, "solution.cpp"), []byte(code), 0644); err != nil {
		result.Errors = "Falha ao preparar o código para análise"
		return result
	}
	trace, message := r.instrumentSource(ctx, dir, code, true)
	if message != "" {
		result.Errors = message
		return result
	}
	result.Success = true
	if trace.Capabilities != nil {
		result.Capabilities = trace.Capabilities
	}
	return result
}
