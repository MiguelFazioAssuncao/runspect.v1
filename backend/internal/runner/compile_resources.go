package runner

import (
	"encoding/json"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"

	"github.com/MiguelFazioAssuncao/runspect.v1/internal/domain"
)

// bwrap's outer PID supervisor does not propagate compiler child resource
// usage reliably. Measure g++ from inside the same namespace instead.
func (r *CppRunner) measureCompiler(dir string, args []string, attempt int) ([]string, string) {
	python, err := exec.LookPath("/usr/bin/python3")
	if err != nil {
		return args, ""
	}
	data, err := os.ReadFile(filepath.Join(filepath.Dir(r.HeaderPath), "measure_compile.py"))
	if err != nil {
		// Older local runtimes can still compile, without resource estimates.
		return args, ""
	}
	if err := os.WriteFile(filepath.Join(dir, "measure_compile.py"), data, 0600); err != nil {
		return args, ""
	}
	name := "compile-resources-" + strconv.Itoa(attempt) + ".json"
	base := r.baseDir(dir)
	measured := []string{python, "-B", base + "/measure_compile.py", base + "/" + name}
	return append(measured, args...), filepath.Join(dir, name)
}

func readCompileResources(path string, metrics *domain.ExecutionMetrics) {
	var report struct {
		CPUMs    *float64 `json:"cpu_ms"`
		MaxRSSKB *int64   `json:"max_rss_kb"`
		Complete *bool    `json:"resources_complete"`
	}
	data, err := os.ReadFile(path)
	if err != nil || json.Unmarshal(data, &report) != nil || report.CPUMs == nil || report.MaxRSSKB == nil || report.Complete == nil || *report.CPUMs < 0 || math.IsNaN(*report.CPUMs) || math.IsInf(*report.CPUMs, 0) || *report.MaxRSSKB <= 0 {
		metrics.CompileResourcesComplete = false
		return
	}
	metrics.CompileCPUMs += *report.CPUMs
	metrics.CompileMaxRSSKB = max(metrics.CompileMaxRSSKB, *report.MaxRSSKB)
	if !*report.Complete {
		metrics.CompileResourcesComplete = false
	}
}
