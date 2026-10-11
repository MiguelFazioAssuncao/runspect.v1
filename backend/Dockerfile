FROM golang:1.24-bookworm AS build


WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/runspect ./cmd/server
RUN CGO_ENABLED=0 go build -o /out/runspect-benchmark ./cmd/benchmark

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends g++ bubblewrap util-linux ca-certificates python3-clang \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pkg/visualizer/instrument_cpp.py pkg/visualizer/prepare_cpp_cache.py /app/compiler-tools/
RUN python3 -B /app/compiler-tools/prepare_cpp_cache.py /app/.compiler-cache \
    && rm -rf /app/compiler-tools
COPY --from=build /out/runspect /app/runspect
COPY --from=build /out/runspect-benchmark /app/runspect-benchmark
COPY pkg /app/pkg
COPY internal/runner/testdata/deploy_bubble_sort.cpp internal/runner/testdata/kmp.cpp /app/internal/runner/testdata/

ENV RUNSPECT_ADDR=0.0.0.0:8080
ENV RUNSPECT_VISUALIZER_HEADER=/app/pkg/visualizer/visualizer.h
ENV RUNSPECT_ALLOWED_ORIGINS=https://miguelfazioassuncao.github.io
ENV RUNSPECT_COMPILE_TIMEOUT_SEC=30
ENV RUNSPECT_ANALYSIS_TIMEOUT_SEC=30
ENV RUNSPECT_MAX_CONCURRENT=1
ENV RUNSPECT_BINARY_CACHE_MB=16
ENV RUNSPECT_BINARY_CACHE_ENTRIES=64
ENV RUNSPECT_ANALYSIS_CACHE_ENTRIES=64
ENV RUNSPECT_CPP_CACHE=/app/.compiler-cache
EXPOSE 8080
CMD ["/app/runspect"]

