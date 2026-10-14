package runner

import (
	"context"
	"os"
	"path/filepath"
	"time"
)

type AnalysisResult struct {
	Success      bool     `json:"success"`
	Capabilities []string `json:"capabilities"`
	Errors       string   `json:"errors,omitempty"`
	TimeMs       float64  `json:"time_ms"`
	CacheHit     bool     `json:"cache_hit"`
}

// Analyze uses the same sandbox and AST as instrumentation, without compiling
// or executing the submitted program. The original source remains untouched.
func (r *CppRunner) Analyze(ctx context.Context, code string) (result AnalysisResult) {
	start := time.Now()
	defer func() { result.TimeMs = float64(time.Since(start)) / float64(time.Millisecond) }()
	result.Capabilities = []string{}
	if ctx.Err() != nil {
		result.Errors = analysisContextError(ctx)
		return result
	}
	if message := r.checkTools(); message != "" {
		result.Errors = message
		return result
	}
	header, err := os.ReadFile(r.HeaderPath)
	if err != nil {
		result.Errors = "Header visualizer.h não encontrado"
		return result
	}
	var key [32]byte
	if r.AnalysisCacheMaxEntries > 0 {
		key = r.cacheKey(code, header)
		if cached, ok := r.analysisCache.get(key, r.AnalysisCacheMaxEntries); ok {
			cached.CacheHit = true
			return cached
		}
		// AST instrumentation and analysis report capabilities from the same
		// original source. Explicit manual instrumentation skips the AST and
		// has nil capabilities, so it must still be analyzed here.
		if compiled, ok := r.cache.get(key, r.CacheMaxBytes); r.CacheMaxEntries > 0 && ok && compiled.trace.Capabilities != nil && (compiled.trace.Mode == "automatic" || compiled.trace.Mode == "manual") {
			result.Success = true
			result.Capabilities = cloneCapabilities(compiled.trace.Capabilities)
			result.CacheHit = true
			r.analysisCache.put(key, result, r.AnalysisCacheMaxEntries)
			return result
		}
	}
	dir, err := os.MkdirTemp("", "runspect-analysis-*")
	if err != nil {
		result.Errors = "Falha ao preparar a análise do código"
		return result
	}
	defer os.RemoveAll(dir)
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
	if ctx.Err() != nil {
		result.Errors = analysisContextError(ctx)
		return result
	}
	result.Success = true
	if trace.Capabilities != nil {
		result.Capabilities = cloneCapabilities(trace.Capabilities)
	}
	r.analysisCache.put(key, result, r.AnalysisCacheMaxEntries)
	return result
}

func analysisContextError(ctx context.Context) string {
	if ctx.Err() == context.DeadlineExceeded {
		return "Tempo de análise automática excedido"
	}
	return "Análise cancelada"
}
