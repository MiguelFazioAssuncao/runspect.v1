package domain

type TraceStep struct {
	Step      int            `json:"step"`
	StepEvent string         `json:"step_event"`
	Data      map[string]any `json:"data,omitempty"`
}

type ExecutionResult struct {
	Success       bool        `json:"success"`
	Steps         []TraceStep `json:"steps"`
	Output        string      `json:"output,omitempty"`
	Errors        string      `json:"errors,omitempty"`
	TimeMs        int64       `json:"time_ms"`
	TraceMode     string      `json:"trace_mode,omitempty"`
	TraceWarnings []string    `json:"trace_warnings,omitempty"`
}
