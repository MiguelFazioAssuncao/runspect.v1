package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

var ok = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
})

func do(h http.Handler, method, origin string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, "/api/run", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestCORS(t *testing.T) {
	h := Chain(ok, CORS([]string{"http://localhost:3000"}))

	rec := do(h, http.MethodPost, "http://localhost:3000")
	if rec.Code != http.StatusOK || rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
		t.Errorf("origem permitida: código %d", rec.Code)
	}
	if rec := do(h, http.MethodPost, "http://evil.example"); rec.Code != http.StatusForbidden {
		t.Errorf("origem estranha: código %d, esperava 403", rec.Code)
	}
	if rec := do(h, http.MethodOptions, "http://localhost:3000"); rec.Code != http.StatusNoContent {
		t.Errorf("preflight: código %d, esperava 204", rec.Code)
	}
	if rec := do(h, http.MethodPost, ""); rec.Code != http.StatusOK {
		t.Errorf("sem Origin: código %d, esperava 200", rec.Code)
	}
}

func TestRateLimit(t *testing.T) {
	h := Chain(ok, RateLimit(60, 2))
	codes := []int{
		do(h, http.MethodPost, "").Code,
		do(h, http.MethodPost, "").Code,
		do(h, http.MethodPost, "").Code,
	}
	want := []int{http.StatusOK, http.StatusOK, http.StatusTooManyRequests}
	for i := range want {
		if codes[i] != want[i] {
			t.Errorf("requisição %d: código %d, esperava %d", i, codes[i], want[i])
		}
	}
}

func TestMaxInFlight(t *testing.T) {
	release := make(chan struct{})
	entered := make(chan struct{})
	blocking := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		entered <- struct{}{}
		<-release
	})
	h := Chain(blocking, MaxInFlight(1))

	done := make(chan struct{})
	go func() {
		do(h, http.MethodPost, "")
		close(done)
	}()
	<-entered

	if rec := do(h, http.MethodPost, ""); rec.Code != http.StatusServiceUnavailable {
		t.Errorf("segunda requisição: código %d, esperava 503", rec.Code)
	}
	close(release)
	<-done
}

func TestRateLimitBehindProxyUsesForwardedClient(t *testing.T) {
	h := Chain(ok, RateLimitBy(60, 1, ClientIP(true)))
	request := func(forwarded string) int {
		req := httptest.NewRequest(http.MethodPost, "/api/run", nil)
		req.RemoteAddr = "10.0.0.1:1234" // the proxy, same for everyone
		req.Header.Set("X-Forwarded-For", forwarded)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}
	if code := request("203.0.113.7, 10.0.0.1"); code != http.StatusOK {
		t.Fatalf("primeiro cliente: código %d", code)
	}
	if code := request("198.51.100.2"); code != http.StatusOK {
		t.Fatalf("outro cliente não deveria dividir o limite: código %d", code)
	}
	if code := request("203.0.113.7"); code != http.StatusTooManyRequests {
		t.Fatalf("mesmo cliente deveria ser limitado: código %d", code)
	}
}

func TestClientIPIgnoresForwardedHeaderUnlessTrusted(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/run", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	req.Header.Set("X-Forwarded-For", "203.0.113.7")
	if got := ClientIP(false)(req); got != "10.0.0.1" {
		t.Fatalf("sem proxy confiável: %q", got)
	}
	if got := ClientIP(true)(req); got != "203.0.113.7" {
		t.Fatalf("com proxy confiável: %q", got)
	}
}
