package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

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
