# CXMind Admin UI (AU)

[![License: BSL 1.1](https://img.shields.io/badge/License-BSL_1.1-blue.svg)](../../LICENSE)

> Modern analytics dashboard for real-time VoIP monitoring, AI-powered insights, and contact center management.

<p align="center">
  <img src="public/cxmi_logo_full.svg" alt="CXMind" width="200" />
</p>

---

## ✨ Features

- **Real-time Call Monitoring** — Live audio playback, bidirectional transcription, and quality metrics (MOS, jitter, packet loss)
- **Agent Map** — 3D isometric / 2D top-down live floor view with WebGL rendering (React Three Fiber), real-time agent status, zone editing, and TV mode
- **Configurable Dashboard** — Drag-and-drop widget system with bin-packing layout, preset views (Overview, Network QoS, Sales Intelligence), and module-aware filtering
- **Analytics** — SLA monitoring, KPI trends, outcome intelligence, behavior analytics (stress score, talk ratio), and ROI tracking
- **Multi-Theme System** — 5 built-in themes: Light, Dark, Midnight, Cyberpunk, Forest — with CSS Variables and FOUC prevention
- **Module Management** — Enable/disable 19 pluggable modules (8 core + 11 optional) from the Settings panel
- **Omnichannel Inbox** — Manage WhatsApp, LINE, KakaoTalk, WeChat, Email conversations from a unified view
- **Quality Inspector** — Rule-based + LLM-powered quality scoring with industry templates
- **Audit Dashboard** — Comprehensive audit trail with timeline visualization
- **AI Assistant** — Built-in LLM chat with 9 tool integrations (analytics query, agent search, knowledge search, etc.)
- **i18n** — English, Chinese (简体中文), Japanese (日本語)
- **Demo Mode** — Full system demonstration with mock data and TTS audio

---

## 🛠 Tech Stack

| Category | Technologies |
|----------|-------------|
| **Framework** | React 19, TypeScript, Vite |
| **3D Rendering** | React Three Fiber, Drei, Three.js (WebGL) |
| **Charts** | Recharts, D3 |
| **Real-time** | Socket.IO Client |
| **Internationalization** | react-i18next (3 languages) |
| **Styling** | Vanilla CSS (CSS Variables, 5 themes) |
| **Flow Editor** | XYFlow (React Flow) |
| **Animation** | Framer Motion |
| **Testing** | Vitest (unit) + Playwright (E2E) |

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open **http://localhost:5173** and log in:
- Admin: `admin@cxmi.ai` / `admin123`
- Agent: `agent@cxmi.ai` / `admin123`

> Requires the App Server (AS) running at `http://localhost:3000`. See the root [README](../../README.md) for full stack setup.

---

## 📁 Project Structure

```
src/
├── pages/          # Route-level page components (89 files)
├── components/     # Reusable UI components (238 files)
│   ├── ui/         # Base primitives (Button, Table, Input, Modal...)
│   ├── guards/     # Route guards (ModuleRoute)
│   └── settings/   # Settings panel components
├── context/        # React Contexts (Auth, Module, Theme, Dashboard...)
├── dashboard/      # Widget registry and grid layout system
├── layouts/        # DashboardLayout, SettingsLayout
├── hooks/          # Custom hooks (13 files)
├── i18n/           # Translation files (en, zh, ja)
├── services/       # API client and service layer
├── styles/         # CSS modules and theme definitions
├── types/          # TypeScript type definitions
├── utils/          # Utility functions
└── workers/        # Web Workers
```

---

## 🏗 Build & Deploy

```bash
# Production build
npm run build

# Preview production build locally
npm run preview
```

The `dist/` output can be served via Nginx or any static file server. Docker builds are also supported:

```bash
docker build -f Dockerfile.au -t cxmind-admin-ui .
```

---

## 🧪 Testing

```bash
# Unit tests (Vitest)
npm test

# E2E tests (Playwright)
npm run test:e2e
```

---

## ⚙️ Configuration

The AU connects to the App Server via the `VITE_API_BASE_URL` environment variable (defaults to `http://localhost:3000/api`).

For Docker/Nginx deployments, the API URL is proxied through Nginx — see `nginx.conf`.

---

## 📄 License

Business Source License 1.1 (BSL) — see [LICENSE](../../LICENSE).
