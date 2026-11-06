# Runspect

Runspect runs C++17 competitive programming solutions and records each step so you can inspect vectors, graphs, matrices, recursion trees, struct instances, and standard output on a timeline.

I built this because debugging graph traversals and dynamic programming tables with `cout` gets tedious fast. Instead of reading raw text dumps, you run the code and step forward or backward through the recorded state transitions.

Live instance: https://miguelfazioassuncao.github.io/runspect.v1/

The public backend runs on a free Render container. If it has been idle, the first request takes a few extra seconds while the container starts.

## Repository layout

- [`frontend/`](./frontend/README.md): Next.js 16 interface, Monaco editor, trace reducers, D3 graph canvas, and study catalog.
- [`backend/`](./backend/README.md): Go HTTP server, libclang AST instrumenter (`instrument_cpp.py`), C++17 trace headers (`visualizer.h`, `automatic.h`), and `bubblewrap` execution sandbox.
- [`render.yaml`](./render.yaml): Render blueprint for the Dockerized backend.
- [`.github/workflows/`](./.github/workflows): CI for the Go backend and static deployment to GitHub Pages.

## How it works

When you click **Executar Algoritmo** (or press `Ctrl+Enter` / `Cmd+Enter`), the frontend sends the C++17 source and `stdin` to the Go backend:

1. A Python script using `libclang` parses the translation unit to identify local containers, graph adjacency lists, DP tables, and loop variables.
2. The instrumenter rewrites the source to emit trace events through `visualizer.h` and `automatic.h` without changing standard output. If a construct cannot be instrumented automatically, the backend falls back to plain execution or explicit `viz::` calls.
3. `g++` compiles the instrumented source against a precompiled `bits/stdc++.h` header. Compiled binaries and analysis results are cached in memory (LRU).
4. The binary runs inside an unprivileged `bubblewrap` namespace with `prlimit` caps (3 seconds of wall time, 512 MiB of address space, 64 KiB of `stdin`, no network).
5. The server streams the gzip-compressed JSON trace back to the browser, which reconstructs the state at each step.

## Running locally

You need Linux (or WSL2 on Windows) for the backend because `bubblewrap` relies on Linux user namespaces.

Dependencies:
- Node.js 22+ and npm
- Go 1.24+
- `g++` with C++17 support
- `python3` and `python3-clang`
- `bubblewrap` and `util-linux` (`prlimit`)

On Debian or Ubuntu:

```sh
sudo apt install g++ python3-clang bubblewrap util-linux
```

Start the backend on `127.0.0.1:8080`:

```sh
cd backend
go run ./cmd/server
```

In a second terminal, install frontend dependencies and start the dev server on `http://localhost:3000`:

```sh
cd frontend
npm ci
npm run dev
```

You can also run `npm run dev`, `npm test`, `npm run lint`, and `npm run build` directly from the repository root.

In development mode, Next.js proxies `/api/*` and `/healthz` to `http://127.0.0.1:8080`. If your kernel blocks unprivileged user namespaces, you can start the backend with `RUNSPECT_SANDBOX=off` for local testing with trusted code only.

## Workspace and study mode

The interface is in Portuguese and has two main tabs:

- **seu código**: scratchpad for your own C++17 programs.
- **técnicas**: 35 reference implementations grouped into five study tracks (fundamentals, sorting/searching, graphs, dynamic programming, and advanced structures). Each technique includes a short study guide covering when to apply it, what to watch in the trace, common off-by-one or overflow bugs, and a small modification to try.

Drafts, custom `stdin`, and completed techniques are saved to `localStorage` 400 ms after you stop typing. You can export the entire workspace to a JSON file (up to 512 KiB) and load it back later.

## Configuration

| Variable | Description | Default |
| --- | --- | --- |
| `RUNSPECT_API_URL` | Backend target for the Next.js dev proxy | `http://127.0.0.1:8080` |
| `NEXT_PUBLIC_RUNSPECT_API_URL` | Public backend URL baked into the static export | empty (same origin) |
| `NEXT_PUBLIC_BASE_PATH` | URL path prefix for static hosting (e.g. `/runspect.v1`) | empty |
| `GITHUB_PAGES` | Set to `true` to export static HTML to `frontend/out` | unset |
| `RUNSPECT_ADDR` | Backend listen address | `127.0.0.1:8080` |
| `PORT` | Listen port when `RUNSPECT_ADDR` is not set | unset |
| `RUNSPECT_ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins | `http://localhost:3000,http://127.0.0.1:3000` |
| `RUNSPECT_TRUST_PROXY` | Set to `true` behind a reverse proxy to rate-limit by `X-Forwarded-For` | `false` |
| `RUNSPECT_RATE_PER_MIN` | Max execution requests per minute per client IP | `60` |
| `RUNSPECT_MAX_CONCURRENT` | Max parallel compilations/executions | half of available CPUs (min 1) |
| `RUNSPECT_COMPILE_TIMEOUT_SEC` | Timeout per `g++` invocation in seconds | `30` |
| `RUNSPECT_ANALYSIS_TIMEOUT_SEC` | Timeout for the Clang analysis pass in seconds | `30` |
| `RUNSPECT_SANDBOX` | Set to `off` to skip `bubblewrap` (local development only) | enabled |

## Testing

Frontend lint, type-check, and unit tests:

```sh
cd frontend
npm run lint
npx tsc --noEmit
npm test
```

Backend unit and integration tests:

```sh
cd backend
go test ./...
```

To run the full C++ catalog against the real compiler and instrumenter:

```sh
cd frontend
RUNSPECT_TEST_AUTOMATIC=1 npm run test:cpp
```

## Deployment

The frontend deploys to GitHub Pages through `.github/workflows/deploy-pages.yml` whenever files under `frontend/` change on `main` or `v1`. The workflow caches `.next/cache`, strips unused Monaco language workers (TypeScript, CSS, HTML, JSON) during `prebuild`, and publishes `frontend/out`. To point a fork at your own backend, set the `RUNSPECT_API_URL` repository variable in GitHub Actions settings.

The backend deploys to Render as a Docker service defined in `render.yaml` and `backend/Dockerfile`. The Dockerfile precompiles `bits/stdc++.h` at image build time so cold compilations on Render do not parse the standard library headers from scratch on every request.

## Author

[Miguel Fazio](https://github.com/MiguelFazioAssuncao)
