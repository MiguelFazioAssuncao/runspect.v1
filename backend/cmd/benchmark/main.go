// Command benchmark compares the runner's compilation paths using trusted
// repository fixtures. It never accepts submitted code or input files.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/MiguelFazioAssuncao/runspect.v1/internal/domain"
	"github.com/MiguelFazioAssuncao/runspect.v1/internal/runner"
)

type options struct {
	Iterations    int
	Header        string
	CompilerCache string
	Sandbox       bool
	Output        string
}

type fixtureInput struct {
	Name     string `json:"name"`
	Stdin    string `json:"stdin"`
	Expected string `json:"expected_output"`
}

type fixture struct {
	Name   string
	Path   string
	Code   string
	SHA256 string
	Inputs []fixtureInput
}

type sample struct {
	Iteration    int                      `json:"iteration"`
	Input        string                   `json:"input"`
	Success      bool                     `json:"success"`
	OutputValid  bool                     `json:"output_valid"`
	TraceMode    string                   `json:"trace_mode"`
	Fallback     bool                     `json:"fallback"`
	WallMs       float64                  `json:"wall_ms"`
	Metrics      *domain.ExecutionMetrics `json:"metrics,omitempty"`
	Error        string                   `json:"error,omitempty"`
	TraceWarning []string                 `json:"trace_warnings,omitempty"`
}

type distribution struct {
	Samples int     `json:"samples"`
	Min     float64 `json:"min"`
	Mean    float64 `json:"mean"`
	P50     float64 `json:"p50"`
	P95     float64 `json:"p95"`
	P99     float64 `json:"p99"`
	Max     float64 `json:"max"`
}

type summary struct {
	Samples                    int                     `json:"samples"`
	Successes                  int                     `json:"successes"`
	Failures                   int                     `json:"failures"`
	OutputMismatches           int                     `json:"output_mismatches"`
	SuccessRate                float64                 `json:"success_rate"`
	Fallbacks                  int                     `json:"fallbacks"`
	FallbackRate               float64                 `json:"fallback_rate"`
	CacheHits                  int                     `json:"cache_hits"`
	CacheHitRate               float64                 `json:"cache_hit_rate"`
	MetricsSamples             int                     `json:"metrics_samples"`
	LatencySamples             int                     `json:"latency_samples"`
	CompileAttemptsTotal       int                     `json:"compile_attempts_total"`
	CompileAttemptsMax         int                     `json:"compile_attempts_max"`
	CompileResourcesIncomplete int                     `json:"compile_resources_incomplete_samples"`
	LatencyMs                  map[string]distribution `json:"latency_ms"`
	CompileCPUMs               distribution            `json:"compile_cpu_ms"`
	CompileMaxRSSKB            distribution            `json:"compile_max_rss_kb"`
}

type fixtureReport struct {
	Name         string         `json:"name"`
	Source       string         `json:"source"`
	SourceSHA256 string         `json:"source_sha256"`
	Inputs       []fixtureInput `json:"inputs"`
	Warmup       *sample        `json:"warmup,omitempty"`
	Samples      []sample       `json:"samples"`
	Summary      summary        `json:"summary"`
}

type scenarioReport struct {
	Name        string          `json:"name"`
	PCH         bool            `json:"pch"`
	BinaryCache bool            `json:"binary_cache"`
	Fixtures    []fixtureReport `json:"fixtures"`
	Summary     summary         `json:"summary"`
}

type analysisSample struct {
	Iteration    int      `json:"iteration"`
	Success      bool     `json:"success"`
	CacheHit     bool     `json:"cache_hit"`
	TimeMs       float64  `json:"time_ms"`
	WallMs       float64  `json:"wall_ms"`
	Capabilities []string `json:"capabilities"`
	Error        string   `json:"error,omitempty"`
}

type analysisSummary struct {
	Samples      int          `json:"samples"`
	Successes    int          `json:"successes"`
	Failures     int          `json:"failures"`
	SuccessRate  float64      `json:"success_rate"`
	CacheHits    int          `json:"cache_hits"`
	CacheHitRate float64      `json:"cache_hit_rate"`
	LatencyMs    distribution `json:"latency_ms"`
}

type analysisFixtureReport struct {
	Name         string           `json:"name"`
	SourceSHA256 string           `json:"source_sha256"`
	Warmup       *analysisSample  `json:"warmup,omitempty"`
	Samples      []analysisSample `json:"samples"`
	Summary      analysisSummary  `json:"summary"`
}

type analysisScenarioReport struct {
	Name     string                  `json:"name"`
	PCH      bool                    `json:"pch"`
	Cache    bool                    `json:"analysis_cache"`
	Fixtures []analysisFixtureReport `json:"fixtures"`
	Summary  analysisSummary         `json:"summary"`
}

type metadata struct {
	CompilerResourceCollector       string            `json:"compiler_resource_collector"`
	CompilerResourceCollectorSHA256 string            `json:"compiler_resource_collector_sha256,omitempty"`
	GoVersion                       string            `json:"go_version"`
	GOOS                            string            `json:"goos"`
	GOARCH                          string            `json:"goarch"`
	NumCPU                          int               `json:"num_cpu"`
	GOMAXPROCS                      int               `json:"gomaxprocs"`
	CPUModel                        string            `json:"cpu_model,omitempty"`
	MemoryTotalKB                   int64             `json:"memory_total_kb,omitempty"`
	CgroupCPUQuota                  string            `json:"cgroup_cpu_quota,omitempty"`
	CgroupMemoryMax                 string            `json:"cgroup_memory_max,omitempty"`
	CompilerVersion                 string            `json:"compiler_version"`
	PythonVersion                   string            `json:"python_version"`
	BuildSettings                   map[string]string `json:"build_settings,omitempty"`
	Header                          string            `json:"header"`
	HeaderSHA256                    string            `json:"header_sha256"`
	ClangRuntime                    string            `json:"clang_runtime"`
	CompilerCache                   string            `json:"compiler_cache"`
	CompilerCacheBytes              int64             `json:"compiler_cache_bytes"`
	PCHBytes                        int64             `json:"pch_bytes"`
	PCHFiles                        map[string]int64  `json:"pch_files"`
	CompileFlags                    []string          `json:"compile_flags"`
	BinaryCacheMaxBytes             int               `json:"binary_cache_max_bytes"`
	BinaryCacheMaxEntries           int               `json:"binary_cache_max_entries"`
	AnalysisCacheMaxEntries         int               `json:"analysis_cache_max_entries"`
	CompileMemoryBytes              uint64            `json:"compile_memory_bytes"`
	ExecuteMemoryBytes              uint64            `json:"execute_memory_bytes"`
	StackBytes                      uint64            `json:"stack_bytes"`
	MaxEvents                       int               `json:"max_events"`
	CompileTimeoutMs                int64             `json:"compile_timeout_ms"`
	AnalysisTimeoutMs               int64             `json:"analysis_timeout_ms"`
	ExecuteTimeoutMs                int64             `json:"execute_timeout_ms"`
}

type report struct {
	SchemaVersion     int                      `json:"schema_version"`
	StartedAt         string                   `json:"started_at"`
	DurationMs        float64                  `json:"duration_ms"`
	Iterations        int                      `json:"iterations_per_fixture"`
	Sandbox           bool                     `json:"sandbox"`
	PercentileMethod  string                   `json:"percentile_method"`
	LatencyPopulation string                   `json:"latency_population"`
	Warnings          []string                 `json:"warnings"`
	Metadata          metadata                 `json:"metadata"`
	Scenarios         []scenarioReport         `json:"scenarios"`
	AnalysisScenarios []analysisScenarioReport `json:"analysis_scenarios"`
}

type executionRunner interface {
	Run(code, stdin string) domain.ExecutionResult
}

type analysisRunner interface {
	Analyze(ctx context.Context, code string) runner.AnalysisResult
}

func main() {
	if err := run(os.Args[1:], os.Stdout, os.Stderr); err != nil {
		fmt.Fprintln(os.Stderr, "benchmark:", err)
		os.Exit(1)
	}
}

func run(args []string, stdout, stderr io.Writer) error {
	flags := flag.NewFlagSet("benchmark", flag.ContinueOnError)
	flags.SetOutput(stderr)
	var opts options
	flags.IntVar(&opts.Iterations, "iterations", 10, "Número de amostras por fixture e cenário (>= 1)")
	flags.StringVar(&opts.Header, "header", defaultHeader(), "Caminho para visualizer.h")
	flags.StringVar(&opts.CompilerCache, "compiler-cache", os.Getenv("RUNSPECT_CPP_CACHE"), "Diretório de PCHs previamente preparados (ou RUNSPECT_CPP_CACHE)")
	flags.BoolVar(&opts.Sandbox, "sandbox", true, "Usar sandbox; false executa somente as fixtures confiáveis do repositório")
	flags.StringVar(&opts.Output, "output", "", "Salvar também o relatório JSON neste arquivo")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("não são aceitos código, entrada ou argumentos posicionais")
	}
	if opts.Iterations < 1 {
		return fmt.Errorf("-iterations deve ser >= 1")
	}
	if opts.CompilerCache == "" {
		return fmt.Errorf("informe -compiler-cache ou RUNSPECT_CPP_CACHE; prepare os PCHs com pkg/visualizer/prepare_cpp_cache.py antes de medir")
	}
	header, err := filepath.Abs(opts.Header)
	if err != nil {
		return fmt.Errorf("caminho do header: %w", err)
	}
	cache, err := filepath.Abs(opts.CompilerCache)
	if err != nil {
		return fmt.Errorf("caminho do cache: %w", err)
	}
	opts.Header, opts.CompilerCache = header, cache
	for _, name := range []string{"visualizer.h", "automatic.h", "instrument_cpp.py"} {
		if _, err := os.Stat(filepath.Join(filepath.Dir(header), name)); err != nil {
			return fmt.Errorf("runtime de visualização incompleto (%s): %w", name, err)
		}
	}
	fixtures, err := loadFixtures()
	if err != nil {
		return err
	}
	meta, err := collectMetadata(opts)
	if err != nil {
		return err
	}
	started := time.Now()
	result := report{
		SchemaVersion: 1, StartedAt: started.UTC().Format(time.RFC3339),
		Iterations: opts.Iterations, Sandbox: opts.Sandbox,
		PercentileMethod:  "nearest-rank: sorted[ceil(percentile * n) - 1]",
		LatencyPopulation: "successful runs with expected stdout and execution metrics; warmup excluded",
		Warnings:          []string{}, Metadata: meta,
	}
	if opts.Iterations < 100 {
		result.Warnings = append(result.Warnings, "Amostra pequena: menos de 100 execuções por fixture; p95/p99 descrevem esta amostra e não estimam uma cauda estável. Use >= 100 iterações na máquina do deploy.")
	}
	result.Warnings = append(result.Warnings, "PCHs são preparados antes da medição. Presença dos arquivos não comprova compatibilidade ou uso efetivo pelo compilador; compare também análise/compilação e fallback.")
	if !opts.Sandbox {
		result.Warnings = append(result.Warnings, "Sandbox desativado somente para fixtures confiáveis. Estes tempos não representam o custo do sandbox no deploy.")
	}
	for _, warning := range result.Warnings {
		fmt.Fprintln(stderr, "AVISO:", warning)
	}
	failures := 0
	for _, config := range []struct {
		name             string
		pch, binaryCache bool
	}{
		{"no_pch_no_binary_cache", false, false},
		{"pch_no_binary_cache", true, false},
		{"pch_warm_binary_cache", true, true},
	} {
		scenario := scenarioReport{Name: config.name, PCH: config.pch, BinaryCache: config.binaryCache}
		var allSamples []sample
		for _, fixture := range fixtures {
			fmt.Fprintf(stderr, "%s / %s: %d amostras\n", config.name, fixture.Name, opts.Iterations)
			r := configuredRunner(header)
			r.Sandbox = opts.Sandbox
			r.CompilerCachePath = ""
			if config.pch {
				r.CompilerCachePath = cache
			}
			if !config.binaryCache {
				r.CacheMaxBytes = 0
			}
			fixtureResult := measureFixture(r, fixture, opts.Iterations, config.binaryCache)
			failures += fixtureResult.Summary.Failures
			if fixtureResult.Warmup != nil && (!fixtureResult.Warmup.Success || !fixtureResult.Warmup.OutputValid) {
				failures++
			}
			allSamples = append(allSamples, fixtureResult.Samples...)
			scenario.Fixtures = append(scenario.Fixtures, fixtureResult)
		}
		scenario.Summary = summarize(allSamples)
		if scenario.Summary.Fallbacks != 0 {
			result.Warnings = append(result.Warnings, fmt.Sprintf("%s: %d execução(ões) com fallback; verifique trace_mode e trace_warnings antes de comparar desempenho.", config.name, scenario.Summary.Fallbacks))
		}
		if scenario.Summary.MetricsSamples != scenario.Summary.Samples {
			result.Warnings = append(result.Warnings, config.name+": amostras sem métricas; percentis de etapas e taxa de cache estão incompletos.")
		}
		if config.binaryCache && scenario.Summary.CacheHits != scenario.Summary.Samples {
			result.Warnings = append(result.Warnings, config.name+": cache binário não atingiu 100% após o aquecimento; verifique fallback, limite do cache e falhas no warmup.")
		}
		result.Scenarios = append(result.Scenarios, scenario)
	}
	for _, warmed := range []bool{false, true} {
		name := "pch_no_analysis_cache"
		if warmed {
			name = "pch_warm_analysis_cache"
		}
		scenario := analysisScenarioReport{Name: name, PCH: true, Cache: warmed}
		var allSamples []analysisSample
		for _, fixture := range fixtures {
			fmt.Fprintf(stderr, "%s / %s: %d amostras\n", name, fixture.Name, opts.Iterations)
			r := configuredRunner(header)
			r.Sandbox, r.CompilerCachePath = opts.Sandbox, cache
			r.CacheMaxBytes = 0
			if !warmed {
				r.AnalysisCacheMaxEntries = 0
			}
			fixtureResult := measureAnalysisFixture(r, fixture, opts.Iterations, warmed)
			failures += fixtureResult.Summary.Failures
			if fixtureResult.Warmup != nil && !fixtureResult.Warmup.Success {
				failures++
			}
			allSamples = append(allSamples, fixtureResult.Samples...)
			scenario.Fixtures = append(scenario.Fixtures, fixtureResult)
		}
		scenario.Summary = summarizeAnalysis(allSamples)
		if warmed && scenario.Summary.CacheHits != scenario.Summary.Samples {
			result.Warnings = append(result.Warnings, name+": análise não atingiu 100% de cache após aquecimento; confira erros e limites do cache.")
		}
		result.AnalysisScenarios = append(result.AnalysisScenarios, scenario)
	}
	result.DurationMs = elapsedMs(started)
	encoded, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return fmt.Errorf("serializar relatório: %w", err)
	}
	encoded = append(encoded, '\n')
	if opts.Output != "" {
		if err := os.WriteFile(opts.Output, encoded, 0644); err != nil {
			return fmt.Errorf("salvar relatório: %w", err)
		}
	}
	if _, err := stdout.Write(encoded); err != nil {
		return fmt.Errorf("escrever relatório: %w", err)
	}
	if failures != 0 {
		return fmt.Errorf("%d execução(ões) falharam ou produziram saída incorreta; relatório preservado", failures)
	}
	return nil
}

func defaultHeader() string {
	if value := os.Getenv("RUNSPECT_VISUALIZER_HEADER"); value != "" {
		return value
	}
	for _, path := range []string{"pkg/visualizer/visualizer.h", "backend/pkg/visualizer/visualizer.h"} {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}
	return "pkg/visualizer/visualizer.h"
}

func loadFixtures() ([]fixture, error) {
	definitions := []fixture{
		{Name: "deploy_bubble_sort", Inputs: []fixtureInput{
			{Name: "descending", Stdin: "5\n5 4 3 2 1\n", Expected: "1 2 3 4 5\n"},
			{Name: "duplicates_negative", Stdin: "6\n0 -2 7 -2 3 0\n", Expected: "-2 -2 0 0 3 7\n"},
		}},
		{Name: "kmp", Inputs: []fixtureInput{
			{Name: "found", Stdin: "ababcabcabababd\nababd\n", Expected: "Posicao: 10\n"},
			{Name: "not_found", Stdin: "abcdef\ngh\n", Expected: "Padrao nao encontrado\n"},
		}},
	}
	for i := range definitions {
		var readErr error
		for _, base := range []string{"internal/runner/testdata", "backend/internal/runner/testdata"} {
			path := filepath.Join(base, definitions[i].Name+".cpp")
			data, err := os.ReadFile(path)
			if err != nil {
				readErr = err
				continue
			}
			absolute, err := filepath.Abs(path)
			if err != nil {
				return nil, err
			}
			definitions[i].Path, definitions[i].Code = absolute, string(data)
			definitions[i].SHA256 = digest(data)
			break
		}
		if definitions[i].Code == "" {
			return nil, fmt.Errorf("fixture %s não encontrada; execute na raiz do repositório ou em backend: %w", definitions[i].Name, readErr)
		}
	}
	return definitions, nil
}

func measureFixture(r executionRunner, fixture fixture, iterations int, warmup bool) fixtureReport {
	result := fixtureReport{Name: fixture.Name, Source: fixture.Path, SourceSHA256: fixture.SHA256, Inputs: fixture.Inputs, Samples: make([]sample, 0, iterations)}
	if warmup {
		// Warm with the alternate input: the first measured hit must execute
		// with different stdin rather than reusing the previous output.
		observation := measure(r, fixture.Code, fixture.Inputs[len(fixture.Inputs)-1], 0)
		result.Warmup = &observation
	}
	for i := 0; i < iterations; i++ {
		result.Samples = append(result.Samples, measure(r, fixture.Code, fixture.Inputs[i%len(fixture.Inputs)], i+1))
	}
	result.Summary = summarize(result.Samples)
	return result
}

func measure(r executionRunner, code string, input fixtureInput, iteration int) sample {
	start := time.Now()
	result := r.Run(code, input.Stdin)
	observation := sample{
		Iteration: iteration, Input: input.Name, Success: result.Success,
		OutputValid: result.Output == input.Expected, TraceMode: result.TraceMode,
		Fallback: result.TraceMode == "unavailable", WallMs: elapsedMs(start),
		Metrics: result.Metrics, Error: result.Errors, TraceWarning: result.TraceWarnings,
	}
	if result.Metrics != nil && (result.Metrics.Fallback || result.Metrics.CompileAttempts > 1) {
		observation.Fallback = true
	}
	if result.Success && !observation.OutputValid {
		observation.Error = fmt.Sprintf("saída incorreta: esperado %q, recebido %q", input.Expected, result.Output)
	}
	return observation
}

func measureAnalysisFixture(r analysisRunner, fixture fixture, iterations int, warmup bool) analysisFixtureReport {
	result := analysisFixtureReport{Name: fixture.Name, SourceSHA256: fixture.SHA256, Samples: make([]analysisSample, 0, iterations)}
	if warmup {
		observation := measureAnalysis(r, fixture.Code, 0)
		result.Warmup = &observation
	}
	for i := 0; i < iterations; i++ {
		result.Samples = append(result.Samples, measureAnalysis(r, fixture.Code, i+1))
	}
	result.Summary = summarizeAnalysis(result.Samples)
	return result
}

func measureAnalysis(r analysisRunner, code string, iteration int) analysisSample {
	start := time.Now()
	result := r.Analyze(context.Background(), code)
	return analysisSample{
		Iteration: iteration, Success: result.Success, CacheHit: result.CacheHit,
		TimeMs: result.TimeMs, WallMs: elapsedMs(start), Capabilities: result.Capabilities, Error: result.Errors,
	}
}

func summarizeAnalysis(samples []analysisSample) analysisSummary {
	result := analysisSummary{Samples: len(samples)}
	var times []float64
	for _, observation := range samples {
		if observation.Success {
			result.Successes++
			times = append(times, observation.TimeMs)
		} else {
			result.Failures++
		}
		if observation.CacheHit {
			result.CacheHits++
		}
	}
	if result.Samples > 0 {
		result.SuccessRate = float64(result.Successes) / float64(result.Samples)
		result.CacheHitRate = float64(result.CacheHits) / float64(result.Samples)
	}
	result.LatencyMs = describe(times)
	return result
}

func summarize(samples []sample) summary {
	result := summary{Samples: len(samples), LatencyMs: make(map[string]distribution)}
	values := map[string][]float64{"total": {}, "prepare": {}, "analysis": {}, "compile": {}, "fallback_compile": {}, "execute": {}, "observed_wall": {}}
	var cpu, rss []float64
	for _, observation := range samples {
		valid := observation.Success && observation.OutputValid
		if valid {
			result.Successes++
		} else {
			result.Failures++
		}
		if observation.Success && !observation.OutputValid {
			result.OutputMismatches++
		}
		if observation.Fallback {
			result.Fallbacks++
		}
		metrics := observation.Metrics
		if metrics == nil {
			continue
		}
		result.MetricsSamples++
		if metrics.CacheHit {
			result.CacheHits++
		}
		result.CompileAttemptsTotal += metrics.CompileAttempts
		result.CompileAttemptsMax = max(result.CompileAttemptsMax, metrics.CompileAttempts)
		if metrics.CompileAttempts > 0 && !metrics.CompileResourcesComplete {
			result.CompileResourcesIncomplete++
		}
		if !valid {
			continue
		}
		result.LatencySamples++
		values["total"] = append(values["total"], metrics.TotalMs)
		values["prepare"] = append(values["prepare"], metrics.PrepareMs)
		values["analysis"] = append(values["analysis"], metrics.AnalysisMs)
		values["compile"] = append(values["compile"], metrics.CompileMs)
		values["fallback_compile"] = append(values["fallback_compile"], metrics.FallbackCompileMs)
		values["execute"] = append(values["execute"], metrics.ExecuteMs)
		values["observed_wall"] = append(values["observed_wall"], observation.WallMs)
		// Hits execute without a compiler, so compiler resource percentiles
		// cover only observations that actually attempted compilation.
		if metrics.CompileAttempts > 0 && metrics.CompileResourcesComplete {
			cpu = append(cpu, metrics.CompileCPUMs)
			rss = append(rss, float64(metrics.CompileMaxRSSKB))
		}
	}
	if result.Samples > 0 {
		result.SuccessRate = float64(result.Successes) / float64(result.Samples)
		result.FallbackRate = float64(result.Fallbacks) / float64(result.Samples)
	}
	if result.MetricsSamples > 0 {
		result.CacheHitRate = float64(result.CacheHits) / float64(result.MetricsSamples)
	}
	for name, numbers := range values {
		result.LatencyMs[name] = describe(numbers)
	}
	result.CompileCPUMs, result.CompileMaxRSSKB = describe(cpu), describe(rss)
	return result
}

func describe(numbers []float64) distribution {
	if len(numbers) == 0 {
		return distribution{}
	}
	ordered := append([]float64(nil), numbers...)
	sort.Float64s(ordered)
	var sum float64
	for _, number := range ordered {
		sum += number
	}
	return distribution{
		Samples: len(ordered), Min: ordered[0], Max: ordered[len(ordered)-1], Mean: sum / float64(len(ordered)),
		P50: nearestRank(ordered, .50), P95: nearestRank(ordered, .95), P99: nearestRank(ordered, .99),
	}
}

// nearestRank accepts ordered observations and a quantile in [0, 1].
func nearestRank(ordered []float64, quantile float64) float64 {
	if len(ordered) == 0 {
		return 0
	}
	index := int(math.Ceil(quantile*float64(len(ordered)))) - 1
	index = max(0, min(index, len(ordered)-1))
	return ordered[index]
}

// Match the server's RUNSPECT_* resource configuration while sandbox remains
// an explicit benchmark flag and defaults to on, independent of the environment.
func configuredRunner(header string) *runner.CppRunner {
	r := runner.NewCppRunner(header)
	r.CompileTimeout = time.Duration(envInt("RUNSPECT_COMPILE_TIMEOUT_SEC", int(r.CompileTimeout.Seconds()), false)) * time.Second
	r.AnalysisTimeout = time.Duration(envInt("RUNSPECT_ANALYSIS_TIMEOUT_SEC", int(r.AnalysisTimeout.Seconds()), false)) * time.Second
	r.CacheMaxBytes = envInt("RUNSPECT_BINARY_CACHE_MB", r.CacheMaxBytes>>20, true) << 20
	r.CacheMaxEntries = envInt("RUNSPECT_BINARY_CACHE_ENTRIES", r.CacheMaxEntries, true)
	r.AnalysisCacheMaxEntries = envInt("RUNSPECT_ANALYSIS_CACHE_ENTRIES", r.AnalysisCacheMaxEntries, true)
	r.CompileMemoryBytes = uint64(envInt("RUNSPECT_COMPILE_MEMORY_MB", int(r.CompileMemoryBytes>>20), false)) << 20
	r.MemoryBytes = uint64(envInt("RUNSPECT_MEMORY_MB", int(r.MemoryBytes>>20), false)) << 20
	r.StackBytes = uint64(envInt("RUNSPECT_STACK_MB", int(r.StackBytes>>20), false)) << 20
	r.MaxEvents = envInt("RUNSPECT_MAX_EVENTS", r.MaxEvents, false)
	return r
}

func envInt(name string, fallback int, allowZero bool) int {
	if value, err := strconv.Atoi(os.Getenv(name)); err == nil && (value > 0 || allowZero && value == 0) {
		return value
	}
	return fallback
}

func collectMetadata(opts options) (metadata, error) {
	r := configuredRunner(opts.Header)
	header, err := os.ReadFile(opts.Header)
	if err != nil {
		return metadata{}, err
	}
	result := metadata{
		GoVersion: runtime.Version(), GOOS: runtime.GOOS, GOARCH: runtime.GOARCH,
		NumCPU: runtime.NumCPU(), GOMAXPROCS: runtime.GOMAXPROCS(0),
		CompilerVersion: version("g++", "--version"), PythonVersion: version("/usr/bin/python3", "--version"),
		Header: opts.Header, HeaderSHA256: digest(header), ClangRuntime: r.ClangRuntimePath,
		CompilerCache: opts.CompilerCache, PCHFiles: make(map[string]int64),
		CompileFlags:        []string{"-O0", "-pipe", "-std=c++17"},
		BinaryCacheMaxBytes: r.CacheMaxBytes, CompileTimeoutMs: r.CompileTimeout.Milliseconds(),
		BinaryCacheMaxEntries: r.CacheMaxEntries, AnalysisCacheMaxEntries: r.AnalysisCacheMaxEntries,
		CompileMemoryBytes: r.CompileMemoryBytes, ExecuteMemoryBytes: r.MemoryBytes,
		StackBytes: r.StackBytes, MaxEvents: r.MaxEvents,
		AnalysisTimeoutMs: r.AnalysisTimeout.Milliseconds(), ExecuteTimeoutMs: r.RunTimeout.Milliseconds(),
		CgroupCPUQuota: readTrimmed("/sys/fs/cgroup/cpu.max"), CgroupMemoryMax: readTrimmed("/sys/fs/cgroup/memory.max"),
	}
	if data, err := os.ReadFile(filepath.Join(filepath.Dir(opts.Header), "measure_compile.py")); err == nil {
		result.CompilerResourceCollector = "Python os.wait4 inside compilation sandbox"
		result.CompilerResourceCollectorSHA256 = digest(data)
	} else {
		result.CompilerResourceCollector = "unavailable; compiler resources marked incomplete"
	}
	if build, ok := debug.ReadBuildInfo(); ok {
		result.BuildSettings = make(map[string]string)
		for _, setting := range build.Settings {
			result.BuildSettings[setting.Key] = setting.Value
		}
	}
	if data, err := os.ReadFile("/proc/cpuinfo"); err == nil {
		for _, line := range strings.Split(string(data), "\n") {
			if key, value, ok := strings.Cut(line, ":"); ok && strings.TrimSpace(key) == "model name" {
				result.CPUModel = strings.TrimSpace(value)
				break
			}
		}
	}
	if data, err := os.ReadFile("/proc/meminfo"); err == nil {
		for _, line := range strings.Split(string(data), "\n") {
			if fields := strings.Fields(line); len(fields) >= 2 && fields[0] == "MemTotal:" {
				result.MemoryTotalKB, _ = strconv.ParseInt(fields[1], 10, 64)
				break
			}
		}
	}
	for _, name := range []string{"stdlib.pch", "bits/stdc++.h.gch"} {
		info, err := os.Stat(filepath.Join(opts.CompilerCache, name))
		if err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
			return metadata{}, fmt.Errorf("PCH %s ausente ou vazio em %s; prepare o cache antes do benchmark", name, opts.CompilerCache)
		}
		result.PCHFiles[name] = info.Size()
		result.PCHBytes += info.Size()
	}
	err = filepath.WalkDir(opts.CompilerCache, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type().IsRegular() {
			info, err := entry.Info()
			if err != nil {
				return err
			}
			result.CompilerCacheBytes += info.Size()
		}
		return nil
	})
	if err != nil {
		return metadata{}, fmt.Errorf("medir tamanho do cache: %w", err)
	}
	return result, nil
}

func digest(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func elapsedMs(start time.Time) float64 {
	return float64(time.Since(start)) / float64(time.Millisecond)
}

func version(command string, args ...string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	data, err := exec.CommandContext(ctx, command, args...).CombinedOutput()
	if err != nil {
		return "unavailable: " + err.Error()
	}
	line, _, _ := strings.Cut(string(data), "\n")
	return strings.TrimSpace(line)
}

func readTrimmed(path string) string {
	data, _ := os.ReadFile(path)
	return strings.TrimSpace(string(data))
}
