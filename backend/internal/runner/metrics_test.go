package runner

import (
	"os/exec"
	"testing"
	"time"

	"github.com/MiguelFazioAssuncao/runspect.v1/internal/domain"
)

func trustedMetricsRunner(t *testing.T) *CppRunner {
	t.Helper()
	if _, err := exec.LookPath("g++"); err != nil {
		t.Skip("g++ unavailable")
	}
	r := NewCppRunner(headerPath)
	// Only fixed, trusted fixtures run without namespaces in these tests.
	r.Sandbox = false
	return r
}

func assertMeasured(t *testing.T, result domain.ExecutionResult) *domain.ExecutionMetrics {
	t.Helper()
	m := result.Metrics
	if m == nil || m.TotalMs <= 0 || m.PrepareMs <= 0 || result.TimeMs != int64(m.TotalMs) {
		t.Fatalf("missing total/preparation metrics: %+v", result)
	}
	if m.TotalMs < m.PrepareMs+m.AnalysisMs+m.CompileMs+m.ExecuteMs {
		t.Fatalf("stage durations exceed total: %+v", m)
	}
	return m
}

func TestExecutionMetricsSeparateCompilationFromCachedExecution(t *testing.T) {
	r := trustedMetricsRunner(t)
	code := `#include "visualizer.h"
int main() { int n; std::cin >> n; viz::print(std::to_string(n)); }`
	first := r.Run(code, "7")
	if !first.Success {
		t.Fatal(first.Errors)
	}
	m := assertMeasured(t, first)
	if m.CacheHit || m.CompileAttempts != 1 || m.CompileMs <= 0 || m.ExecuteMs <= 0 || m.CompileCPUMs <= 0 || m.CompileMaxRSSKB <= 0 || !m.CompileResourcesComplete || m.CacheEntries != 1 || m.CacheBytes <= 0 {
		t.Fatalf("incorrect cold metrics: %+v", m)
	}
	r.CompileTimeout, r.AnalysisTimeout = time.Nanosecond, time.Nanosecond
	second := r.Run(code, "42")
	if !second.Success || firstMessage(t, second) != "42" {
		t.Fatalf("cached execution lost current input: %+v", second)
	}
	m = assertMeasured(t, second)
	if !m.CacheHit || m.CompileAttempts != 0 || m.AnalysisMs != 0 || m.CompileMs != 0 || m.CompileCPUMs != 0 || m.CompileMaxRSSKB != 0 || m.ExecuteMs <= 0 {
		t.Fatalf("incorrect cache-hit metrics: %+v", m)
	}
	r.CacheMaxEntries = 0
	disabled := r.Run(code, "7")
	if disabled.Success || disabled.Metrics.CacheHit || disabled.Metrics.CompileAttempts != 1 {
		t.Fatalf("entry limit zero must disable cache reads: %+v", disabled)
	}
	if disabled.Metrics.CompileResourcesComplete {
		t.Fatal("timed-out compiler resources must be marked incomplete")
	}
	if disabled.Metrics.CompileTimeouts != 1 || disabled.Metrics.FailedStage != "compile" {
		t.Fatalf("timeout classification missing: %+v", disabled.Metrics)
	}
}

func TestExecutionMetricsIncludeCompilationAndRuntimeFailures(t *testing.T) {
	r := trustedMetricsRunner(t)
	badCompile := r.Run(`#include "visualizer.h"
int main() { viz::print("hello"); invalid C++; }`, "")
	if badCompile.Success || badCompile.Errors == "" {
		t.Fatalf("expected compiler failure: %+v", badCompile)
	}
	m := assertMeasured(t, badCompile)
	if m.CompileAttempts != 1 || m.CompileMs <= 0 || m.ExecuteMs != 0 || m.CacheEntries != 0 || m.FailedStage != "compile" {
		t.Fatalf("incorrect compilation failure metrics: %+v", m)
	}
	badRun := r.Run(`#include "visualizer.h"
int main() { viz::print("hello"); return 1; }`, "")
	if badRun.Success || badRun.Errors == "" {
		t.Fatalf("expected runtime failure: %+v", badRun)
	}
	m = assertMeasured(t, badRun)
	if m.CompileAttempts != 1 || m.CompileMs <= 0 || m.ExecuteMs <= 0 || m.FailedStage != "execute" {
		t.Fatalf("incorrect runtime failure metrics: %+v", m)
	}
}

func TestExecutionMetricsClassifyRuntimeTimeout(t *testing.T) {
	r := trustedMetricsRunner(t)
	r.RunTimeout = 30 * time.Millisecond
	result := r.Run(`#include "visualizer.h"
int main() { viz::print("starting"); while(true) {} }`, "")
	if result.Success || !result.Metrics.ExecuteTimeout || result.Metrics.FailedStage != "execute" || result.Metrics.CompileTimeouts != 0 {
		t.Fatalf("runtime timeout not classified: %+v", result)
	}
}
