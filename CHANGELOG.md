# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-03-13

### Fixed

**App Server (AS)**
* Fix intermittent `ECONNRESET` on ClickHouse queries by reverting `socket_ttl` from 60s to 2.5s (must be < server `keep_alive_timeout`)
* Fix `DateTime64` TTL expressions incompatible with ClickHouse 24.12.6.70 (`toDateTime → toDate`)
* Add missing `initAgentStatusLogTable()` to server startup initialization

**Infrastructure**
* Pin ClickHouse image to exact patch version `24.12.6.70` across all docker-compose files to prevent automatic upgrades causing data incompatibility
* Add `deploy/clickhouse/custom-config.xml` with `keep_alive_timeout=120` (mounted via docker-compose)
* Update `ENVIRONMENT_STANDARDS.md` and `CLICKHOUSE_QUERY_GUIDE.md` with version pinning policy, connection pool golden rule, and upgrade migration guide

## [1.0.0] - 2026-03-09

### Added

**Ingestion Engine (IE)**
* HEP v3 SIP/SDP packet parsing with port-aware direction detection
* Dual-stream RTP/SRTP audio capture with DTMF PCI-DSS masking
* ASR integration (Alibaba DashScope) with pre-connection pool and reconnection
* Speech Emotion Recognition (SER) via wav2vec2 split-stream analysis
* TextFilter NLP pipeline with intent/entity extraction
* Sniffer mode for passive network monitoring (libpcap)
* PCAP recording with configurable retention policies
* SIPREC recording support for enterprise PBX integration
* High-concurrency optimization: 5000+ simultaneous call handling
* Batch Writer for high-performance ClickHouse persistence

**App Server (AS)**
* WebSocket Gateway with Redis Pub/Sub for real-time event broadcasting
* Real-time Monitoring Service with configurable alert thresholds
* Quality Inspector with automated scoring and compliance checking
* AI Suggestion Engine with LLM integration (OpenAI/Azure/Anthropic/DeepSeek)
* RAG pipeline with Qdrant vector storage and local MiniLM embeddings
* CRM Webhook integration with retry and batching
* Billing & License management with seat-based enforcement
* WFM (Workforce Management) with shift scheduling and forecasting
* Report Scheduler for automated CSV/PDF distribution
* Omnichannel Inbox with email (IMAP), webchat, and API channels
* SOP (Standard Operating Procedures) library with AI-powered suggestions
* Contact Management with auto-creation, merging, and 360° timeline
* Audit logging across 9 tables with CSV/PDF export
* Demo Mode with mock data isolation for sales demonstrations

**Admin UI (AU)**
* Glassmorphism-themed dashboard with 35 configurable widgets
* Real-time Agent Map with geographic visualization
* Analytics pages: SLA, NER, Outcome, Emotion, Duration Distribution
* Quality Inspection management with rule configuration
* Multi-theme support: Light, Dark, Midnight, Cyberpunk, Forest
* Internationalization: English, Chinese, Japanese, Korean, Arabic, Spanish
* Module-gated navigation with license-aware sidebar
* Agent role view with scoped data access
* Responsive layout with drag-and-drop widget management

**Copilot Extension (Chrome)**
* Real-time transcription SidePanel with AI suggestions
* Picture-in-Picture (PiP) HUD for call monitoring
* Omnichannel Inbox integration within extension
* WebLLM preloading for offline AI capabilities
* SOP synchronization from backend

**AI Services (SER)**
* Speech Emotion Recognition with wav2vec2 ONNX inference
* TextFilter multi-vendor NLP (OpenAI/Azure/Anthropic/DeepSeek/Volcengine)
* RAG document ingestion with Qdrant vector indexing
* Sentiment analysis for call quality scoring

**Infrastructure**
* ClickHouse data layer with `sip_calls_v` materialized view
* MongoDB for configuration, contacts, and conversations
* Redis for caching, Pub/Sub, and session management
* Qdrant for vector storage (RAG/embeddings)
* Docker Compose full-stack deployment
* CI/CD pipeline with Docker-sandboxed testing (8-step)
* Module-independent release tagging (`{module}-vX.Y.Z`)
* Bytenode V8 bytecode protection for AS distribution
* API contract validation (`check-api-contract.sh`)
* Leak scanning for open-source repository safety

### Security

* SQL injection prevention: all ClickHouse queries use parameterized `query_params`
* XSS protection: `sanitizeHtml()` on all `dangerouslySetInnerHTML` usage
* RBAC: 6 roles, 20 permissions, `requirePermission` middleware
* Rate limiting: global 3000/15min/IP + stricter auth/webchat limits
* PCI-DSS: DTMF digit suppression in PCAP recordings
* Command injection prevention: `execFile` + input whitelist validation
* Path traversal prevention: `path.resolve` + separator-suffix check
* HTTP security headers via `helmet()` + CORS
* WebSocket token authentication with 1008 close code handling
* Ghost call auto-cleanup (4-hour timeout)

### Testing

* AS: 167 test suites, 1837+ tests (routes/services/middleware/models/utils)
* IE: `go test -race` with integration snapshots
* AU: Dashboard/Component Vitest tests
* E2E: 25 scenario scripts covering auth, API, WebSocket, RBAC, security
* AU Playwright: 42+ E2E specs for UI flows

---

*This is the first public release of CXMind, an AI-powered intelligent customer experience platform.*
