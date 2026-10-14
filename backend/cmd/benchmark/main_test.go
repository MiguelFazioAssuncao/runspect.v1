package main

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/MiguelFazioAssuncao/runspect.v1/internal/domain"
	"github.com/MiguelFazioAssuncao/runspect.v1/internal/runner"
)

func TestDescribeNearestRank(t *testing.T) {
	tests := []struct {
		name   string
		values []float64
		want   distribution
	}{
		{"empty", nil, distribution{}},
		{"single", []float64{.125}, distribution{Samples: 1, Min: .125, Mean: .125, P50: .125, P95: .125, P99: .125, Max: .125}},
		{"unsorted", []float64{5, 1, 4, 2, 3}, distribution{Samples: 5, Min: 1, Mean: 3, P50: 3, P95: 5, P99: 5, Max: 5}},
		{"even", []float64{4, 3, 2, 1}, distribution{Samples: 4, Min: 1, Mean: 2.5, P50: 2, P95: 4, P99: 4, Max: 4}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			original := append([]float64(nil), tt.values...)
			if got := describe(tt.values); got != tt.want {
				t.Fatalf("describe() = %+v; want %+v", got, tt.want)
			}
			for i := range original {
				if original[i] != tt.values[i] {
					t.Fatal("describe mutated the input observations")
				}
			}
		})
	}
	values := make([]float64, 100)
	for i := range values {
		values[i] = float64(i + 1)
	}
	got := describe(values)
	if got.P50 != 50 || got.P95 != 95 || got.P99 != 99 {
		t.Fatalf("100 samples: p50/p95/p99 = %v/%v/%v", got.P50, got.P95, got.P99)
	}
}

func TestSummaryPreservesFailuresAndExcludesInvalidLatency(t *testing.T) {
	samples := []sample{
		{Success: true, OutputValid: true, WallMs: .5, Metrics: &domain.ExecutionMetrics{TotalMs: .4, ExecuteMs: .3, CacheHit: true}},
		{Success: true, OutputValid: true, Fallback: true, Metrics: &domain.ExecutionMetrics{TotalMs: 12, CompileMs: 8, CompileAttempts: 2, CompileCPUMs: 6, CompileMaxRSSKB: 2048, CompileResourcesComplete: true}},
		{Success: false, Metrics: &domain.ExecutionMetrics{TotalMs: 1, CompileAttempts: 1}},
		{Success: true, OutputValid: false, Metrics: &domain.ExecutionMetrics{TotalMs: 2}},
		{Success: true, OutputValid: true}, // A missing metric must not become a zero latency.
	}
	got := summarize(samples)
	if got.Samples != 5 || got.Successes != 3 || got.Failures != 2 || got.OutputMismatches != 1 {
		t.Fatalf("incorrect success population: %+v", got)
	}
	if got.MetricsSamples != 4 || got.LatencySamples != 2 || got.SuccessRate != .6 || got.CacheHitRate != .25 || got.FallbackRate != .2 {
		t.Fatalf("incorrect rates or metric population: %+v", got)
	}
	if got.CompileAttemptsTotal != 3 || got.CompileAttemptsMax != 2 {
		t.Fatalf("compile attempts = %d / %d", got.CompileAttemptsTotal, got.CompileAttemptsMax)
	}
	if got.CompileResourcesIncomplete != 1 {
		t.Fatalf("incomplete compiler resources = %d", got.CompileResourcesIncomplete)
	}
	if latency := got.LatencyMs["total"]; latency.Samples != 2 || latency.Min != .4 || latency.Max != 12 {
		t.Fatalf("invalid samples contaminated latency: %+v", latency)
	}
	if resources := got.CompileCPUMs; resources.Samples != 1 || resources.P50 != 6 {
		t.Fatalf("cache hit or failure contaminated compiler resources: %+v", resources)
	}
	if resources := got.CompileMaxRSSKB; resources.Samples != 1 || resources.P99 != 2048 {
		t.Fatalf("incorrect RSS summary: %+v", resources)
	}
}

func TestIncompleteCompilerResourcesExcludedWithoutDroppingLatency(t *testing.T) {
	got := summarize([]sample{
		{Success: true, OutputValid: true, Metrics: &domain.ExecutionMetrics{TotalMs: 5, CompileAttempts: 2, CompileCPUMs: 1, CompileMaxRSSKB: 50, CompileResourcesComplete: false}},
		{Success: true, OutputValid: true, Metrics: &domain.ExecutionMetrics{TotalMs: 10, CompileAttempts: 1, CompileCPUMs: 8, CompileMaxRSSKB: 400, CompileResourcesComplete: true}},
	})
	if got.LatencySamples != 2 || got.CompileResourcesIncomplete != 1 || got.CompileCPUMs.Samples != 1 || got.CompileCPUMs.Min != 8 || got.CompileMaxRSSKB.Min != 400 {
		t.Fatalf("incomplete resources contaminated percentiles: %+v", got)
	}
}

func TestConfiguredRunnerUsesServerResourceEnvironment(t *testing.T) {
	t.Setenv("RUNSPECT_COMPILE_TIMEOUT_SEC", "30")
	t.Setenv("RUNSPECT_ANALYSIS_TIMEOUT_SEC", "45")
	t.Setenv("RUNSPECT_BINARY_CACHE_MB", "32")
	t.Setenv("RUNSPECT_BINARY_CACHE_ENTRIES", "96")
	t.Setenv("RUNSPECT_ANALYSIS_CACHE_ENTRIES", "0")
	t.Setenv("RUNSPECT_COMPILE_MEMORY_MB", "512")
	t.Setenv("RUNSPECT_MEMORY_MB", "128")
	t.Setenv("RUNSPECT_STACK_MB", "64")
	t.Setenv("RUNSPECT_MAX_EVENTS", "50000")
	t.Setenv("RUNSPECT_SANDBOX", "off")
	r := configuredRunner("unused.h")
	if r.CompileTimeout.Seconds() != 30 || r.AnalysisTimeout.Seconds() != 45 || r.CacheMaxBytes != 32<<20 || r.CacheMaxEntries != 96 || r.AnalysisCacheMaxEntries != 0 {
		t.Fatalf("timeouts/cache did not match server environment: %+v", r)
	}
	if r.CompileMemoryBytes != 512<<20 || r.MemoryBytes != 128<<20 || r.StackBytes != 64<<20 || r.MaxEvents != 50000 || !r.Sandbox {
		t.Fatalf("resource or sandbox settings = %+v", r)
	}
}

func TestEmptySummary(t *testing.T) {
	got := summarize(nil)
	if got.Samples != 0 || got.SuccessRate != 0 || got.CacheHitRate != 0 || got.LatencyMs["total"].Samples != 0 {
		t.Fatalf("empty summary = %+v", got)
	}
}

type fakeRunner struct {
	inputs  []string
	results map[string]string
}

func (r *fakeRunner) Run(code, stdin string) domain.ExecutionResult {
	r.inputs = append(r.inputs, stdin)
	return domain.ExecutionResult{
		Success: true, Output: r.results[stdin], TraceMode: "automatic",
		Metrics: &domain.ExecutionMetrics{TotalMs: float64(len(r.inputs)), CacheHit: len(r.inputs) > 1},
	}
}

func TestWarmupUsesDifferentInputAndIsExcludedFromSummary(t *testing.T) {
	fixture := fixture{Name: "test", Code: "trusted", Inputs: []fixtureInput{
		{Name: "first", Stdin: "a", Expected: "one"},
		{Name: "alternate", Stdin: "b", Expected: "two"},
	}}
	r := &fakeRunner{results: map[string]string{"a": "one", "b": "two"}}
	got := measureFixture(r, fixture, 3, true)
	if strings.Join(r.inputs, ",") != "b,a,b,a" {
		t.Fatalf("warmup/measurement inputs = %v", r.inputs)
	}
	if got.Warmup == nil || got.Warmup.Iteration != 0 || got.Warmup.Input != "alternate" {
		t.Fatalf("warmup = %+v", got.Warmup)
	}
	if got.Summary.Samples != 3 || got.Summary.CacheHits != 3 || got.Summary.LatencyMs["total"].Min != 2 {
		t.Fatalf("warmup contaminated summary: %+v", got.Summary)
	}
	for _, observation := range got.Samples {
		if !observation.OutputValid {
			t.Fatal("fresh input did not receive its expected output")
		}
	}
}

func TestIncorrectCachedOutputIsDetected(t *testing.T) {
	r := &fakeRunner{results: map[string]string{"new": "stale"}}
	got := measure(r, "trusted", fixtureInput{Name: "new", Stdin: "new", Expected: "fresh"}, 1)
	if !got.Success || got.OutputValid || !strings.Contains(got.Error, "saída incorreta") {
		t.Fatalf("stale cache output was accepted: %+v", got)
	}
}

type fakeAnalysisRunner struct {
	calls int
}

func (r *fakeAnalysisRunner) Analyze(ctx context.Context, code string) runner.AnalysisResult {
	r.calls++
	return runner.AnalysisResult{Success: true, TimeMs: float64(r.calls), CacheHit: r.calls > 1, Capabilities: []string{"vector"}}
}

func TestAnalysisWarmupExcludedFromLatencyAndHitRate(t *testing.T) {
	r := &fakeAnalysisRunner{}
	got := measureAnalysisFixture(r, fixture{Name: "test", Code: "trusted"}, 2, true)
	if r.calls != 3 || got.Warmup == nil || got.Warmup.CacheHit || got.Summary.Samples != 2 || got.Summary.CacheHitRate != 1 {
		t.Fatalf("analysis warmup/summary = %+v", got)
	}
	if got.Summary.LatencyMs.Min != 2 || got.Summary.LatencyMs.Max != 3 || got.Summary.LatencyMs.Samples != 2 {
		t.Fatalf("analysis warmup contaminated latency: %+v", got.Summary)
	}
}

func TestAnalysisSummaryDoesNotReportFailedRequestsAsFastSuccesses(t *testing.T) {
	got := summarizeAnalysis([]analysisSample{
		{Success: true, CacheHit: true, TimeMs: .25},
		{Success: false, TimeMs: .01},
	})
	if got.Successes != 1 || got.Failures != 1 || got.SuccessRate != .5 || got.CacheHitRate != .5 || got.LatencyMs.Samples != 1 || got.LatencyMs.P99 != .25 {
		t.Fatalf("analysis summary = %+v", got)
	}
}

func TestRejectsInvalidArgumentsBeforeBenchmark(t *testing.T) {
	for _, args := range [][]string{{"-iterations=0"}, {"-iterations=-1"}, {"untrusted.cpp"}} {
		t.Run(strings.Join(args, " "), func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			if err := run(args, &stdout, &stderr); err == nil {
				t.Fatal("expected argument validation error")
			}
			if stdout.Len() != 0 {
				t.Fatal("invalid command started a benchmark")
			}
		})
	}
}
