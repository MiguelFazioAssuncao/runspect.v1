package domain

type TraceStep struct {
	Step      int            `json:"step"`
	StepEvent string         `json:"step_event"`
	Data      map[string]any `json:"data,omitempty"`
}

type ExecutionResult struct {
	Success bool        `json:"success"`
	Steps   []TraceStep `json:"steps"`
	Errors  string      `json:"errors,omitempty"`
	TimeMs  int64       `json:"time_ms"`
}