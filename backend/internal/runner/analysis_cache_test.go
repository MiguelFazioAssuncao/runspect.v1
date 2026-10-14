package runner

import (
	"context"
	"crypto/sha256"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"testing"
	"time"
)

func TestAnalysisCacheEvictsLeastRecentlyUsedAndHonorsChangedLimits(t *testing.T) {
	var cache analysisCache
	a, b, c := sha256.Sum256([]byte("a")), sha256.Sum256([]byte("b")), sha256.Sum256([]byte("c"))
	result := AnalysisResult{Success: true, Capabilities: []string{"vectors"}}
	cache.put(a, result, 2)
	cache.put(b, result, 2)
	if _, ok := cache.get(a, 2); !ok {
		t.Fatal("missing cached analysis")
	}
	cache.put(c, result, 2)
	if _, ok := cache.get(b, 2); ok {
		t.Fatal("did not evict least recently used analysis")
	}
	cache.put(a, AnalysisResult{Success: true, Capabilities: []string{"graph"}}, 2)
	if got, ok := cache.get(a, 1); !ok || !reflect.DeepEqual(got.Capabilities, []string{"graph"}) {
		t.Fatalf("replacement missing after reducing limit: %+v %v", got, ok)
	}
	if cache.order.Len() != 1 {
		t.Fatalf("entries after reducing limit = %d", cache.order.Len())
	}
	for _, limit := range []int{0, -1} {
		cache.put(a, result, limit)
		if _, ok := cache.get(a, limit); ok || cache.order.Len() != 0 {
			t.Fatalf("disabled cache retained results with limit %d", limit)
		}
	}
}

func TestAnalysisCacheCopiesCapabilitiesAndStoresOnlySuccess(t *testing.T) {
	var cache analysisCache
	key := sha256.Sum256([]byte("source"))
	result := AnalysisResult{Success: true, Capabilities: []string{"vectors"}, TimeMs: 120, CacheHit: true}
	cache.put(key, result, 2)
	result.Capabilities[0] = "changed input"
	got, ok := cache.get(key, 2)
	if !ok || !reflect.DeepEqual(got.Capabilities, []string{"vectors"}) || got.TimeMs != 0 || got.CacheHit {
		t.Fatalf("cache did not isolate stored analysis: %+v %v", got, ok)
	}
	got.Capabilities[0] = "changed output"
	again, _ := cache.get(key, 2)
	if !reflect.DeepEqual(again.Capabilities, []string{"vectors"}) {
		t.Fatal("caller mutated cached capabilities")
	}
	failed := sha256.Sum256([]byte("invalid"))
	cache.put(failed, AnalysisResult{Errors: "invalid source"}, 2)
	if _, ok := cache.get(failed, 2); ok {
		t.Fatal("stored failed analysis")
	}
	empty := sha256.Sum256([]byte("empty"))
	cache.put(empty, AnalysisResult{Success: true, Capabilities: []string{}}, 2)
	if got, ok := cache.get(empty, 2); !ok || got.Capabilities == nil {
		t.Fatal("empty capabilities must serialize as an array")
	}
}

func TestAnalysisCacheConcurrentRequestsKeepCapabilitiesIsolated(t *testing.T) {
	var cache analysisCache
	var requests sync.WaitGroup
	for worker := 0; worker < 8; worker++ {
		requests.Add(1)
		go func() {
			defer requests.Done()
			for i := 0; i < 100; i++ {
				key := sha256.Sum256([]byte{byte(i % 16)})
				cache.put(key, AnalysisResult{Success: true, Capabilities: []string{"vectors"}}, 16)
				if res, ok := cache.get(key, 16); ok {
					if !reflect.DeepEqual(res.Capabilities, []string{"vectors"}) {
						t.Errorf("concurrent caller mutated cache: %v", res.Capabilities)
					}
					res.Capabilities[0] = "caller mutation"
				}
			}
		}()
	}
	requests.Wait()
	if cache.order.Len() > 16 {
		t.Fatalf("concurrent cache exceeded entry limit: %d", cache.order.Len())
	}
}

func TestAnalyzeCacheReuseAndInvalidation(t *testing.T) {
	// Trusted fixtures exercise the compiler frontend without host namespaces.
	r := NewCppRunner(headerPath)
	r.Sandbox = false
	originalRuntime := r.ClangRuntimePath
	dir := t.TempDir()
	files := make(map[string][]byte)
	for _, name := range []string{"visualizer.h", "automatic.h", "instrument_cpp.py"} {
		data, err := os.ReadFile(filepath.Join(filepath.Dir(headerPath), name))
		if err != nil {
			t.Fatal(err)
		}
		files[name] = data
		if err := os.WriteFile(filepath.Join(dir, name), data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	r.HeaderPath, r.ClangRuntimePath = filepath.Join(dir, "visualizer.h"), originalRuntime
	code := "#include <vector>\nint main() { std::vector<int> values{1,2}; }"
	cold := r.Analyze(context.Background(), code)
	if !cold.Success || cold.CacheHit || cold.TimeMs <= 0 || !reflect.DeepEqual(cold.Capabilities, []string{"vectors"}) {
		t.Fatalf("cold analysis: %+v", cold)
	}
	cold.Capabilities[0] = "changed"
	// An expired frontend budget proves that a successful second request did
	// not invoke the AST, without relying on machine-dependent timing ratios.
	r.AnalysisTimeout = time.Nanosecond
	warm := r.Analyze(context.Background(), code)
	if !warm.Success || !warm.CacheHit || warm.TimeMs <= 0 || !reflect.DeepEqual(warm.Capabilities, []string{"vectors"}) {
		t.Fatalf("cached analysis: %+v", warm)
	}
	warm.Capabilities[0] = "changed again"
	if again := r.Analyze(context.Background(), code); !reflect.DeepEqual(again.Capabilities, []string{"vectors"}) {
		t.Fatal("cached response was mutated")
	}
	t.Run("changed source", func(t *testing.T) {
		res := r.Analyze(context.Background(), code+"\n// new source")
		if res.Success || res.CacheHit || res.TimeMs <= 0 {
			t.Fatalf("source did not invalidate analysis: %+v", res)
		}
	})
	for _, name := range []string{"visualizer.h", "automatic.h", "instrument_cpp.py"} {
		t.Run(name, func(t *testing.T) {
			path := filepath.Join(dir, name)
			changed := append(append([]byte{}, files[name]...), []byte("\n")...)
			if err := os.WriteFile(path, changed, 0600); err != nil {
				t.Fatal(err)
			}
			defer func() {
				if err := os.WriteFile(path, files[name], 0600); err != nil {
					t.Fatal(err)
				}
			}()
			if res := r.Analyze(context.Background(), code); res.Success || res.CacheHit {
				t.Fatalf("%s did not invalidate analysis: %+v", name, res)
			}
		})
	}
	r.AnalysisCacheMaxEntries = 0
	if res := r.Analyze(context.Background(), code); res.Success || res.CacheHit {
		t.Fatalf("disabled cache still reused analysis: %+v", res)
	}
}

func TestAnalyzeReusesCompiledCapabilitiesWithDefensiveCopy(t *testing.T) {
	r := NewCppRunner(headerPath)
	r.Sandbox = false
	r.AnalysisTimeout = time.Nanosecond
	code := "#include <vector>\nint main() { std::vector<int> values{1,2}; }"
	header, err := os.ReadFile(headerPath)
	if err != nil {
		t.Fatal(err)
	}
	key := r.cacheKey(code, header)
	r.cache.put(key, compiledProgram{binary: []byte("cached binary"), trace: instrumentation{Mode: "automatic", Capabilities: []string{"vectors"}}}, r.CacheMaxBytes, r.CacheMaxEntries)
	res := r.Analyze(context.Background(), code)
	if !res.Success || !res.CacheHit || !reflect.DeepEqual(res.Capabilities, []string{"vectors"}) {
		t.Fatalf("compiled capabilities were not reused: %+v", res)
	}
	res.Capabilities[0] = "changed"
	compiled, _ := r.cache.get(key, r.CacheMaxBytes)
	if !reflect.DeepEqual(compiled.trace.Capabilities, []string{"vectors"}) {
		t.Fatal("analysis caller mutated compiled metadata")
	}
	r.AnalysisCacheMaxEntries = 0
	if disabled := r.Analyze(context.Background(), code); disabled.Success || disabled.CacheHit {
		t.Fatalf("disabled analysis cache reused compiled metadata: %+v", disabled)
	}
}

func TestAnalyzeManualCompiledTraceStillRequiresAST(t *testing.T) {
	r := NewCppRunner(headerPath)
	r.Sandbox = false
	code := "#include \"visualizer.h\"\nint main() { viz::vector_init(\"values\",std::vector<int>{1,2}); }"
	header, err := os.ReadFile(headerPath)
	if err != nil {
		t.Fatal(err)
	}
	r.cache.put(r.cacheKey(code, header), compiledProgram{binary: []byte("cached manual binary"), trace: instrumentation{Mode: "manual"}}, r.CacheMaxBytes, r.CacheMaxEntries)
	res := r.Analyze(context.Background(), code)
	if !res.Success || res.CacheHit || !reflect.DeepEqual(res.Capabilities, []string{"vectors"}) {
		t.Fatalf("manual trace without AST capabilities bypassed analysis: %+v", res)
	}
}

func TestAnalyzeDoesNotCacheFailuresOrReturnCacheForCanceledContext(t *testing.T) {
	r := NewCppRunner(headerPath)
	r.Sandbox = false
	for i := 0; i < 2; i++ {
		res := r.Analyze(context.Background(), "int main() { invalid C++ }")
		if res.Success || res.CacheHit || res.Errors == "" || res.TimeMs <= 0 || r.analysisCache.order.Len() != 0 {
			t.Fatalf("invalid source retained analysis: %+v", res)
		}
	}
	code := "int main() {}"
	header, err := os.ReadFile(headerPath)
	if err != nil {
		t.Fatal(err)
	}
	r.analysisCache.put(r.cacheKey(code, header), AnalysisResult{Success: true, Capabilities: []string{}}, r.AnalysisCacheMaxEntries)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	res := r.Analyze(ctx, code)
	if res.Success || res.CacheHit || res.Errors != "Análise cancelada" || res.TimeMs <= 0 {
		t.Fatalf("canceled analysis returned cache: %+v", res)
	}
}
