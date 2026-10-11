package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/MiguelFazioAssuncao/runspect.v1/internal/domain"
	"github.com/MiguelFazioAssuncao/runspect.v1/internal/handler"
	"github.com/MiguelFazioAssuncao/runspect.v1/internal/runner"
)

const maxStdinBytes = 64 * 1024

var performanceLog = slog.New(slog.NewJSONHandler(os.Stdout, nil))

type CodeRequest struct {
	Code         string              `json:"code"`
	Stdin        string              `json:"stdin"`
	TraceOptions domain.TraceOptions `json:"trace_options"`
}

func envString(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if value := os.Getenv(key); value != "" {
		if n, err := strconv.Atoi(value); err == nil && n > 0 {
			return n
		}
	}
	return fallback
}

// Zero disables optional caches; negative or malformed values use the default.
func envCacheLimit(key string, fallback int) int {
	if value := os.Getenv(key); value != "" {
		if n, err := strconv.Atoi(value); err == nil && n >= 0 {
			return n
		}
	}
	return fallback
}

func serverTiming(metrics *domain.ExecutionMetrics) string {
	return fmt.Sprintf("prepare;dur=%.3f, analysis;dur=%.3f, compile;dur=%.3f, execute;dur=%.3f", metrics.PrepareMs, metrics.AnalysisMs, metrics.CompileMs, metrics.ExecuteMs)
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	if w.status != 0 {
		return
	}
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusWriter) Write(data []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(data)
}

func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

// Record overload and rate-limit rejections as well as accepted requests.
// Only the two fixed API paths are logged; query strings and bodies stay out.
func requestMetrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/run" && r.URL.Path != "/api/analyze" {
			next.ServeHTTP(w, r)
			return
		}
		start := time.Now()
		observed := &statusWriter{ResponseWriter: w}
		next.ServeHTTP(observed, r)
		status := observed.status
		if status == 0 {
			status = http.StatusOK
		}
		performanceLog.Info("cpp_request", "endpoint", r.URL.Path, "status", status, "duration_ms", float64(time.Since(start))/float64(time.Millisecond))
	})
}

func serverAddress() string {
	if address := os.Getenv("RUNSPECT_ADDR"); address != "" {
		return address
	}
	if port := os.Getenv("PORT"); port != "" {
		return "0.0.0.0:" + port
	}
	return "127.0.0.1:8080"
}

func resolveHeaderPath() string {
	headerPath := os.Getenv("RUNSPECT_VISUALIZER_HEADER")
	if headerPath == "" {
		headerPath = "pkg/visualizer/visualizer.h"
		if _, err := os.Stat(headerPath); err != nil {
			headerPath = "backend/pkg/visualizer/visualizer.h"
		}
	}
	return headerPath
}

func runHandler(cppRunner *runner.CppRunner) http.HandlerFunc {
	return codeHandler(cppRunner, false)
}

func analyzeHandler(cppRunner *runner.CppRunner) http.HandlerFunc {
	return codeHandler(cppRunner, true)
}

func codeHandler(cppRunner *runner.CppRunner, analyze bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", http.MethodPost)
			handler.WriteError(w, http.StatusMethodNotAllowed, "Método não permitido")
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 256*1024)
		var req CodeRequest
		decoder := json.NewDecoder(r.Body)
		if err := decoder.Decode(&req); err != nil {
			handler.WriteError(w, http.StatusBadRequest, "JSON inválido ou código muito grande")
			return
		}
		if err := decoder.Decode(new(any)); err != io.EOF {
			handler.WriteError(w, http.StatusBadRequest, "O corpo deve conter apenas um objeto JSON válido")
			return
		}
		if strings.TrimSpace(req.Code) == "" {
			handler.WriteError(w, http.StatusBadRequest, "O campo code é obrigatório")
			return
		}
		if len(req.Stdin) > maxStdinBytes {
			handler.WriteError(w, http.StatusBadRequest, "A entrada (stdin) excede 64 KiB")
			return
		}
		if !req.TraceOptions.Valid() {
			handler.WriteError(w, http.StatusBadRequest, "trace_options permite até 10000 passos e 2048 elementos; os limites devem ser não negativos")
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if analyze {
			res := cppRunner.Analyze(r.Context(), req.Code)
			performanceLog.Info("cpp_analysis", "success", res.Success, "time_ms", res.TimeMs, "cache_hit", res.CacheHit)
			if !res.Success {
				w.WriteHeader(http.StatusUnprocessableEntity)
			}
			if err := json.NewEncoder(w).Encode(res); err != nil {
				log.Printf("falha ao escrever análise: %v", err)
			}
			return
		}
		res := cppRunner.RunWithOptions(req.Code, req.Stdin, req.TraceOptions)
		performanceLog.Info("cpp_run", "success", res.Success, "trace_mode", res.TraceMode, "metrics", res.Metrics)
		status := http.StatusOK
		if !res.Success {
			status = http.StatusUnprocessableEntity
		}

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Server-Timing", serverTiming(res.Metrics))
		w.WriteHeader(status)
		if err := json.NewEncoder(w).Encode(res); err != nil {
			log.Printf("falha ao escrever resposta: %v", err)
		}
	}
}

func main() {
	cppRunner := runner.NewCppRunner(resolveHeaderPath())
	cppRunner.CompileTimeout = time.Duration(envInt("RUNSPECT_COMPILE_TIMEOUT_SEC", 10)) * time.Second
	cppRunner.AnalysisTimeout = time.Duration(envInt("RUNSPECT_ANALYSIS_TIMEOUT_SEC", 30)) * time.Second
	cppRunner.CacheMaxBytes = envCacheLimit("RUNSPECT_BINARY_CACHE_MB", cppRunner.CacheMaxBytes>>20) << 20
	cppRunner.CacheMaxEntries = envCacheLimit("RUNSPECT_BINARY_CACHE_ENTRIES", cppRunner.CacheMaxEntries)
	cppRunner.AnalysisCacheMaxEntries = envCacheLimit("RUNSPECT_ANALYSIS_CACHE_ENTRIES", cppRunner.AnalysisCacheMaxEntries)
	cppRunner.CompileMemoryBytes = uint64(envInt("RUNSPECT_COMPILE_MEMORY_MB", int(cppRunner.CompileMemoryBytes>>20))) << 20

	if strings.EqualFold(os.Getenv("RUNSPECT_SANDBOX"), "off") {
		cppRunner.Sandbox = false
		log.Println("AVISO: sandbox desativado, use apenas em desenvolvimento local")
	}
	cppRunner.MaxEvents = envInt("RUNSPECT_MAX_EVENTS", cppRunner.MaxEvents)
	cppRunner.MemoryBytes = uint64(envInt("RUNSPECT_MEMORY_MB", int(cppRunner.MemoryBytes>>20))) << 20
	cppRunner.StackBytes = uint64(envInt("RUNSPECT_STACK_MB", int(cppRunner.StackBytes>>20))) << 20

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("/api/run", runHandler(cppRunner))
	mux.HandleFunc("/api/analyze", analyzeHandler(cppRunner))

	origins := strings.Split(
		envString("RUNSPECT_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"),
		",",
	)
	maxInFlight := envInt("RUNSPECT_MAX_CONCURRENT", max(1, runtime.NumCPU()/2))
	ratePerMinute := envInt("RUNSPECT_RATE_PER_MIN", 60)

	root := handler.Chain(
		mux,
		handler.CORS(origins),
		handler.RateLimit(ratePerMinute, 10),
		handler.MaxInFlight(maxInFlight),
	)

	server := &http.Server{
		Addr:              serverAddress(),
		Handler:           requestMetrics(root),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      cppRunner.AnalysisTimeout + 2*cppRunner.CompileTimeout + cppRunner.RunTimeout + 5*time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	done := make(chan struct{})
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
		close(done)
	}()

	log.Printf("Servidor rodando em http://%s", server.Addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
	<-done
}
