# CXMind — AI-Native Contact Center Intelligence

[![CI](https://github.com/Sonicwell/cxmind/actions/workflows/ci.yml/badge.svg)](https://github.com/Sonicwell/cxmind/actions/workflows/ci.yml)
[![License: BSL 1.1](https://img.shields.io/badge/License-BSL_1.1-blue.svg)](LICENSE)
[![Go Version](https://img.shields.io/badge/Go-1.24-00ADD8?logo=go)](ie/)

[English](README.md) · [中文](README.zh-CN.md)

> Open-source, non-invasive VoIP analytics engine. Deploy alongside your existing PBX — no changes required.

[CXMind](https://cxmi.ai) passively captures SIP/RTP traffic via HEP tapping, providing real-time call analytics, quality monitoring, and AI-powered agent assistance without disrupting your telephony infrastructure.

---

## ✨ Open-Source Components

| Component | Directory | Language | Description |
|-----------|-----------|----------|-------------|
| **Ingestion Engine (IE)** | [`ie/`](ie/) | Go | High-performance SIP/RTP packet processor with HEP v3 support |
| **Sniffer** | [`sniffer/`](sniffer/) | Go | Standalone network capture agent — forwards SIP/RTP as HEP to IE |
| **PCAP Simulator** | [`simulator/`](simulator/) | Go | VoIP traffic replay tool for development and testing |
| **Admin UI (AU)** | [`admin-ui/`](admin-ui/) | React | Real-time analytics dashboard and contact center management |
| **Copilot Extension** | [`copilot/`](copilot/) | React | AI agent-assist Chrome extension for live call coaching |

### 🔜 Coming Soon

| Component | Description | Status |
|-----------|-------------|--------|
| **CXAI** | On-premise speech emotion recognition & NLP microservice | In development |

> **App Server**: The AI orchestration backend is provided as a free Docker image (`cxmind/app-server:community`).

---

## 🏗️ Architecture

```
                        ┌─────────────┐
                        │  VoIP / PBX │
                        └──────┬──────┘
                               │ SIP + RTP
                    ┌──────────┼──────────┐
                    │          │          │
              ┌─────▼─────┐   │   ┌──────▼──────┐
              │  Sniffer   │   │   │  Sniffer    │  (optional: distributed)
              │  (on SIP)  │   │   │  (on RTP)   │
              └─────┬──────┘   │   └──────┬──────┘
                    │ HEP      │ HEP      │ HEP
                    └──────────┼──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Ingestion Engine   │
                    │       (Go)          │
                    └────┬──────────┬─────┘
                         │ Redis    │ SQL
                         │ Pub/Sub  │
                ┌────────▼───┐  ┌───▼──────────┐
                │ App Server │  │  ClickHouse  │
                │ (Docker)   │  │  (Analytics) │
                └────────────┘  └──────────────┘
```

**Key design principles:**
- **Non-invasive** — passive HEP tapping, zero changes to your PBX
- **Protocol-native** — SIP (UDP/TCP/TLS), RTP, RTCP, HEP v3
- **Horizontally scalable** — deploy multiple Sniffers across network segments
- **Privacy-first** — Edge PCI-DSS DTMF masking, with App Server PII sanitization

---

## 🚀 Quick Start

**Prerequisites**: Docker + Docker Compose v2

```bash
git clone https://github.com/Sonicwell/cxmind.git
cd cxmind
docker compose -f docker-compose.community.yml up -d
```

This starts the full stack: IE, App Server, ClickHouse, MongoDB, and Redis.

Access the Admin UI at **http://localhost:5173** (default: `admin@example.com` / `admin123`)

### Sending Test Traffic

```bash
cd simulator
go run . --count 5
```

---

## 📋 System Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8+ GB |
| Disk | 20 GB | 50+ GB (SSD) |
| OS | Linux (Ubuntu 22.04+, Rocky 9+) | — |
| Docker | 24.0+ | Latest |

> **Performance Benchmark**: In real-world PCAP stress tests, a single 4-core, 8GB instance of the Ingestion Engine (IE) can successfully process 300+ concurrent SIP/RTP calls (G.711 PCMA/PCMU) while maintaining CPU utilization under 60%.

---

## ⚙️ Configuration

| Component | Config File | Documentation |
|-----------|-------------|---------------|
| IE | `ie/config.yaml` | [IE Configuration Guide](ie/docs/CONFIG.md) |
| Sniffer | `sniffer/config.yaml` | [Sniffer README](sniffer/README.md) |
| Simulator | CLI flags | [Simulator README](simulator/README.md) |

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md).

```bash
# Fork → Clone → Branch → Commit → PR
git checkout -b feat/your-feature
git commit -m "feat(ie): your change description"
```

**Commit scopes**: `ie`, `sniffer`, `sim`, `docs`, `infra`

---

## 📄 License

Licensed under the **Business Source License 1.1 (BSL)**.

| | |
|---|---|
| ✅ | Free for non-production and internal production use |
| ❌ | Cannot be used to offer a competing commercial hosted service |
| 🔄 | Converts to **Apache License 2.0** on 2030-02-22 |

See [LICENSE](LICENSE) for full details.

---

## 💬 Community & Support

- 📋 [GitHub Issues](https://github.com/Sonicwell/cxmind/issues) — Bug reports & feature requests
- 📖 [Documentation](https://cxmi.ai/docs/)
- 🌐 [Website](https://cxmi.ai)

---

*Built with ❤️ by the [CXMind Team](https://cxmi.ai)*
