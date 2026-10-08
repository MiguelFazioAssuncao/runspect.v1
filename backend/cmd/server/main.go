package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/MiguelFazioAssuncao/runspect.v1/internal/handler"
	"github.com/MiguelFazioAssuncao/runspect.v1/internal/runner"
)

const maxStdinBytes = 64 * 1024

type CodeRequest struct {
	Code  string `json:"code"`
	Stdin string `json:"stdin"`
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
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", http.MethodPost)
			handler.WriteError(w, http.StatusMethodNotAllowed, "Método não permitido")
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 256*1024)
		var req CodeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			handler.WriteError(w, http.StatusBadRequest, "JSON inválido ou código muito grande")
			return
		}
		if req.Code == "" {
			handler.WriteError(w, http.StatusBadRequest, "O campo code é obrigatório")
			return
		}
		if len(req.Stdin) > maxStdinBytes {
			handler.WriteError(w, http.StatusBadRequest, "A entrada (stdin) excede 64 KiB")
			return
		}

		res := cppRunner.Run(req.Code, req.Stdin)
		status := http.StatusOK
		if !res.Success {
			status = http.StatusUnprocessableEntity
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		if err := json.NewEncoder(w).Encode(res); err != nil {
			log.Printf("falha ao escrever resposta: %v", err)
		}
	}
}

func main() {
	cppRunner := runner.NewCppRunner(resolveHeaderPath())

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
		Handler:           root,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      45 * time.Second,
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