# CXMind — AI 原生智能联络中心平台

[![CI](https://github.com/Sonicwell/cxmind/actions/workflows/ci.yml/badge.svg)](https://github.com/Sonicwell/cxmind/actions/workflows/ci.yml)
[![License: BSL 1.1](https://img.shields.io/badge/License-BSL_1.1-blue.svg)](LICENSE)
[![Go Version](https://img.shields.io/badge/Go-1.24-00ADD8?logo=go)](ie/)

[English](README.md) · [中文](README.zh-CN.md)

> 开源、非侵入式 VoIP 分析引擎。无需修改现有 PBX，部署即用。

[CXMind](https://cxmi.ai) 通过 HEP 被动抓包采集 SIP/RTP 流量，提供实时通话分析、质量监控和 AI 坐席辅助能力，不对电话系统架构产生任何侵入。

---

## ✨ 开源组件

| 组件 | 目录 | 语言 | 说明 |
|------|------|------|------|
| **采集引擎 (IE)** | [`ie/`](ie/) | Go | 高性能 SIP/RTP 报文处理器，支持 HEP v3 |
| **嗅探器 (Sniffer)** | [`sniffer/`](sniffer/) | Go | 独立网络抓包代理，将 SIP/RTP 以 HEP 格式转发至 IE |
| **流量模拟器** | [`simulator/`](simulator/) | Go | VoIP 流量回放工具，用于开发与测试 |

### 🔜 即将开源

| 组件 | 说明 | 状态 |
|------|------|------|
| **管理后台 (Admin UI)** | React 实时分析看板 | 开发中 |
| **Copilot 扩展** | Chrome AI 坐席辅助插件，实时通话指导 | 开发中 |
| **CXAI** | 本地化语音情感识别 & NLP 微服务 | 开发中 |

> **应用服务器**：AI 编排后端以免费 Docker 镜像形式提供 (`cxmind/app-server:community`)。

---

## 🏗️ 系统架构

```
                        ┌─────────────┐
                        │  VoIP / PBX │
                        └──────┬──────┘
                               │ SIP + RTP
                    ┌──────────┼──────────┐
                    │          │          │
              ┌─────▼─────┐   │   ┌──────▼──────┐
              │  Sniffer   │   │   │  Sniffer    │  (可选：分布式部署)
              │  (SIP 侧)  │   │   │  (RTP 侧)   │
              └─────┬──────┘   │   └──────┬──────┘
                    │ HEP      │ HEP      │ HEP
                    └──────────┼──────────┘
                               │
                    ┌──────────▼──────────┐
                    │     采集引擎 (IE)    │
                    │       (Go)          │
                    └────┬──────────┬─────┘
                         │ Redis    │ SQL
                         │ Pub/Sub  │
                ┌────────▼───┐  ┌───▼──────────┐
                │ App Server │  │  ClickHouse  │
                │ (Docker)   │  │  (分析存储)   │
                └────────────┘  └──────────────┘
```

**核心设计理念：**
- **非侵入式** — 被动 HEP 抓包，PBX 零改动
- **协议原生** — SIP (UDP/TCP/TLS)、RTP、RTCP、HEP v3
- **水平扩展** — 支持跨网段部署多个 Sniffer 实例
- **隐私优先** — 内置 PCI-DSS DTMF 脱敏、PII 清洗

---

## 🚀 快速开始

**前置条件**：Docker + Docker Compose v2

```bash
git clone https://github.com/Sonicwell/cxmind.git
cd cxmind
docker compose -f docker-compose.community.yml up -d
```

启动完整技术栈：IE、App Server、ClickHouse、MongoDB、Redis。

访问管理后台：**http://localhost:5173**（默认账号 `admin@example.com` / `admin123`）

### 发送测试流量

```bash
cd simulator
npm install
node simulator.js --target 127.0.0.1:9060 --file samples/demo.pcap
```

---

## 📋 系统要求

| 资源 | 最低配置 | 推荐配置 |
|------|---------|---------|
| CPU | 2 核 | 4+ 核 |
| 内存 | 4 GB | 8+ GB |
| 磁盘 | 20 GB | 50+ GB (SSD) |
| 操作系统 | Linux (Ubuntu 22.04+, Rocky 9+) | — |
| Docker | 24.0+ | 最新版 |

---

## ⚙️ 配置说明

| 组件 | 配置文件 | 文档 |
|------|---------|------|
| IE | `ie/config.yaml` | [IE 配置指南](ie/docs/CONFIG.md) |
| Sniffer | `sniffer/config.yaml` | [Sniffer README](sniffer/README.md) |
| 模拟器 | CLI 参数 | [Simulator README](simulator/README.md) |

---

## 🤝 参与贡献

欢迎贡献代码！请参阅 [贡献指南](CONTRIBUTING.md)。

```bash
# Fork → Clone → Branch → Commit → PR
git checkout -b feat/your-feature
git commit -m "feat(ie): your change description"
```

**Commit scope 规范**：`ie`、`sniffer`、`sim`、`docs`、`infra`

---

## 📄 许可证

本项目使用 **Business Source License 1.1 (BSL)** 许可证。

| | |
|---|---|
| ✅ | 非生产环境和内部生产环境免费使用 |
| ❌ | 不可用于提供竞争性的商业托管服务 |
| 🔄 | 2030-02-22 自动转为 **Apache License 2.0** |

详见 [LICENSE](LICENSE)。

---

## 💬 社区与支持

- 📋 [GitHub Issues](https://github.com/Sonicwell/cxmind/issues) — Bug 反馈与功能建议
- 📖 [文档中心](https://docs.cxmi.ai)
- 💬 [Discord](https://discord.gg/cxmind)
- 🌐 [官网](https://cxmi.ai)

---

*由 [CXMind 团队](https://cxmi.ai) 用 ❤️ 构建*
