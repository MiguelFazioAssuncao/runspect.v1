package main

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/MiguelFazioAssuncao/runspect.v1/internal/domain"
)

func TestCacheLimitsAllowDisablingAndRejectInvalidValues(t *testing.T) {
	for _, tc := range []struct {
		value string
		want  int
	}{
		{"", 16}, {"0", 0}, {"64", 64}, {"-1", 16}, {"invalid", 16},
	} {
		t.Setenv("RUNSPECT_TEST_CACHE_LIMIT", tc.value)
		if got := envCacheLimit("RUNSPECT_TEST_CACHE_LIMIT", 16); got != tc.want {
			t.Fatalf("%q: got %d want %d", tc.value, got, tc.want)
		}
	}
}

func TestServerTimingReportsFractionalStageDurations(t *testing.T) {
	got := serverTiming(&domain.ExecutionMetrics{PrepareMs: 0.125, AnalysisMs: 10, CompileMs: 120.5, ExecuteMs: 2})
	want := "prepare;dur=0.125, analysis;dur=10.000, compile;dur=120.500, execute;dur=2.000"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestRequestMetricsRecordsRejectedRequestsWithoutSourceOrInput(t *testing.T) {
	var logs bytes.Buffer
	previous := performanceLog
	performanceLog = slog.New(slog.NewJSONHandler(&logs, nil))
	t.Cleanup(func() { performanceLog = previous })
	for _, status := range []int{http.StatusTooManyRequests, http.StatusServiceUnavailable} {
		logs.Reset()
		h := requestMetrics(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(status)
			_, _ = w.Write([]byte("busy"))
		}))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/run?private=query", strings.NewReader("private source and stdin")))
		var event struct {
			Msg        string  `json:"msg"`
			Endpoint   string  `json:"endpoint"`
			Status     int     `json:"status"`
			DurationMs float64 `json:"duration_ms"`
		}
		if err := json.Unmarshal(logs.Bytes(), &event); err != nil || event.Msg != "cpp_request" || event.Endpoint != "/api/run" || event.Status != status || rec.Code != status || event.DurationMs < 0 {
			t.Fatalf("invalid rejection metrics: %s status=%d error=%v", logs.String(), rec.Code, err)
		}
		if strings.Contains(logs.String(), "private") {
			t.Fatal("request metrics exposed request contents")
		}
	}
}

func TestRunHandlerRejectsInvalidRequestsBeforeRunning(t *testing.T) {
	oversizedStdin, err := json.Marshal(CodeRequest{Code: "int main() {}", Stdin: strings.Repeat("x", maxStdinBytes+1)})
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name string
		body string
	}{
		{"invalid JSON", `{`},
		{"missing code", `{}`},
		{"whitespace code", `{"code":" \n\t "}`},
		{"second object", `{"code":"int main() {}"} {}`},
		{"trailing garbage", `{"code":"int main() {}"} invalid`},
		{"oversized trailing whitespace", `{"code":"int main() {}"}` + strings.Repeat(" ", 256*1024)},
		{"oversized stdin", string(oversizedStdin)},
		{"negative frames", `{"code":"int main() {}","trace_options":{"max_steps":-1}}`},
		{"excessive frames", `{"code":"int main() {}","trace_options":{"max_steps":10001}}`},
		{"excessive items", `{"code":"int main() {}","trace_options":{"max_items":2049}}`},
		{"invalid limit type", `{"code":"int main() {}","trace_options":{"max_items":"large"}}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/run", strings.NewReader(tc.body))
			rec := httptest.NewRecorder()
			// A nil runner ensures invalid input never reaches compilation.
			runHandler(nil).ServeHTTP(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body = %s", rec.Code, rec.Body.String())
			}
			var result map[string]any
			if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil || result["success"] != false {
				t.Fatalf("invalid error response: %s", rec.Body.String())
			}
		})
	}
}

func TestRunHandlerRejectsGet(t *testing.T) {
	rec := httptest.NewRecorder()
	runHandler(nil).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/run", nil))
	if rec.Code != http.StatusMethodNotAllowed || rec.Header().Get("Allow") != http.MethodPost {
		t.Fatalf("status = %d, Allow = %q", rec.Code, rec.Header().Get("Allow"))
	}
}

func TestAnalyzeHandlerRejectsInvalidRequests(t *testing.T) {
	for _, body := range []string{`{`, `{}`, `{"code":" "}`, `{"code":"int main() {}"} {}`} {
		rec := httptest.NewRecorder()
		analyzeHandler(nil).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/analyze", strings.NewReader(body)))
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status=%d for %s", rec.Code, body)
		}
	}
	rec := httptest.NewRecorder()
	analyzeHandler(nil).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/analyze", nil))
	if rec.Code != http.StatusMethodNotAllowed || rec.Header().Get("Allow") != http.MethodPost {
		t.Fatalf("status=%d Allow=%q", rec.Code, rec.Header().Get("Allow"))
	}
}
