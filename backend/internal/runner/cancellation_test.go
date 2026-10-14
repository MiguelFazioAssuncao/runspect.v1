package runner

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/MiguelFazioAssuncao/runspect.v1/internal/domain"
)

func TestCancelledRequestDoesNotStartCompilation(t *testing.T) {
	r := NewCppRunner("missing-header")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	result := r.RunWithContext(ctx, "int main() {}", "", domain.TraceOptions{})
	if result.Success || result.Errors != "Execução cancelada" || result.Metrics.CompileAttempts != 0 {
		t.Fatalf("unexpected cancellation result: %+v", result)
	}
}

func TestCancelledRequestStopsCachedProgram(t *testing.T) {
	r := trustedMetricsRunner(t)
	r.RunTimeout = 10 * time.Second
	code := "trusted cancellation fixture"
	header, err := os.ReadFile(r.HeaderPath)
	if err != nil {
		t.Fatal(err)
	}
	ready := filepath.Join(t.TempDir(), "ready")
	script := []byte("#!/usr/bin/python3\nimport os, time\nos.mkdir(" + strconv.Quote(ready) + ")\ntime.sleep(10)\n")
	r.cache.put(r.cacheKey(code, header), compiledProgram{binary: script, trace: instrumentation{Mode: "manual"}}, r.CacheMaxBytes, r.CacheMaxEntries)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	result := make(chan domain.ExecutionResult, 1)
	go func() { result <- r.RunWithContext(ctx, code, "", domain.TraceOptions{}) }()
	deadline := time.Now().Add(3 * time.Second)
	for {
		select {
		case res := <-result:
			t.Fatalf("program exited before cancellation: %+v", res)
		default:
		}
		if _, err := os.Stat(ready); err == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("program did not start")
		}
		time.Sleep(10 * time.Millisecond)
	}
	cancel()
	select {
	case res := <-result:
		if res.Success || res.Errors != "Execução cancelada" || !res.Metrics.CacheHit || res.Metrics.ExecuteTimeout {
			t.Fatalf("unexpected result: %+v", res)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("cancelled process remained running")
	}
}
