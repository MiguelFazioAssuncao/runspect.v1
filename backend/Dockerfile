FROM golang:1.24-bookworm AS build


WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/runspect ./cmd/server

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends g++ bubblewrap util-linux ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /out/runspect /app/runspect
COPY pkg /app/pkg

ENV RUNSPECT_ADDR=0.0.0.0:8080
ENV RUNSPECT_VISUALIZER_HEADER=/app/pkg/visualizer/visualizer.h
ENV RUNSPECT_ALLOWED_ORIGINS=https://runspect-v1.vercel.app
EXPOSE 8080
CMD ["/app/runspect"]


