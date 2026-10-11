package runner

import (
	"crypto/sha256"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestCompiledCacheEvictsLeastRecentlyUsedWithinLimits(t *testing.T) {
	var cache compiledCache
	a, b, c := sha256.Sum256([]byte("a")), sha256.Sum256([]byte("b")), sha256.Sum256([]byte("c"))
	program := compiledProgram{binary: []byte("1234"), trace: instrumentation{Mode: "automatic"}}
	cache.put(a, program, 8, 8)
	cache.put(b, program, 8, 8)
	if _, ok := cache.get(a, 8); !ok {
		t.Fatal("missing cached program")
	}
	cache.put(c, program, 8, 8)
	if _, ok := cache.get(b, 8); ok {
		t.Fatal("did not evict least recently used program")
	}
	if _, ok := cache.get(a, 8); !ok {
		t.Fatal("evicted recently used program")
	}
	if cache.bytes != 8 {
		t.Fatalf("cache bytes = %d", cache.bytes)
	}
	cache.put(a, compiledProgram{binary: []byte("12")}, 8, 8)
	if cache.bytes != 6 {
		t.Fatalf("replacement bytes = %d", cache.bytes)
	}
	cache.put(b, compiledProgram{binary: make([]byte, 9)}, 8, 8)
	if _, ok := cache.get(b, 8); ok {
		t.Fatal("stored oversized binary")
	}
	if _, ok := cache.get(a, 0); ok {
		t.Fatal("disabled cache returned a binary")
	}
	for i := 0; i < 10; i++ {
		cache.put(sha256.Sum256([]byte{byte(i)}), program, 1000, 8)
	}
	if cache.order.Len() != 8 {
		t.Fatalf("entries = %d", cache.order.Len())
	}
}

func TestCompiledCacheKeyIncludesInstrumentation(t *testing.T) {
	dir := t.TempDir()
	r := NewCppRunner(filepath.Join(dir, "visualizer.h"))
	before := r.cacheKey("int main() {}", []byte("header"))
	if before == r.cacheKey("int main() {return 1;}", []byte("header")) {
		t.Fatal("source did not invalidate cache")
	}
	if before == r.cacheKey("int main() {}", []byte("other header")) {
		t.Fatal("header did not invalidate cache")
	}
	if err := os.WriteFile(filepath.Join(dir, "instrument_cpp.py"), []byte("new instrumenter"), 0600); err != nil {
		t.Fatal(err)
	}
	if before == r.cacheKey("int main() {}", []byte("header")) {
		t.Fatal("instrumenter did not invalidate cache")
	}
}

func TestCompiledCacheRetainsWorkingSetBeyondEightPrograms(t *testing.T) {
	var cache compiledCache
	for i := 0; i < 12; i++ {
		cache.put(sha256.Sum256([]byte{byte(i)}), compiledProgram{binary: []byte("binary")}, 1024, 64)
	}
	for i := 0; i < 12; i++ {
		if _, ok := cache.get(sha256.Sum256([]byte{byte(i)}), 1024); !ok {
			t.Fatalf("program %d unnecessarily evicted", i)
		}
	}
	entries, bytes, evictions := cache.stats()
	if entries != 12 || bytes != 72 || evictions != 0 {
		t.Fatalf("stats = %d/%d/%d", entries, bytes, evictions)
	}
	cache.put(sha256.Sum256([]byte("new")), compiledProgram{binary: []byte("binary")}, 1024, 4)
	entries, _, evictions = cache.stats()
	if entries != 4 || evictions != 9 {
		t.Fatalf("entry limit not applied: entries=%d evictions=%d", entries, evictions)
	}
	cache.put(sha256.Sum256([]byte("disabled")), compiledProgram{binary: []byte("binary")}, 1024, 0)
	if _, ok := cache.get(sha256.Sum256([]byte("disabled")), 1024); ok {
		t.Fatal("stored binary with cache disabled by entry count")
	}
}

func TestAutomaticDeployBubbleSortReusesBinaryWithNewInput(t *testing.T) {
	code, err := os.ReadFile("testdata/deploy_bubble_sort.cpp")
	if err != nil {
		t.Fatal(err)
	}
	r := newRunner(t)
	res := r.Run(string(code), "7\n9 5 1 8 3 6 2\n")
	if !res.Success || res.TraceMode != "automatic" || res.Output != "1 2 3 5 6 8 9\n" || len(res.TraceWarnings) != 0 {
		t.Fatalf("mode=%s output=%q error=%s warnings=%v", res.TraceMode, res.Output, res.Errors, res.TraceWarnings)
	}
	compared, swapped := false, false
	for _, step := range res.Steps {
		compared = compared || step.StepEvent == "VECTOR_COMPARE"
		swapped = swapped || step.StepEvent == "VECTOR_SWAP"
	}
	if !compared || !swapped {
		t.Fatal("missing bubble sort comparisons/swaps")
	}
	t.Logf("first run: %d ms", res.TimeMs)
	// Impossible compilation budgets prove that the second request reused the
	// binary, while a different input proves it did not reuse stdout or events.
	r.CompileTimeout, r.AnalysisTimeout = time.Nanosecond, time.Nanosecond
	res = r.Run(string(code), "3\n4 -1 4\n")
	if !res.Success || res.TraceMode != "automatic" || res.Output != "-1 4 4\n" || len(res.Steps) == 0 {
		t.Fatalf("mode=%s output=%q error=%s", res.TraceMode, res.Output, res.Errors)
	}
	t.Logf("cached run with new stdin: %d ms", res.TimeMs)
}

func TestAutomaticCorruptCompilerCacheFallsBackToNormalAnalysis(t *testing.T) {
	r := newRunner(t)
	r.CompilerCachePath = t.TempDir()
	if err := os.WriteFile(filepath.Join(r.CompilerCachePath, "stdlib.pch"), []byte("invalid PCH"), 0600); err != nil {
		t.Fatal(err)
	}
	res := r.Run("#include <bits/stdc++.h>\nint main(){std::vector<int> a{3,1}; std::cout << a[1];}", "")
	if !res.Success || res.TraceMode != "automatic" || strings.TrimSpace(res.Output) != "1" {
		t.Fatalf("mode=%s output=%q error=%s warnings=%v", res.TraceMode, res.Output, res.Errors, res.TraceWarnings)
	}
}
