# Multi-stage build for Go service
# Build context: PROJECT ROOT
#   docker build -f services/ingestion-go/Dockerfile -t cxmind/ie:test .
FROM golang:1.24-bookworm AS builder

WORKDIR /app

# Copy go.mod/go.sum for dependency caching
COPY services/ingestion-go/go.mod services/ingestion-go/go.sum* ./services/ingestion-go/
COPY tools/pcap-simulator/ ./tools/pcap-simulator/
WORKDIR /app/services/ingestion-go
RUN go mod download

# Install CGO dependencies (libpcap + opus for full SILK+CELT Opus decoding)
RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources || sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list && \
    apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpcap-dev libopus-dev libopusfile-dev pkg-config cmake git && \
    rm -rf /var/lib/apt/lists/*

# Build bcg729 from source (required by pidato/audio/g729 on arm64)
RUN git clone --depth 1 https://github.com/BelledonneCommunications/bcg729.git /tmp/bcg729 && \
    cd /tmp/bcg729 && \
    cmake -B build -DCMAKE_INSTALL_PREFIX=/usr -DENABLE_TESTS=OFF && \
    cmake --build build -j$(nproc) && \
    cmake --install build && \
    rm -rf /tmp/bcg729

# Copy full source
WORKDIR /app
COPY services/ingestion-go/ ./services/ingestion-go/
COPY tools/pcap-simulator/ ./tools/pcap-simulator/

WORKDIR /app/services/ingestion-go
RUN CGO_ENABLED=1 CGO_LDFLAGS="-lbcg729" go build -ldflags="-s -w -X github.com/cxmind/ingestion-go/internal/config.BuildMode=production" -o main .

# Final stage - Debian slim for native glibc (required by ONNX Runtime)
FROM debian:bookworm-slim

RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources || sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list && \
    apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libpcap0.8 libopus0 libopusfile0 curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /root/

# Download ONNX Runtime for Linux (host models/ only has macOS .dylib)
ARG ORT_VERSION=1.24.2
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "arm64" ]; then \
    ORT_ARCH="aarch64"; \
    else \
    ORT_ARCH="x64"; \
    fi && \
    mkdir -p /opt/onnxruntime && \
    curl -L -o /tmp/ort.tgz "https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}/onnxruntime-linux-${ORT_ARCH}-${ORT_VERSION}.tgz" && \
    tar xzf /tmp/ort.tgz -C /tmp && \
    cp /tmp/onnxruntime-*/lib/libonnxruntime.so /opt/onnxruntime/ && \
    rm -rf /tmp/ort.tgz /tmp/onnxruntime-*

# Copy binary from builder
COPY --from=builder /app/services/ingestion-go/main .
# Copy bcg729 shared library from builder
COPY --from=builder /usr/lib/libbcg729.so* /usr/lib/

# Copy config template
COPY services/ingestion-go/config.yaml.example config.yaml

ENV SER_MODELS_DIR=/root/models

# Copy ONNX Runtime .so into the (volume-mounted) models dir at startup, then start
CMD cp -f /opt/onnxruntime/libonnxruntime.so /root/models/ 2>/dev/null; exec ./main
EXPOSE 8081 9060/udp
