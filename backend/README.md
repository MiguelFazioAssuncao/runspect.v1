# Runspect Backend

Go service that analyzes, instruments, compiles, and runs C++17 programs inside a Linux sandbox.

## Directory structure

- `cmd/server`: HTTP API server (`/api/analyze`, `/api/run`, `/healthz`).
- `cmd/benchmark`: CLI tool for measuring compile times, cache hits, and sandbox overhead across representative C++ programs.
- `internal/domain`: request/response structs and trace event types.
- `internal/handler`: HTTP routing, CORS, per-IP token bucket rate limiter, and pooled `gzip` response compression.
- `internal/runner`: `g++` driver, `libclang` invocation, in-memory LRU caches for analysis and compiled binaries, and `bubblewrap` execution.
- `pkg/visualizer`:
  - `visualizer.h`: header for explicit `viz::` trace calls.
  - `automatic.h`: runtime helpers injected during automatic instrumentation.
  - `instrument_cpp.py`: Python script using `python3-clang` to inspect the AST and inject trace hooks.
  - `prepare_cpp_cache.py`: precompiles `bits/stdc++.h` during Docker image builds.

## HTTP endpoints

### `POST /api/analyze`

Accepts JSON with `code` (string) and returns which visualization panels apply to the program (`vectors`, `graphs`, `matrices`, `calls`, `structs`), along with any syntax or instrumentation diagnostics.

### `POST /api/run`

Accepts `code`, `stdin`, and optional trace options. Compiles the program, executes it with `stdin`, and returns captured `stdout`, `stderr`, execution timing metrics, and the list of visual trace steps.

### `GET /healthz`

Returns `200 OK` (`{"status":"ok"}`). Used by the frontend topbar indicator and Render health checks.

## Sandbox and limits

Untrusted binaries run inside `bwrap` (`bubblewrap`) with:
- Read-only bind mounts for `/usr`, `/lib`, and `/lib64`
- Isolated `/tmp`, PID, IPC, UTS, and network namespaces (`--unshare-all`)
- `prlimit` caps: 3 seconds CPU/wall time, 512 MiB virtual memory, 64 KiB `stdin`

If a program crashes or hits the time limit, the runner still returns the partial `stdout` and all trace steps emitted before termination.

## Running and testing

Start the server locally:

```sh
go run ./cmd/server
```

Run all tests:

```sh
go test -v ./...
```

Run the compilation benchmark:

```sh
go run ./cmd/benchmark
```

Build the production container:

```sh
docker build -t runspect-backend .
```
