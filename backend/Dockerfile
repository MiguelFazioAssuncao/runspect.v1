# syntax=docker/dockerfile:1.7

FROM golang:1.24-bookworm AS build
WORKDIR /src

COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal

ENV CGO_ENABLED=0 GOFLAGS=-trimpath
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    go build -ldflags="-s -w" -o /out/runspect ./cmd/server

# Toolchain and precompiled headers stay in an early stage so code changes do
# not invalidate the slow apt and g++ PCH layers.
FROM debian:bookworm-slim AS runtime-base

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
    && apt-get update \
    && apt-get install -y --no-install-recommends g++ bubblewrap util-linux ca-certificates python3-clang

WORKDIR /app
COPY pkg/visualizer/instrument_cpp.py pkg/visualizer/prepare_cpp_cache.py /tmp/compiler-tools/
RUN python3 -B /tmp/compiler-tools/prepare_cpp_cache.py /app/.compiler-cache \
    && rm -rf /tmp/compiler-tools

COPY pkg/visualizer/visualizer.h pkg/visualizer/automatic.h pkg/visualizer/instrument_cpp.py /app/pkg/visualizer/

ENV RUNSPECT_ADDR=0.0.0.0:8080 \
    RUNSPECT_VISUALIZER_HEADER=/app/pkg/visualizer/visualizer.h \
    RUNSPECT_CPP_CACHE=/app/.compiler-cache \
    RUNSPECT_ALLOWED_ORIGINS=https://miguelfazioassuncao.github.io \
    RUNSPECT_TRUST_PROXY=true \
    RUNSPECT_COMPILE_TIMEOUT_SEC=30 \
    RUNSPECT_ANALYSIS_TIMEOUT_SEC=30 \
    RUNSPECT_MAX_CONCURRENT=1 \
    RUNSPECT_BINARY_CACHE_MB=16 \
    RUNSPECT_BINARY_CACHE_ENTRIES=64 \
    RUNSPECT_ANALYSIS_CACHE_ENTRIES=64
EXPOSE 8080

FROM build AS benchmark-build
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    go build -ldflags="-s -w" -o /out/runspect-benchmark ./cmd/benchmark

FROM runtime-base AS benchmark
COPY internal/runner/testdata/deploy_bubble_sort.cpp internal/runner/testdata/kmp.cpp /app/internal/runner/testdata/
COPY --from=benchmark-build /out/runspect-benchmark /app/runspect-benchmark
COPY --from=build /out/runspect /app/runspect
CMD ["/app/runspect-benchmark"]

FROM runtime-base AS runtime
COPY --from=build /out/runspect /app/runspect
CMD ["/app/runspect"]
