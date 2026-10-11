package runner

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/MiguelFazioAssuncao/runspect.v1/internal/domain"
)

func TestCompileResourcesAggregateAttemptsAndRejectIncompleteReports(t *testing.T) {
	path := filepath.Join(t.TempDir(), "resources.json")
	metrics := &domain.ExecutionMetrics{CompileResourcesComplete: true}
	for _, data := range []string{
		`{"cpu_ms":240.5,"max_rss_kb":100000,"resources_complete":true}`,
		`{"cpu_ms":130.25,"max_rss_kb":90000,"resources_complete":true}`,
	} {
		if err := os.WriteFile(path, []byte(data), 0600); err != nil {
			t.Fatal(err)
		}
		readCompileResources(path, metrics)
	}
	if !metrics.CompileResourcesComplete || metrics.CompileCPUMs != 370.75 || metrics.CompileMaxRSSKB != 100000 {
		t.Fatalf("incorrect aggregation: %+v", metrics)
	}
	for _, data := range []string{`{`, `{}`, `{"cpu_ms":-1,"max_rss_kb":5}`, `{"cpu_ms":1,"max_rss_kb":0}`, `{"cpu_ms":1e999,"max_rss_kb":5}`} {
		if err := os.WriteFile(path, []byte(data), 0600); err != nil {
			t.Fatal(err)
		}
		readCompileResources(path, metrics)
		if metrics.CompileResourcesComplete || metrics.CompileCPUMs != 370.75 || metrics.CompileMaxRSSKB != 100000 {
			t.Fatalf("invalid report altered resources: %+v", metrics)
		}
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	readCompileResources(path, metrics)
	if metrics.CompileResourcesComplete {
		t.Fatal("missing report marked complete")
	}
}

func TestCompileResourcesStayIncompleteAfterSignaledAttempt(t *testing.T) {
	path := filepath.Join(t.TempDir(), "resources.json")
	metrics := &domain.ExecutionMetrics{CompileResourcesComplete: true}
	for _, data := range []string{
		`{"cpu_ms":100,"max_rss_kb":90000,"resources_complete":false}`,
		`{"cpu_ms":200,"max_rss_kb":80000,"resources_complete":true}`,
	} {
		if err := os.WriteFile(path, []byte(data), 0600); err != nil {
			t.Fatal(err)
		}
		readCompileResources(path, metrics)
	}
	if metrics.CompileResourcesComplete || metrics.CompileCPUMs != 300 || metrics.CompileMaxRSSKB != 90000 {
		t.Fatalf("fallback cleared incomplete resource marker: %+v", metrics)
	}
}

func TestSandboxCompileResourcesMeasureCompilerRatherThanOuterSupervisor(t *testing.T) {
	r := newRunner(t)
	result := r.Run(`#include "visualizer.h"
int main() { viz::print("measured"); }`, "")
	if !result.Success {
		t.Fatal(result.Errors)
	}
	m := result.Metrics
	// Parsing these standard C++ headers exceeds the tiny resource use of
	// bwrap's outer supervisor. The thresholds leave ample hardware margin.
	if !m.CompileResourcesComplete || m.CompileCPUMs < 20 || m.CompileMaxRSSKB < 20*1024 {
		t.Fatalf("compiler child resources lost through PID namespace: %+v", m)
	}
}

func TestLegacyRuntimeWithoutResourceHelperStillCompilesManualCode(t *testing.T) {
	r := trustedMetricsRunner(t)
	header, err := os.ReadFile(r.HeaderPath)
	if err != nil {
		t.Fatal(err)
	}
	r.HeaderPath = filepath.Join(t.TempDir(), "visualizer.h")
	if err := os.WriteFile(r.HeaderPath, header, 0600); err != nil {
		t.Fatal(err)
	}
	result := r.Run(`#include "visualizer.h"
int main() { viz::print("legacy"); }`, "")
	if !result.Success || result.TraceMode != "manual" || firstMessage(t, result) != "legacy" || result.Metrics.CompileResourcesComplete {
		t.Fatalf("missing optional helper prevented legacy compilation: %+v", result)
	}
}
