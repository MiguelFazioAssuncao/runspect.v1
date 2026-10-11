package runner

import (
	"github.com/MiguelFazioAssuncao/runspect.v1/internal/domain"
	"strings"
	"testing"
)

func TestTraceOptionsApplyOnCachedExecution(t *testing.T) {
	r := newRunner(t)
	code := `#include <iostream>
#include <vector>
int main() { std::vector<int> values(300, 7); for(int i=0;i<20;++i) values[0]=i; std::cout << values.size() << ':' << values[0]; }`
	limited := r.RunWithOptions(code, "", domain.TraceOptions{MaxSteps: 5, MaxItems: 2})
	expanded := r.RunWithOptions(code, "", domain.TraceOptions{MaxSteps: 200, MaxItems: 512})
	for _, result := range []domain.ExecutionResult{limited, expanded} {
		if !result.Success || result.TraceMode != "automatic" || result.Output != "300:19" {
			t.Fatalf("execution: %+v", result)
		}
	}
	if limited.TraceLimits.MaxItems != 2 || expanded.TraceLimits.MaxItems != 512 {
		t.Fatal("reported limits mismatch")
	}
	if expanded.Metrics == nil || !expanded.Metrics.CacheHit {
		t.Fatal("changing capture limits should reuse compilation")
	}
	if len(expanded.Steps) <= len(limited.Steps) {
		t.Fatal("expanded execution should capture more frames")
	}
	items := 0
	for _, step := range expanded.Steps {
		if step.StepEvent == "VECTOR_INIT" && step.Data["name"] == "values" {
			values, _ := step.Data["values"].([]any)
			items = len(values)
		}
	}
	if items != 300 {
		t.Fatalf("expanded items=%d", items)
	}
	found := false
	for _, step := range limited.Steps {
		text, _ := step.Data["message"].(string)
		found = found || strings.Contains(text, "5 passos")
	}
	if !found {
		t.Fatal("capture limit should be communicated in the trace")
	}
}
