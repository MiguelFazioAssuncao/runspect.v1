package handler

import (
	"encoding/json"
	"math"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

func WriteError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": false,
		"steps":   []any{},
		"errors":  message,
		"error":   message,
		"time_ms": 0,
	})
}

func Chain(h http.Handler, middlewares ...func(http.Handler) http.Handler) http.Handler {
	for i := len(middlewares) - 1; i >= 0; i-- {
		h = middlewares[i](h)
	}
	return h
}

func CORS(allowed []string) func(http.Handler) http.Handler {
	set := make(map[string]struct{}, len(allowed))
	for _, origin := range allowed {
		if origin = strings.TrimSpace(origin); origin != "" {
			set[origin] = struct{}{}
		}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Vary", "Origin")
			w.Header().Set("X-Content-Type-Options", "nosniff")

			origin := r.Header.Get("Origin")
			if origin != "" {
				if _, ok := set[origin]; !ok {
					WriteError(w, http.StatusForbidden, "Origem não permitida")
					return
				}
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			}

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

type bucket struct {
	tokens float64
	last   time.Time
}

func RateLimit(perMinute, burst int) func(http.Handler) http.Handler {
	rate := float64(perMinute) / 60
	capacity := float64(burst)

	var mu sync.Mutex
	buckets := make(map[string]*bucket)

	allow := func(key string, now time.Time) (bool, time.Duration) {
		mu.Lock()
		defer mu.Unlock()

		if len(buckets) > 4096 {
			for k, b := range buckets {
				if now.Sub(b.last) > 10*time.Minute {
					delete(buckets, k)
				}
			}
		}

		b, ok := buckets[key]
		if !ok {
			b = &bucket{tokens: capacity, last: now}
			buckets[key] = b
		}
		b.tokens = math.Min(capacity, b.tokens+now.Sub(b.last).Seconds()*rate)
		b.last = now

		if b.tokens >= 1 {
			b.tokens--
			return true, 0
		}
		wait := time.Duration((1 - b.tokens) / rate * float64(time.Second))
		return false, wait
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key, _, err := net.SplitHostPort(r.RemoteAddr)
			if err != nil {
				key = r.RemoteAddr
			}
			ok, wait := allow(key, time.Now())
			if !ok {
				w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(wait.Seconds()))))
				WriteError(w, http.StatusTooManyRequests, "Muitas execuções seguidas, aguarde um instante")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func MaxInFlight(n int) func(http.Handler) http.Handler {
	slots := make(chan struct{}, n)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			select {
			case slots <- struct{}{}:
				defer func() { <-slots }()
				next.ServeHTTP(w, r)
			default:
				w.Header().Set("Retry-After", "1")
				WriteError(w, http.StatusServiceUnavailable, "Servidor ocupado, tente novamente em instantes")
			}
		})
	}
}