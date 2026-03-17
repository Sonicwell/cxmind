# CXMind Copilot

[![License: BSL 1.1](https://img.shields.io/badge/License-BSL_1.1-blue.svg)](../LICENSE)

> AI-powered Chrome extension that provides real-time agent assistance during live calls.

---

## ✨ Features

- **Live Transcription Overlay** — Real-time speech-to-text display on any CRM/ticketing page
- **AI Suggestions** — Context-aware response recommendations based on conversation flow
- **Customer Sentiment Indicator** — Visual emotion gauge from the Local AI service
- **Knowledge Base Search** — Instant RAG-powered answers from your organization's KB
- **CRM Integration** — Auto-populates call notes and wrap-up summaries
- **Omnichannel Inbox** — Manage WhatsApp, LINE, KakaoTalk, WeChat, Email conversations
- **WFM Portal** — View shifts, request schedule changes
- **Action Center** — AI-generated post-call action drafts
- **SOP Guide** — Step-by-step call flow guidance with decision branches
- **Module-Aware** — Tabs auto-hide when backend modules are disabled

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Chrome Extension                     │
│                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  Content     │  │  Side Panel  │  │  Background  │ │
│  │  Injector    │  │  (React)     │  │  Service     │ │
│  │  (CRM page)  │  │              │  │  Worker      │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                  │         │
│         └────────┬────────┘                  │         │
│                  │                           │         │
│            WebSocket Client ◄────────────────┘         │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼ wss://
          ┌────────────────┐
          │   App Server   │ ← Transcription, AI Suggestions,
          │   (AS)         │   Agent Status, Omnichannel Events
          └────────────────┘
```

---

## 🛠 Tech Stack

| Category | Technologies |
|----------|-------------|
| **Framework** | [Plasmo](https://plasmo.com/) (Chrome Extension MV3) |
| **UI** | React 19, TypeScript, Framer Motion |
| **Real-time** | WebSocket (Socket.IO) |
| **i18n** | react-i18next |
| **AI** | WebLLM (on-device LLM, planned) |
| **Testing** | Vitest |

---

## 📁 Project Structure

```
src/
├── components/     # UI components (SidePanel, Cards, Panels...)
├── contents/       # Content scripts injected into web pages
├── hooks/          # Custom React hooks (useWebSocket, useAuth...)
├── tabs/           # Extension pages (options, popup)
├── utils/          # Utility functions
├── i18n/           # Translation files
└── mock/           # Mock data for development
```

---

## 🚀 Development

```bash
# Install dependencies
npm install

# Start dev server (with hot reload)
npm run dev

# Build for production
npm run build

# Build without demo features
npm run build:prod
```

### Loading in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `build/chrome-mv3-dev/` (dev) or `build/chrome-mv3-prod/` (prod)

---

## ⚙️ Configuration

After installation:
1. Right-click the CXMind icon → **Options**
2. Enter your App Server URL (e.g., `https://your-cxmind.example.com`)
3. Log in with your agent credentials

---

## 🔒 Required Chrome Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Persist settings and cached module state |
| `notifications` | Incoming message and alert notifications |
| `sidePanel` | Side panel UI for agent assistance |
| `alarms` | Periodic background tasks (module refresh, health checks) |
| `identity` | Google OAuth login support |

---

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch
```

---

## 📄 License

Business Source License 1.1 (BSL) — see [LICENSE](../LICENSE).
