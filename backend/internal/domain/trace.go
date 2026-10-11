package domain

type TraceStep struct {
	Step      int            `json:"step"`
	StepEvent string         `json:"step_event"`
	Data      map[string]any `json:"data,omitempty"`
}

type ExecutionResult struct {
	Success       bool              `json:"success"`
	Steps         []TraceStep       `json:"steps"`
	Output        string            `json:"output,omitempty"`
	Errors        string            `json:"errors,omitempty"`
	TimeMs        int64             `json:"time_ms"`
	TraceMode     string            `json:"trace_mode,omitempty"`
	TraceWarnings []string          `json:"trace_warnings,omitempty"`
	Metrics       *ExecutionMetrics `json:"metrics,omitempty"`
}

// Timings use fractional milliseconds so cached executions remain measurable.
// Compile values include all attempts, including the original-code fallback.
type ExecutionMetrics struct {
	TotalMs                  float64 `json:"total_ms"`
	PrepareMs                float64 `json:"prepare_ms"`
	AnalysisMs               float64 `json:"analysis_ms"`
	CompileMs                float64 `json:"compile_ms"`
	FallbackCompileMs        float64 `json:"fallback_compile_ms"`
	ExecuteMs                float64 `json:"execute_ms"`
	CompileCPUMs             float64 `json:"compile_cpu_ms"`
	CompileMaxRSSKB          int64   `json:"compile_max_rss_kb"`
	CompileResourcesComplete bool    `json:"compile_resources_complete"`
	CompileAttempts          int     `json:"compile_attempts"`
	CompileTimeouts          int     `json:"compile_timeouts"`
	AnalysisTimeout          bool    `json:"analysis_timeout"`
	ExecuteTimeout           bool    `json:"execute_timeout"`
	FailedStage              string  `json:"failed_stage,omitempty"`
	CacheHit                 bool    `json:"cache_hit"`
	Fallback                 bool    `json:"fallback"`
	CacheEntries             int     `json:"cache_entries"`
	CacheBytes               int     `json:"cache_bytes"`
	CacheEvictions           uint64  `json:"cache_evictions"`
}
