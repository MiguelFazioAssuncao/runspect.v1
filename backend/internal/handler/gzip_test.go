package handler

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGzipCompressesWhenAccepted(t *testing.T) {
	body := strings.Repeat(`{"step":1,"event":"STEP"},`, 500)
	h := Gzip(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnprocessableEntity)
		_, _ = io.WriteString(w, body)
	}))

	req := httptest.NewRequest(http.MethodPost, "/api/run", nil)
	req.Header.Set("Accept-Encoding", "br, gzip;q=0.8")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status preservado: %d", rec.Code)
	}
	if rec.Header().Get("Content-Encoding") != "gzip" {
		t.Fatalf("esperava gzip, headers=%v", rec.Header())
	}
	if rec.Body.Len() >= len(body) {
		t.Fatalf("corpo não encolheu: %d >= %d", rec.Body.Len(), len(body))
	}
	reader, err := gzip.NewReader(rec.Body)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := io.ReadAll(reader)
	if err != nil || string(decoded) != body {
		t.Fatalf("conteúdo diferente após descompressão (err=%v)", err)
	}
}

func TestGzipSkipsWhenNotAcceptedOrEmpty(t *testing.T) {
	h := Gzip(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		_, _ = io.WriteString(w, "plain")
	}))

	for _, tc := range []struct{ path, accept string }{
		{"/api/run", ""},
		{"/api/run", "gzip;q=0"},
		{"/healthz", "gzip"},
	} {
		req := httptest.NewRequest(http.MethodPost, tc.path, nil)
		if tc.accept != "" {
			req.Header.Set("Accept-Encoding", tc.accept)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Header().Get("Content-Encoding") != "" {
			t.Errorf("%s com %q não deveria comprimir", tc.path, tc.accept)
		}
	}
}

func TestGzipKeepsCORSVary(t *testing.T) {
	h := Chain(ok, CORS([]string{"http://localhost:3000"}), Gzip)
	req := httptest.NewRequest(http.MethodPost, "/api/run", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Accept-Encoding", "gzip")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	vary := strings.Join(rec.Header().Values("Vary"), ",")
	if !strings.Contains(vary, "Origin") || !strings.Contains(vary, "Accept-Encoding") {
		t.Fatalf("Vary incompleto: %q", vary)
	}
}
