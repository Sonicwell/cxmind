# CXMind Ingestion Engine (IE)

High-performance SIP/RTP packet capture and audio processing engine, built in Go.

## Overview

The Ingestion Engine is the data collection backbone of CXMind. It passively captures SIP signaling and RTP audio via HEP (Homer Encapsulation Protocol), performs real-time speech recognition, and publishes events to Redis for downstream services.

## Key Features

- **Multi-codec RTP Processing**: G.711 μ-law/A-law, G.722, G.729, Opus (dynamic PT via SDP)
- **Pre-connection ASR**: Establishes ASR WebSocket on INVITE to minimize first-word latency
- **Connection Pooling**: Efficient WebSocket pool to DashScope/FunASR/Azure/Google/Deepgram/OpenAI with health checks
- **ClickHouse Analytics**: Batched writes of SIP events, call states, and quality metrics
- **PCAP Recording**: Full bidirectional call recording with stereo separation
- **RTCP Quality Metrics**: Jitter, packet loss, MOS scoring from Sender/Receiver Reports
- **SIPREC Support**: Native SIP over TCP for recording sessions (RFC 7866), multipart MIME, multi-stream SDP
- **PCI-DSS Compliance**: DTMF suppression (RFC 4733), recording pause/resume API, policy-based retention
- **Built-in Sniffer Mode**: Optional libpcap-based passive capture (alternative to HEP)
- **SRTP Decryption**: Decrypt SRTP streams for processing
- **VAD**: Voice Activity Detection (RMS + Silero ONNX)
- **SER**: Speech Emotion Recognition (wav2vec2 XLSR ONNX, embedded or remote gRPC)
- **Schema Migrations**: Automatic ClickHouse schema evolution on startup

## Performance

### Design Capacity

| Dimension | Capacity | Mechanism |
|-----------|----------|-----------|
| Concurrent calls | **50,000** (bench-verified) | `sync.Map` listeners, lockless hot paths |
| UDP packets/sec | **250,000+** | Configurable semaphore, zero-copy passthrough |
| TCP connections | **5,000** (configurable) | Atomic `ConnectionLimiter` |
| ASR WebSocket pool | **20–10,000** | Dynamic scaling + circuit breaker |
| PCAP recorders | **6,000** max | Atomic counter, async disk writer |
| ClickHouse writes | **Batched** (100 rows / 5s) | `GenericBatchWriter[T]` |

### Benchmark Results

Tested on **Apple M4 (10 cores, arm64)**:

| Benchmark | ops/sec | Latency | Memory |
|-----------|---------|---------|--------|
| Concurrent streams (10K × 100 r/w) | 93 | 10.7 ms | ~3 MB heap |
| Concurrent streams (50K × 100 r/w) | 24 | 53.6 ms | ~9 MB heap |
| SIP message parsing | 1.84M | 629 ns/op | 1.7 KB/op |
| SRTP decryption (AES-128-CM) | 3.78M | 325 ns/op | 332 B/op |
| µ-law / A-law decode (160 samples) | 27M | 44 ns/op | **0 alloc** |
| G.722 → PCM16k decode | 368K | 3.5 µs/op | 320 B/op |
| RTP lock contention test | 42.7M | 28.6 ns/op | **0 alloc** |
| Session manager concurrent updates | 5.5M | 192 ns/op | 128 B/op |

> Concurrent streams scale linearly: 50K takes ~5× the time of 10K with no lock degradation. The bottleneck is NIC and CPU, not locks or memory.

### Memory Safety

| Component | Bound |
|-----------|-------|
| HTTP upload | `MaxBytesReader` (10 MB hard limit) |
| UDP buffer | 65,535 bytes per packet |
| PCAP queue | 100 packets/channel (bounded) |
| Event publisher | Bounded channel (configurable) |
| Jitter buffer | Max depth = configured packets |

## Configuration

Configuration is loaded from `/etc/cxmind/config.yaml` (production) or `config/config.yaml` (development).

Key sections:
```yaml
hep:
  port: 9060               # HEP listener (UDP)
http:
  port: 8081               # API + health check
asr:
  provider: dashscope      # dashscope | funasr
clickhouse:
  dsn: "clickhouse://..."
redis:
  addr: "localhost:6379"
```

## HTTP API

Port `8081` (configurable via `http.port`):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/asr/enable` | POST | Enable ASR for a call |
| `/api/asr/disable` | POST | Disable ASR for a call |
| `/api/asr/status` | GET | Query ASR status |
| `/api/monitoring/update` | POST | Update monitoring state |
| `/api/config/reload` | POST | Hot-reload configuration |

## Development

### Prerequisites
- Go 1.24+
- `libpcap-dev` (Linux) or `libpcap` (macOS via Homebrew)
- Redis, ClickHouse

### GeoIP Setup (Optional)

IE uses MaxMind GeoLite2-City for IP geolocation. Without it, GeoIP fields will be empty (non-breaking).

```bash
# 1. Register at https://www.maxmind.com/en/geolite2/signup (free)
# 2. Generate License Key at https://www.maxmind.com/en/accounts/current/license-key
# 3. Run from project root:
MAXMIND_LICENSE_KEY=your_key ./scripts/download-geoip.sh
```

The database is installed to `services/ingestion-go/config/GeoLite2-City.mmdb` and is gitignored.

### Build and Run
```bash
go mod download
go build -o ie .
./ie
```

### Testing
```bash
go test -v -cover ./...
```

## Architecture

```
HEP/UDP:9060 ──► SIP Parser ──► Call Session Manager
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
              RTP Listener      ClickHouse Batcher   Redis Publisher
                    │                                     │
                    ▼                                     ▼
              ASR WebSocket                        App Server (AS)
                    │
                    ▼
              Transcription → Redis Pub/Sub
```
