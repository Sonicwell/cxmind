import { useState, useEffect, useRef, useCallback } from "react"

// TypeScript declaration for Document PiP API (Chrome 116+)
declare global {
    interface Window {
        documentPictureInPicture?: {
            requestWindow(options?: { width?: number; height?: number }): Promise<Window>
        }
    }
}

// ──────────────────── Types ────────────────────

interface CallData {
    callId: string
    caller: string
    callee: string
    startTime: string
    status: 'ringing' | 'active'
    transcriptions: Array<{ text: string; speaker: string; timestamp?: string }>
    suggestions: Array<{ text: string }>
}

interface SummaryData {
    intent?: string
    outcome?: string
    nextAction?: string
    sentiment?: string
    entities?: Record<string, any>
    rawSummary?: string
}

interface ChatConversation {
    id: string
    channel: string
    status: 'queued' | 'assigned' | 'active' | 'resolved'
    visitorName: string
    metadata?: Record<string, any>
}

interface PipChatMsg {
    id: string
    role: 'visitor' | 'agent' | 'bot' | 'system'
    name: string
    text: string
    time: string
}

// 渠道→主题色
const CHANNEL_ACCENT: Record<string, string> = {
    voice: '#6C4BF5', webchat: '#3B82F6', whatsapp: '#25D366',
    email: '#F59E0B', line: '#06C755', kakao: '#FEE500',
    wechat: '#07C160', sms: '#6366f1',
}
const CHANNEL_ICON: Record<string, string> = {
    voice: '📞', webchat: '💬', whatsapp: '📱',
    email: '📧', line: '🟢', kakao: '💛',
    wechat: '🟩', sms: '✉️',
}

// ──────────────────── PiP CSS (matches SidePanel style.css) ────────────────────

const PIP_STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        background: linear-gradient(135deg, #f8f9ff 0%, #f0f0ff 50%, #fdf2f8 100%);
        color: #1a1a2e;
        -webkit-font-smoothing: antialiased;
        overflow: hidden;
        height: 100vh;
    }
    .pip-container { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

    /* ── Header ── */
    .pip-header {
        display: flex; align-items: center; gap: 10px; padding: 12px 16px;
        background: rgba(255,255,255,0.85); backdrop-filter: blur(12px);
        border-bottom: 1px solid rgba(0,0,0,0.06);
    }
    .pip-avatar-lg {
        width: 36px; height: 36px; border-radius: 50%;
        background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
        display: flex; align-items: center; justify-content: center;
        color: #6366f1; font-weight: 700; font-size: 14px;
        box-shadow: 0 2px 8px rgba(99,102,241,0.2); flex-shrink: 0;
    }
    .pip-caller-info { flex: 1; min-width: 0; }
    .pip-caller-name { font-weight: 600; font-size: 0.875rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pip-duration { font-size: 0.75rem; font-weight: 500; color: #10b981; display: flex; align-items: center; gap: 5px; }
    .pip-live-dot {
        width: 6px; height: 6px; border-radius: 50%; background: #10b981;
        box-shadow: 0 0 6px #10b981; animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
    .pip-brand { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.08em; color: #6C4BF5; opacity: 0.6; }
    .pip-close-btn {
        width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.08);
        background: rgba(0,0,0,0.04); color: #9ca3af; cursor: pointer;
        display: flex; align-items: center; justify-content: center; font-size: 14px;
        transition: all 0.2s;
    }
    .pip-close-btn:hover { background: rgba(0,0,0,0.08); color: #1a1a1a; }

    /* ── Chat (matches SidePanel chat-row / chat-bubble) ── */
    .pip-chat { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
    .pip-chat-header {
        display: flex; align-items: center; gap: 8px; padding: 10px 14px;
        border-bottom: 1px solid rgba(0,0,0,0.06);
        background: rgba(255,255,255,0.5); backdrop-filter: blur(8px);
        font-size: 12px; font-weight: 500; color: #6b7280;
    }
    .pip-chat-header .count { margin-left: auto; font-size: 11px; color: #9ca3af; }

    .chat-row { display: flex; gap: 8px; align-items: flex-end; width: 100%; }
    .chat-row.right { flex-direction: row-reverse; }
    .chat-row .chat-wrap { max-width: 80%; }
    .chat-row.right .chat-wrap { margin-left: auto; }
    .chat-avatar {
        width: 28px; height: 28px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 10px; font-weight: 700; color: white; flex-shrink: 0;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .chat-bubble {
        padding: 8px 12px; border-radius: 12px;
        font-size: 0.8rem; line-height: 1.5; position: relative;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .chat-row.left .chat-bubble {
        background: white; color: #1a1a2e;
        border-bottom-left-radius: 2px; border: 1px solid rgba(0,0,0,0.06);
    }
    .chat-row.right .chat-bubble {
        background: #6C4BF5; color: white;
        border-bottom-right-radius: 2px;
    }
    .chat-meta {
        font-size: 0.6rem; margin-top: 3px; opacity: 0.6;
        display: flex; justify-content: flex-end;
    }

    /* ── Empty / Idle ── */
    .pip-empty {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        height: 100%; color: #9ca3af; font-size: 12px; gap: 8px;
    }

    /* ── Post-call Summary ── */
    .pip-summary {
        flex: 1; overflow-y: auto; padding: 16px;
        display: flex; flex-direction: column; gap: 12px;
    }
    .pip-summary-title {
        font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px;
    }
    .pip-outcome-row { display: flex; gap: 8px; }
    .pip-outcome-btn {
        flex: 1; padding: 10px 8px; border-radius: 10px; border: 1px solid rgba(0,0,0,0.06);
        background: white; cursor: pointer; text-align: center; font-family: inherit;
        display: flex; flex-direction: column; align-items: center; gap: 4px;
        transition: all 0.2s; font-size: 11px; font-weight: 500; color: #6b7280;
    }
    .pip-outcome-btn:hover { transform: scale(1.02); box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .pip-outcome-btn.active-success { background: #f0fdf4; border-color: #22c55e; color: #16a34a; }
    .pip-outcome-btn.active-failure { background: #fef2f2; border-color: #ef4444; color: #dc2626; }
    .pip-outcome-btn.active-followup { background: #fffbeb; border-color: #f59e0b; color: #d97706; }
    .pip-summary-row { margin-bottom: 6px; }
    .pip-summary-label {
        font-size: 10px; font-weight: 500; color: #9ca3af; text-transform: uppercase;
        letter-spacing: 0.05em; margin-bottom: 2px;
    }
    .pip-summary-value { font-size: 13px; line-height: 1.4; padding-left: 2px; }
    .pip-separator { height: 1px; background: rgba(0,0,0,0.06); margin: 4px 0; }
    .pip-saved-badge {
        display: flex; align-items: center; gap: 6px; padding: 6px 12px;
        background: #f0fdf4; border-radius: 8px; color: #16a34a;
        font-size: 12px; font-weight: 500;
    }
    .pip-action-chip {
        padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.08);
        background: #f9fafb; cursor: pointer; font-size: 10px; font-weight: 500;
        color: #6b7280; font-family: inherit; transition: all 0.15s;
    }
    .pip-action-chip:hover { background: #f3f4f6; border-color: rgba(0,0,0,0.12); }
    .pip-complete-btn {
        width: 100%; padding: 8px; border-radius: 8px; border: none;
        background: linear-gradient(135deg, #6C4BF5, #8B5CF6); color: white;
        font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
        transition: all 0.2s;
    }
    .pip-complete-btn:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 2px 8px rgba(108,75,245,0.3); }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; }

    /* ── Channel Accent (UX-1) ── */
    .pip-container[data-channel="webchat"]  { --ch-accent: #3B82F6; }
    .pip-container[data-channel="whatsapp"] { --ch-accent: #25D366; }
    .pip-container[data-channel="email"]    { --ch-accent: #F59E0B; }
    .pip-container[data-channel="line"]     { --ch-accent: #06C755; }
    .pip-container[data-channel="voice"], .pip-container:not([data-channel]) { --ch-accent: #6C4BF5; }
    .pip-container[data-channel] .pip-header {
        border-left: 3px solid var(--ch-accent);
    }

    /* ── Mode Switch Animation (UX-2) ── */
    .pip-content-fade { animation: pipFadeIn 150ms ease-out; }
    @keyframes pipFadeIn {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
    }

    /* ── Mini Mode (UX-3) ── */
    .pip-container.mini .pip-chat, .pip-container.mini .pip-chat-header,
    .pip-container.mini .pip-sop-section, .pip-container.mini .pip-summary,
    .pip-container.mini .pip-suggestion-card, .pip-container.mini .pip-empty,
    .pip-container.mini .pip-screen-pop { display: none !important; }
    .pip-container.mini { height: 48px !important; overflow: hidden; }
    .pip-mini-badge {
        font-size: 10px; font-weight: 600; padding: 1px 6px;
        border-radius: 8px; background: var(--ch-accent, #6C4BF5); color: white;
    }

    /* ── New Messages Bar (UX-4) ── */
    .pip-new-msg-bar {
        position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
        padding: 5px 14px; border-radius: 16px; background: #6C4BF5; color: #fff;
        border: none; cursor: pointer; font-size: 11px; font-weight: 500;
        box-shadow: 0 2px 8px rgba(108,75,245,0.4); z-index: 20;
        display: flex; align-items: center; gap: 4px;
        animation: pipFadeIn 200ms ease-out;
    }

    /* ── Typing Indicator (UX-5) ── */
    .pip-typing-dots {
        display: inline-flex; gap: 3px; padding: 8px 14px;
        background: white; border-radius: 12px; border-bottom-left-radius: 2px;
        border: 1px solid rgba(0,0,0,0.06); margin-left: 36px;
    }
    .pip-typing-dots span {
        width: 5px; height: 5px; border-radius: 50%; background: #9ca3af;
        animation: dotBounce 1.4s infinite;
    }
    .pip-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .pip-typing-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes dotBounce {
        0%,60%,100% { transform: translateY(0); }
        30% { transform: translateY(-4px); }
    }

    /* ── Suggestion Card (UX-6) ── */
    .pip-suggestion-card {
        display: flex; align-items: flex-start; gap: 8px;
        padding: 8px 12px; margin: 0; border-bottom: 1px solid rgba(0,0,0,0.06);
        background: rgba(108,75,245,0.03); font-size: 11px; line-height: 1.4;
    }
    .pip-suggestion-card .sug-text { flex: 1; color: #374151; }
    .pip-suggestion-card .sug-copy {
        flex-shrink: 0; border: none; background: rgba(108,75,245,0.1);
        color: #6C4BF5; border-radius: 4px; padding: 2px 6px;
        cursor: pointer; font-size: 10px; font-weight: 600;
        transition: all 0.2s;
    }
    .pip-suggestion-card .sug-copy:hover { background: rgba(108,75,245,0.2); }

    /* ── Screen Pop ── */
    .pip-screen-pop {
        flex: 1; display: flex; flex-direction: column; align-items: center;
        justify-content: center; gap: 12px; padding: 24px;
        animation: pipFadeIn 300ms ease-out;
    }
    .pip-screen-pop .sp-channel {
        font-size: 36px; margin-bottom: 4px;
    }
    .pip-screen-pop .sp-name {
        font-size: 16px; font-weight: 600; color: #1a1a1a;
    }
    .pip-screen-pop .sp-preview {
        font-size: 12px; color: #6b7280; text-align: center;
        max-width: 280px; line-height: 1.4;
    }
    .pip-screen-pop .sp-actions { display: flex; gap: 8px; margin-top: 8px; }
    .pip-screen-pop .sp-btn {
        padding: 8px 20px; border-radius: 8px; border: none;
        font-weight: 600; font-size: 12px; cursor: pointer;
        transition: all 0.2s; font-family: inherit;
    }
    .pip-screen-pop .sp-btn.accept {
        background: var(--ch-accent, #6C4BF5); color: white;
        box-shadow: 0 2px 8px rgba(108,75,245,0.3);
    }
    .pip-screen-pop .sp-btn.accept:hover { transform: scale(1.03); }
    .pip-screen-pop .sp-btn.panel {
        background: rgba(0,0,0,0.05); color: #374151;
    }

    /* ── Chat Toast (并发时) ── */
    .pip-chat-toast {
        position: absolute; top: 56px; left: 8px; right: 8px; z-index: 40;
        background: white; border-radius: 10px; padding: 8px 12px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.12); border: 1px solid rgba(0,0,0,0.06);
        animation: pipFadeIn 200ms ease-out;
        display: flex; align-items: center; gap: 8px;
    }
    .pip-chat-toast .toast-badge {
        width: 24px; height: 24px; border-radius: 50%;
        background: var(--ch-accent, #3B82F6); color: white;
        display: flex; align-items: center; justify-content: center;
        font-size: 12px; flex-shrink: 0;
    }
    .pip-chat-toast .toast-text {
        flex: 1; font-size: 11px; color: #374151; line-height: 1.3;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    /* ── Sentiment Badge ── */
    .pip-sentiment { font-size: 14px; line-height: 1; }

    /* ── Coach Overlay Animation ── */
    @keyframes pip-coach-in {
        from { opacity:0; transform:translateY(-10px); }
        to { opacity:1; transform:translateY(0); }
    }
`

// ──── PiP scroll state (survives innerHTML re-renders) ────
let pipScrollNearBottom = true
let pipScrollPos = 0

// ──── Inline SVG icons (matching lucide-react used in SidePanel) ────
const ICON = {
    messageSquare: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    sparkles: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6C4BF5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>`,
    loader: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6C4BF5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
    target: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
    fileText: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
    arrowRight: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`,
    smilePlus: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
    tag: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="#9ca3af"/></svg>`,
    mic: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`,
    checkCircle: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>`,
    phone: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    phoneIncoming: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 2 16 8 22 8"/><line x1="23" x2="16" y1="1" y2="8"/><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    phoneOutgoing: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 8 22 2 16 2"/><line x1="16" x2="22" y1="8" y2="2"/><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>`,
    chevronDown: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
}

function escapeHtml(s: string) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function normalizeSIP(uri: string): string {
    if (!uri) return ""
    const match = uri.match(/sip:([^@]+)/) || uri.match(/^(\d+)$/) || uri.match(/^([^"<]+)/)
    return match ? match[1].trim() : uri.trim()
}

function getInitials(name: string): string {
    return normalizeSIP(name).slice(0, 2).toUpperCase()
}

// ──────────────────── Main Component ────────────────────

function PiPLauncher() {
    const [call, setCall] = useState<CallData | null>(null)
    const [transcriptions, setTranscriptions] = useState<Array<{ text: string; speaker: string; timestamp?: string }>>([])
    const [pipActive, setPipActive] = useState(false)
    const [error, setError] = useState("")
    const [connected, setConnected] = useState(false)
    // Post-call state
    const [postCallId, setPostCallId] = useState<string | null>(null)
    const [summary, setSummary] = useState<SummaryData | null>(null)
    const [summaryLoading, setSummaryLoading] = useState(false)
    const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null)
    const [outcomeSaved, setOutcomeSaved] = useState(false)
    const [endedCallInfo, setEndedCallInfo] = useState<{ caller: string; callee: string; startTime: string; finalDuration: string } | null>(null)
    const [sopState, setSopState] = useState<any>(null)
    const [coachMessage, setCoachMessage] = useState<{ text: string; from: string; timestamp: number } | null>(null)
    const coachTimerRef = useRef<number | null>(null)

    // Chat state
    const [chatConv, setChatConv] = useState<ChatConversation | null>(null)
    const [chatMessages, setChatMessages] = useState<PipChatMsg[]>([])
    const [suggestionHistory, setSuggestionHistory] = useState<Array<{ text: string; source?: string }>>([])
    const [suggestionIndex, setSuggestionIndex] = useState(-1)
    const [miniMode, setMiniMode] = useState(false)
    const [chatUnreadBadge, setChatUnreadBadge] = useState(0)
    const [visitorTyping, setVisitorTyping] = useState(false)
    const typingTimerRef = useRef<number | null>(null)
    const chatToastTimerRef = useRef<number | null>(null)
    const [sentiment, setSentiment] = useState('')
    const [asrEnabled, setAsrEnabled] = useState<boolean | null>(null)

    const pipWindowRef = useRef<Window | null>(null)
    const timerRef = useRef<number | null>(null)

    // Opt-4: 合并 8 个 ref 为单一 stateRef, 消除 8 个 useEffect
    const stateRef = useRef({
        call: null as CallData | null,
        transcriptions: [] as Array<{ text: string; speaker: string; timestamp?: string }>,
        postCallId: null as string | null,
        summary: null as SummaryData | null,
        selectedOutcome: null as string | null,
        outcomeSaved: false,
        endedCallInfo: null as { caller: string; callee: string; startTime: string; finalDuration: string } | null,
        sopState: null as any,
        chatConv: null as ChatConversation | null,
        chatMessages: [] as PipChatMsg[],
        suggestionHistory: [] as Array<{ text: string; source?: string }>,
        suggestionIndex: -1,
        asrEnabled: null as boolean | null,
    })
    // 同步 helper — setState 同时更新 ref
    function syncState<K extends keyof typeof stateRef.current>(key: K, val: typeof stateRef.current[K], setter: (v: any) => void) {
        stateRef.current[key] = val
        setter(val)
    }

    // Extension uninstall/disable → 自动关窗 (SW 休眠重启不关)
    useEffect(() => {
        const port = chrome.runtime.connect({ name: 'pip-launcher' })
        port.onDisconnect.addListener(() => {
            // SW 休眠重启也会触发 disconnect, 只在扩展真正卸载/禁用时才关窗
            if (!chrome.runtime?.id) {
                window.close()
            }
        })
        return () => { try { port.disconnect() } catch { } }
    }, [])

    // Fetch initial state (call + SOP)
    useEffect(() => {
        chrome.runtime.sendMessage({ type: "getCurrentCall" }, (response) => {
            if (response?.call) {
                const c = response.call
                const cd: CallData = {
                    callId: c.callId, caller: c.caller, callee: c.callee,
                    startTime: c.startTime || new Date().toISOString(),
                    status: c.status || 'active',
                    transcriptions: c.transcriptions || [], suggestions: c.suggestions || []
                }
                syncState('call', cd, setCall)
                syncState('transcriptions', c.transcriptions || [], setTranscriptions)
            }
            // 初始化 ASR 状态 (PiP 打开时 call:asr_info 可能已经发过)
            if (response?.asrInfo) {
                stateRef.current.asrEnabled = !!response.asrInfo.enabled
                setAsrEnabled(!!response.asrInfo.enabled)
            }
        })
        chrome.runtime.sendMessage({ type: "getConnectionStatus" }, (response) => {
            setConnected(response?.connected || false)
        })
        chrome.runtime.sendMessage({ type: "getSopState" }, (response) => {
            if (response?.sopState) {
                syncState('sopState', response.sopState, setSopState)
            }
        })
    }, [])

    // Agent info for speaker matching
    const [agentSip, setAgentSip] = useState("")
    useEffect(() => {
        chrome.storage.local.get(["userProfile"], (result) => {
            if (result.userProfile?.sipNumber) {
                setAgentSip(normalizeSIP(result.userProfile.sipNumber))
            }
        })
    }, [])

    // Opt-3: RAF 节流
    const renderPending = useRef(false)
    function scheduleRender() {
        if (renderPending.current) return
        renderPending.current = true
        requestAnimationFrame(() => {
            renderPending.current = false
            if (pipWindowRef.current && stateRef.current.call) {
                renderPiPContent(pipWindowRef.current.document, stateRef.current.call, stateRef.current.transcriptions, agentSip)
            }
        })
    }

    // Listen for real-time updates
    useEffect(() => {
        // 消息去重 (broadcastToUI 双路广播)
        const seenMsgIds = new Set<string>()
        const listener = (message: any) => {
            switch (message.type) {
                case "call_event":
                    if (message.data?.event_type === "call_create") {
                        const newCall: CallData = {
                            callId: message.data.call_id,
                            caller: message.data.caller_uri,
                            callee: message.data.callee_uri,
                            startTime: new Date().toISOString(),
                            status: message.data.status || 'active',
                            transcriptions: [], suggestions: []
                        }
                        syncState('call', newCall, setCall)
                        syncState('transcriptions', [], setTranscriptions)
                        syncState('postCallId', null, setPostCallId)
                        setAsrEnabled(null) // 重置 ASR 状态, 等 call:asr_info 重新确认
                        stateRef.current.asrEnabled = null
                        syncState('summary', null, setSummary)
                        setSummaryLoading(false)
                        syncState('selectedOutcome', null, setSelectedOutcome)
                        syncState('outcomeSaved', false, setOutcomeSaved)
                        if (pipWindowRef.current) {
                            renderPiPContent(pipWindowRef.current.document, newCall, [], agentSip)
                            startTimer(pipWindowRef.current.document, newCall.startTime)
                        }
                    } else if (message.data?.event_type === "call_answer") {
                        const updated = stateRef.current.call ? { ...stateRef.current.call, status: 'active' as const, startTime: new Date().toISOString() } : null
                        if (updated) {
                            syncState('call', updated, setCall)
                            if (pipWindowRef.current) {
                                renderPiPContent(pipWindowRef.current.document, updated, stateRef.current.transcriptions, agentSip)
                                startTimer(pipWindowRef.current.document, updated.startTime)
                            }
                        }
                    } else if (message.data?.event_type === "call_hangup") {
                        // 幂等: broadcastToUI 双路广播可能导致重复，第二次到达时 call 已清空
                        if (!stateRef.current.call && stateRef.current.postCallId) break
                        const ci = stateRef.current.call
                        const endedCallId = ci?.callId || null
                        let finalDuration = ''
                        if (ci?.startTime) {
                            const secs = Math.floor((Date.now() - new Date(ci.startTime).getTime()) / 1000)
                            finalDuration = `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`
                        }
                        const info = ci ? { caller: ci.caller, callee: ci.callee, startTime: ci.startTime, finalDuration } : null
                        syncState('endedCallInfo', info, setEndedCallInfo)
                        syncState('call', null, setCall)
                        syncState('transcriptions', [], setTranscriptions)
                        syncState('postCallId', endedCallId, setPostCallId)

                        // Default to loading unless it's already known to be not enabled
                        const notEnabled = message.data?.summaryNotEnabled === true
                        setSummaryLoading(!notEnabled)

                        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
                        if (pipWindowRef.current) {
                            renderPostCallState(pipWindowRef.current.document, endedCallId, null, !notEnabled, null, false, info, notEnabled)
                        }
                    }
                    break

                case "call:summary_skipped":
                    if (!stateRef.current.postCallId) break;
                    setSummaryLoading(false)
                    if (pipWindowRef.current) {
                        renderPostCallState(pipWindowRef.current.document, stateRef.current.postCallId, null, false, stateRef.current.selectedOutcome, stateRef.current.outcomeSaved, stateRef.current.endedCallInfo, false, false, true)
                    }
                    break
                case "call:summary_not_enabled":
                    if (!stateRef.current.postCallId) break;
                    setSummaryLoading(false)
                    if (pipWindowRef.current) {
                        renderPostCallState(pipWindowRef.current.document, stateRef.current.postCallId, null, false, stateRef.current.selectedOutcome, stateRef.current.outcomeSaved, stateRef.current.endedCallInfo, true)
                    }
                    break

                case "call:asr_info": {
                    const info = message.data
                    setAsrEnabled(!!info?.enabled)
                    stateRef.current.asrEnabled = !!info?.enabled
                    // ASR 未开启且无转写 → 触发 re-render 显示友好提示
                    if (!info?.enabled && pipWindowRef.current && stateRef.current.call && stateRef.current.transcriptions.length === 0) {
                        renderPiPContent(pipWindowRef.current.document, stateRef.current.call, [], agentSip)
                    }
                    break
                }

                case "transcription_update":
                    if (message.data) {
                        syncState('transcriptions', message.data, setTranscriptions)
                        scheduleRender() // Opt-3: RAF 节流替代直接渲染
                    }
                    break

                case "sop:stateUpdate":
                    syncState('sopState', message.data, setSopState)
                    if (pipWindowRef.current && stateRef.current.call) {
                        renderPiPContent(pipWindowRef.current.document, stateRef.current.call, stateRef.current.transcriptions, agentSip)
                    }
                    break

                case "coach:message":
                    if (message.data?.text) {
                        setCoachMessage({ text: message.data.text, from: message.data.from || 'Supervisor', timestamp: Date.now() })
                        if (pipWindowRef.current && stateRef.current.call) {
                            renderPiPContent(pipWindowRef.current.document, stateRef.current.call, stateRef.current.transcriptions, agentSip)
                        }
                        if (coachTimerRef.current) clearTimeout(coachTimerRef.current)
                        coachTimerRef.current = window.setTimeout(() => {
                            setCoachMessage(null)
                            if (pipWindowRef.current && stateRef.current.call) {
                                renderPiPContent(pipWindowRef.current.document, stateRef.current.call, stateRef.current.transcriptions, agentSip)
                            }
                        }, 5000)
                    }
                    break

                case "omni:summary":
                    if (!stateRef.current.postCallId) break; // Defensive check: ignore if wrap-up is already closed by user
                    if (message.data) {
                        const raw = message.data.summary || message.data.ai_summary || message.data
                        const s: SummaryData = {
                            intent: raw.intent, outcome: raw.outcome,
                            nextAction: raw.nextAction || raw.next_action,
                            sentiment: raw.sentiment, entities: raw.entities,
                            rawSummary: raw.raw_summary || raw.rawSummary,
                        }
                        syncState('summary', s, setSummary)
                        setSummaryLoading(false)
                        if (s.sentiment) setSentiment(s.sentiment)
                        if (pipWindowRef.current) {
                            renderPostCallState(pipWindowRef.current.document, stateRef.current.postCallId, s, false, stateRef.current.selectedOutcome, stateRef.current.outcomeSaved, stateRef.current.endedCallInfo)
                        }
                    }
                    break;

                case "omni:summary_timeout":
                    if (!stateRef.current.postCallId) break; // Defensive check: timeout is irrelevant if already Idle
                    setSummaryLoading(false)
                    if (pipWindowRef.current) {
                        renderPostCallState(pipWindowRef.current.document, stateRef.current.postCallId, null, false, stateRef.current.selectedOutcome, stateRef.current.outcomeSaved, stateRef.current.endedCallInfo, false, true)
                    }
                    break;

                case "wrapup:completed":
                    // wrap-up 完成 → 清空 post-call 状态，PiP 保持打开（持久 HUD）
                    syncState('postCallId', null, setPostCallId)
                    syncState('summary', null, setSummary)
                    setSummaryLoading(false)
                    syncState('selectedOutcome', null, setSelectedOutcome)
                    syncState('outcomeSaved', false, setOutcomeSaved)
                    syncState('endedCallInfo', null, setEndedCallInfo)
                    if (pipWindowRef.current) {
                        renderIdleState(pipWindowRef.current.document)
                    }
                    break

                // ── Chat / OmniChannel 事件 ──

                case "omni:new_conversation": {
                    const d = message.data
                    const conv: ChatConversation = {
                        id: d.id || d._id || d.conversationId,
                        channel: d.channel || 'webchat',
                        status: 'assigned',
                        visitorName: d.metadata?.visitorName || 'Visitor',
                        metadata: d.metadata,
                    }
                    // 已有活跃会话 → 不覆盖，只加 badge
                    const cur = stateRef.current.chatConv
                    if (stateRef.current.call || (cur && cur.status === 'active')) {
                        setChatUnreadBadge(prev => prev + 1)
                        break
                    }
                    syncState('chatConv', conv, setChatConv)
                    syncState('chatMessages', [], setChatMessages)
                    if (pipWindowRef.current) {
                        renderScreenPop(pipWindowRef.current.document, conv)
                    }
                    break
                }

                case "omni:customer_message":
                case "omni:agent_message": {
                    const d = message.data
                    const msgId = d.messageId || d._id
                    if (msgId && seenMsgIds.has(msgId)) break
                    if (msgId) { seenMsgIds.add(msgId); if (seenMsgIds.size > 200) seenMsgIds.clear() }
                    const convId = d.conversationId || d.channelId
                    if (!stateRef.current.chatConv || stateRef.current.chatConv.id !== convId) break
                    const msg: PipChatMsg = {
                        id: d.messageId || `msg-${Date.now()}`,
                        role: d.sender?.role === 'agent' ? 'agent' : 'visitor',
                        name: d.sender?.name || (d.sender?.role === 'agent' ? 'Agent' : 'Customer'),
                        text: d.text || d.content?.text || '',
                        time: d.createdAt ? new Date(d.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
                    }
                    const updated = [...stateRef.current.chatMessages, msg]
                    syncState('chatMessages', updated, setChatMessages)
                    // Voice 活跃 → toast + badge (UX-9), 不渲染 Chat
                    if (stateRef.current.call) {
                        if (msg.role === 'visitor') setChatUnreadBadge(prev => prev + 1)
                        if (pipWindowRef.current) showChatToast(pipWindowRef.current.document, msg)
                    } else if (pipWindowRef.current && stateRef.current.chatConv.status === 'active') {
                        appendChatMessage(pipWindowRef.current.document, msg)
                    }
                    break
                }

                case "omni:suggestion": {
                    const d = message.data
                    const text = Array.isArray(d.suggestions) ? (d.suggestions[0]?.text || d.suggestions[0]?.suggestion || '') : (d.text || d.suggestion || '')
                    const source = d.source?.title || ''
                    if (text) {
                        const sug = { text, source }
                        const newHistory = [...stateRef.current.suggestionHistory, sug]
                        const newIdx = newHistory.length - 1
                        stateRef.current.suggestionHistory = newHistory
                        stateRef.current.suggestionIndex = newIdx
                        setSuggestionHistory(newHistory)
                        setSuggestionIndex(newIdx)
                        if (pipWindowRef.current) updateSuggestionSlot(pipWindowRef.current.document, sug, newIdx, newHistory.length)
                    }
                    break
                }

                case "omni:conversation_accepted": {
                    const convId = message.data?.conversationId || message.data?._id
                    if (stateRef.current.chatConv && stateRef.current.chatConv.id === convId) {
                        const updated = { ...stateRef.current.chatConv, status: 'active' as const }
                        syncState('chatConv', updated, setChatConv)
                        // 如果 Voice 不活跃, 渲染 Chat 界面
                        if (!stateRef.current.call && pipWindowRef.current) {
                            renderChatContent(pipWindowRef.current.document, updated, stateRef.current.chatMessages)
                        }
                    }
                    break
                }

                case "omni:conversation_resolved": {
                    const convId = message.data?.conversationId || message.data?._id
                    if (stateRef.current.chatConv && stateRef.current.chatConv.id === convId) {
                        const updated = { ...stateRef.current.chatConv, status: 'resolved' as const }
                        syncState('chatConv', updated, setChatConv)
                        syncState('postCallId', convId, setPostCallId)
                        setSummaryLoading(true)
                        if (pipWindowRef.current) {
                            renderPostCallState(pipWindowRef.current.document, convId, null, true, null, false, null)
                        }
                    }
                    break
                }

                case "omni:outcome": {
                    const oc = message.data
                    // 在 Post-call 视图中更新 AI 预测
                    if (oc?.outcome && stateRef.current.postCallId) {
                        syncState('selectedOutcome', oc.outcome, setSelectedOutcome)
                    }
                    break
                }

                case "omni:toxic_alert": {
                    // 类似 coach overlay 的警告 toast
                    const score = ((message.data?.toxicScore || 0) * 100).toFixed(0)
                    setCoachMessage({ text: `🛡️ Toxic content detected (score: ${score}%)`, from: 'System', timestamp: Date.now() })
                    if (pipWindowRef.current && stateRef.current.call) {
                        renderPiPContent(pipWindowRef.current.document, stateRef.current.call, stateRef.current.transcriptions, agentSip)
                    }
                    if (coachTimerRef.current) clearTimeout(coachTimerRef.current)
                    coachTimerRef.current = window.setTimeout(() => {
                        setCoachMessage(null)
                        if (pipWindowRef.current && stateRef.current.call) {
                            renderPiPContent(pipWindowRef.current.document, stateRef.current.call, stateRef.current.transcriptions, agentSip)
                        }
                    }, 8000)
                    break
                }

                case "omni:typing": {
                    const convId = message.data?.conversationId
                    if (stateRef.current.chatConv && stateRef.current.chatConv.id === convId) {
                        setVisitorTyping(message.data?.isTyping ?? true)
                        if (message.data?.isTyping) {
                            if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
                            typingTimerRef.current = window.setTimeout(() => setVisitorTyping(false), 3000)
                        }
                        if (pipWindowRef.current && !stateRef.current.call) {
                            updateTypingIndicator(pipWindowRef.current.document, message.data?.isTyping ?? true)
                        }
                    }
                    break
                }

                case "pip:switchConversation": {
                    const d = message.data
                    if (!d?.id) break
                    const conv: ChatConversation = {
                        id: d.id,
                        channel: d.channel || 'webchat',
                        status: d.status || 'active',
                        visitorName: d.visitorName || 'Visitor',
                    }
                    const msgs: PipChatMsg[] = (d.messages || []).map((m: any) => ({
                        id: m.id || `msg-${Date.now()}`,
                        role: m.role || 'visitor',
                        name: m.name || 'Customer',
                        text: m.text || '',
                        time: m.time || '',
                    }))
                    syncState('chatConv', conv, setChatConv)
                    syncState('chatMessages', msgs, setChatMessages)
                    setChatUnreadBadge(0)
                    // Voice 不活跃 → 渲染 Chat
                    if (!stateRef.current.call && pipWindowRef.current) {
                        if (conv.status === 'active') {
                            renderChatContent(pipWindowRef.current.document, conv, msgs)
                        } else {
                            renderScreenPop(pipWindowRef.current.document, conv)
                        }
                    }
                    break
                }

                case "connection_status":
                    setConnected(message.data?.connected || false)
                    break

                case "pip:close":
                    pipWindowRef.current?.close()
                    break
            }
        }

        chrome.runtime.onMessage.addListener(listener)
        return () => chrome.runtime.onMessage.removeListener(listener)
    }, [agentSip])

    // Activate Document PiP
    const activatePiP = useCallback(async () => {
        if (!window.documentPictureInPicture) {
            setError("Document PiP not supported. Requires Chrome 116+.")
            return
        }

        try {
            const pipWin = await window.documentPictureInPicture!.requestWindow({
                width: 360, height: 520
            })
            pipWindowRef.current = pipWin

            const style = pipWin.document.createElement("style")
            style.textContent = PIP_STYLES
            pipWin.document.head.appendChild(style)

            const mount = pipWin.document.createElement("div")
            mount.id = "pip-root"
            pipWin.document.body.appendChild(mount)

            // Opt-2: 一次性事件委托
            mount.addEventListener('click', (e) => {
                const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement
                if (!target) return
                switch (target.dataset.action) {
                    case 'sop-branch':
                        if (target.dataset.target) chrome.runtime.sendMessage({ type: 'sop:selectBranch', targetNodeId: target.dataset.target }).catch(() => { })
                        break
                    case 'sop-copy':
                    case 'copy-suggestion':
                    case 'copy-summary': {
                        const text = target.dataset.text || ''
                        navigator.clipboard.writeText(text).then(() => {
                            const orig = target.textContent
                            target.textContent = '✓'
                            setTimeout(() => { target.textContent = orig }, 800)
                        }).catch(() => { })
                        break
                    }
                    case 'accept':
                        if (stateRef.current.chatConv) {
                            chrome.runtime.sendMessage({ type: 'demo:omni_accept', data: { conversationId: stateRef.current.chatConv.id } }).catch(() => { })
                        }
                        break
                    case 'open-inbox':
                        chrome.runtime.sendMessage({ type: 'pip:openInbox' }).catch(() => { })
                        break
                    case 'toggle-mini': {
                        const container = mount.querySelector('.pip-container')
                        if (container) {
                            container.classList.toggle('mini')
                            setMiniMode(container.classList.contains('mini'))
                        }
                        break
                    }
                    case 'scroll-bottom': {
                        const scroll = mount.querySelector('#pip-scroll') as HTMLElement
                        if (scroll) { scroll.scrollTop = scroll.scrollHeight; pipScrollNearBottom = true }
                        const bar = mount.querySelector('.pip-new-msg-bar') as HTMLElement
                        if (bar) bar.remove()
                        break
                    }
                    case 'outcome': {
                        const oc = target.dataset.outcome
                        const cid = stateRef.current.postCallId
                        if (!oc || !cid) break
                        Promise.all([
                            chrome.storage.sync.get(['apiUrl']),
                            chrome.storage.local.get(['token'])
                        ]).then(([syncStored, localStored]) => {
                            const apiUrl = syncStored.apiUrl || 'http://localhost:3000'
                            const token = localStored.token
                            fetch(`${apiUrl}/api/agent/calls/${cid}/outcome`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                                body: JSON.stringify({ outcome: oc })
                            }).then(() => {
                                syncState('selectedOutcome', oc, setSelectedOutcome)
                                syncState('outcomeSaved', true, setOutcomeSaved)
                                renderPostCallState(pipWin.document, cid, stateRef.current.summary, false, oc, true, stateRef.current.endedCallInfo)
                            }).catch(e => console.error('[PiP] Outcome save failed:', e))
                        })
                        break
                    }
                    case 'sug-prev': {
                        const hist = stateRef.current.suggestionHistory
                        const curIdx = stateRef.current.suggestionIndex
                        if (curIdx > 0) {
                            const newIdx = curIdx - 1
                            stateRef.current.suggestionIndex = newIdx
                            setSuggestionIndex(newIdx)
                            updateSuggestionSlot(pipWin.document, hist[newIdx], newIdx, hist.length)
                        }
                        break
                    }
                    case 'sug-next': {
                        const hist = stateRef.current.suggestionHistory
                        const curIdx = stateRef.current.suggestionIndex
                        if (curIdx < hist.length - 1) {
                            const newIdx = curIdx + 1
                            stateRef.current.suggestionIndex = newIdx
                            setSuggestionIndex(newIdx)
                            updateSuggestionSlot(pipWin.document, hist[newIdx], newIdx, hist.length)
                        }
                        break
                    }
                    case 'close':
                        pipWindowRef.current?.close()
                        break
                    case 'complete-wrapup':
                        // 通知 SidePanel 完成 wrap-up（通过 background 中继）
                        chrome.runtime.sendMessage({ type: 'pip:wrapupComplete' }).catch(() => { })
                        // 清空 post-call 状态，保持 PiP 打开
                        syncState('postCallId', null, setPostCallId)
                        syncState('summary', null, setSummary)
                        setSummaryLoading(false)
                        syncState('selectedOutcome', null, setSelectedOutcome)
                        syncState('outcomeSaved', false, setOutcomeSaved)
                        syncState('endedCallInfo', null, setEndedCallInfo)
                        if (pipWindowRef.current) {
                            renderIdleState(pipWindowRef.current.document)
                        }
                        break
                }
            })

            // PIP 手写 summary blur-save — 复用 outcome 的 storage-based auth 模式
            mount.addEventListener('focusout', (e) => {
                const target = e.target as HTMLElement
                if (target.id !== 'pip-manual-summary') return
                const text = (target as HTMLTextAreaElement).value?.trim()
                const cid = stateRef.current.postCallId
                if (!text || !cid) return
                Promise.all([
                    chrome.storage.sync.get(['apiUrl']),
                    chrome.storage.local.get(['token'])
                ]).then(([syncStored, localStored]) => {
                    const apiUrl = syncStored.apiUrl || 'http://localhost:3000'
                    const token = localStored.token
                    fetch(`${apiUrl}/api/agent-calls/sessions/${cid}/summary`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                        body: JSON.stringify({ summary: text })
                    }).then(() => {
                        // 视觉反馈
                        target.style.borderColor = '#22c55e'
                        setTimeout(() => { target.style.borderColor = '#e5e7eb' }, 1500)
                    }).catch(err => console.error('[PiP] Summary save failed:', err))
                })
            })

            // UX-3: Mini Mode — 双击 Header 切换
            mount.addEventListener('dblclick', (e) => {
                const header = (e.target as HTMLElement).closest('.pip-header')
                if (header) {
                    const container = mount.querySelector('.pip-container')
                    if (container) {
                        container.classList.toggle('mini')
                        setMiniMode(container.classList.contains('mini'))
                    }
                }
            })

            // 渲染初始状态（含 PiP 重启恢复）
            if (stateRef.current.call) {
                renderPiPContent(pipWin.document, stateRef.current.call, stateRef.current.transcriptions, agentSip)
                startTimer(pipWin.document, stateRef.current.call.startTime)
            } else if (stateRef.current.chatConv && stateRef.current.chatConv.status === 'active') {
                renderChatContent(pipWin.document, stateRef.current.chatConv, stateRef.current.chatMessages)
            } else if (stateRef.current.chatConv) {
                renderScreenPop(pipWin.document, stateRef.current.chatConv)
            } else if (stateRef.current.postCallId) {
                renderPostCallState(pipWin.document, stateRef.current.postCallId, stateRef.current.summary, summaryLoading, stateRef.current.selectedOutcome, stateRef.current.outcomeSaved, stateRef.current.endedCallInfo)
            } else {
                renderIdleState(pipWin.document)
            }

            setPipActive(true)
            chrome.runtime.sendMessage({ type: "pip:activated" }).catch(() => { })

            // pagehide 清理 (Opt: 所有 timer)
            pipWin.addEventListener("pagehide", () => {
                pipWindowRef.current = null
                setPipActive(false)
                if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
                if (coachTimerRef.current) { clearTimeout(coachTimerRef.current); coachTimerRef.current = null }
                if (typingTimerRef.current) { clearTimeout(typingTimerRef.current); typingTimerRef.current = null }
                if (chatToastTimerRef.current) { clearTimeout(chatToastTimerRef.current); chatToastTimerRef.current = null }
                chrome.runtime.sendMessage({ type: "pip:deactivated" }).catch(() => { })
            }, { once: true })
        } catch (err: any) {
            console.error("[PiP]", err)
            setError(err.message || String(err))
        }
    }, [agentSip, summaryLoading])

    const startTimer = useCallback((doc: Document, startTime: string) => {
        if (timerRef.current) clearInterval(timerRef.current)
        const startMs = new Date(startTime).getTime()
        if (isNaN(startMs)) return
        const update = () => {
            const el = doc.getElementById("pip-timer")
            if (!el) return
            const diff = Math.max(0, Math.floor((Date.now() - startMs) / 1000))
            el.textContent = `${Math.floor(diff / 60)}:${(diff % 60).toString().padStart(2, "0")}`
        }
        update()
        timerRef.current = window.setInterval(update, 1000)
    }, [])

    // ──── Render: SOP Section for PiP (compact teleprompter) ────

    function renderSopSection(sop: any): string {
        if (!sop || sop.collapsed || !sop.currentNode) return ''

        const node = sop.currentNode
        const nodeType = node.data?.type || 'VOICE_PROMPT'
        const label = node.data?.label || nodeType
        const step = (sop.visitedNodes?.length || 1)
        const total = sop.totalNodes || '?'

        let script = ''
        const d = node.data || {}
        switch (nodeType) {
            case 'VOICE_PROMPT': script = d.prompt || d.description || ''; break
            case 'TEMPLATE_SUGGESTION': script = d.templateName ? `Send: ${d.templateName}` : d.description || ''; break
            case 'LLM_REWRITE': script = d.prompt || d.description || ''; break
            case 'HUMAN_HANDOFF': script = d.description || 'Transfer to specialist'; break
            case 'API_CALL': script = d.apiEndpoint ? `API: ${d.apiEndpoint}` : d.description || ''; break
            case 'CONDITION': script = d.description || 'Evaluate condition'; break
            default: script = d.description || d.label || ''
        }

        const typeColors: Record<string, string> = {
            VOICE_PROMPT: '#3b82f6', TEMPLATE_SUGGESTION: '#8b5cf6', LLM_REWRITE: '#ec4899',
            CONDITION: '#f59e0b', API_CALL: '#10b981', HUMAN_HANDOFF: '#ef4444',
        }
        const typeEmoji: Record<string, string> = {
            VOICE_PROMPT: '🎤', TEMPLATE_SUGGESTION: '📎', LLM_REWRITE: '🤖',
            CONDITION: '🔀', API_CALL: '⚡', HUMAN_HANDOFF: '📞',
        }
        const color = typeColors[nodeType] || '#6366f1'
        const emoji = typeEmoji[nodeType] || '📋'
        // SOP 脚本应完整显示

        const edges = sop.outEdges || []
        const branchHtml = edges.length > 0 ? `
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">
                ${edges.map((e: any) => {
            const lbl = e.data?.label || e.data?.conditionValue || (e.data?.conditionType === 'DEFAULT' ? 'Continue' : 'Next')
            return `<button data-action="sop-branch" data-target="${e.target}" style="font-size:10px;padding:3px 8px;border-radius:4px;border:1px solid ${color}40;background:${color}10;color:${color};cursor:pointer;font-weight:500">${escapeHtml(lbl)}</button>`
        }).join('')}
            </div>` : ''

        const completedHtml = edges.length === 0 && step > 1
            ? `<div style="font-size:10px;color:#10b981;font-weight:500;margin-top:4px">✅ SOP Complete</div>`
            : ''

        return `
            <div class="pip-sop-section" style="padding:8px 12px;border-bottom:1px solid rgba(0,0,0,0.06);background:rgba(99,102,241,0.03)">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
                    <div style="display:flex;align-items:center;gap:4px">
                        <span style="font-size:11px">${emoji}</span>
                        <span style="font-size:11px;font-weight:600;color:#1a1a1a">${escapeHtml(sop.sopName || 'SOP')}</span>
                    </div>
                    <span style="font-size:9px;background:rgba(99,102,241,0.1);color:#6366f1;padding:1px 6px;border-radius:8px;font-weight:600">${step}/${total}</span>
                </div>
                <div style="font-size:11px;font-weight:500;color:${color};margin-bottom:2px">${escapeHtml(label)}</div>
                ${script ? `
                    <div style="position:relative;background:#f9fafb;border:1px solid rgba(0,0,0,0.06);border-radius:6px;padding:6px 28px 6px 8px;font-size:11px;line-height:1.4;color:#374151">
                        ${escapeHtml(script)}
                        <button data-action="sop-copy" data-text="${escapeHtml(script).replace(/"/g, '&quot;')}" style="position:absolute;top:4px;right:4px;background:none;border:none;cursor:pointer;color:#9ca3af;font-size:12px;padding:2px" title="Copy">📋</button>
                    </div>` : ''}
                ${branchHtml}
                ${completedHtml}
            </div>`
    }

    // ──── Render: Coaching Overlay ────

    function renderCoachOverlay(): string {
        const msg = coachMessage
        if (!msg) return ''
        return `
            <div class="pip-coach-overlay" style="
                position:absolute;top:8px;left:8px;right:8px;z-index:50;
                background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;
                padding:10px 14px;border-radius:10px;
                box-shadow:0 4px 20px rgba(99,102,241,0.5);
                animation:pip-coach-in 0.3s ease-out;
            ">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
                    <span style="font-size:10px;font-weight:700;opacity:0.9">🎧 ${escapeHtml(msg.from)}</span>
                    <span style="font-size:9px;opacity:0.6">Live Coaching</span>
                </div>
                <div style="font-size:12px;font-weight:500;line-height:1.4">${escapeHtml(msg.text)}</div>
            </div>
            <style>
                @keyframes pip-coach-in {
                    from { opacity:0; transform:translateY(-10px); }
                    to { opacity:1; transform:translateY(0); }
                }
            </style>`
    }

    // ──── Chat 渲染函数 ────

    function renderScreenPop(doc: Document, conv: ChatConversation) {
        const root = doc.getElementById("pip-root")
        if (!root) return
        const icon = CHANNEL_ICON[conv.channel] || '💬'
        const firstMsg = stateRef.current.chatMessages[0]
        const preview = firstMsg ? firstMsg.text.slice(0, 120) : 'New conversation incoming...'
        root.innerHTML = `
            <div class="pip-container pip-content-fade" data-channel="${conv.channel}">
                <div class="pip-header">
                    <span style="font-size:20px">${icon}</span>
                    <span style="flex:1;font-weight:600;font-size:14px;color:#1a1a1a">${escapeHtml(conv.visitorName)}</span>
                    <span style="font-size:11px;color:#9ca3af">${conv.channel}</span>
                </div>
                <div class="pip-screen-pop">
                    <div class="sp-channel">${icon}</div>
                    <div class="sp-name">${escapeHtml(conv.visitorName)}</div>
                    <div class="sp-preview">${escapeHtml(preview)}</div>
                    <div class="sp-actions">
                        <button class="sp-btn accept" data-action="accept">✓ Accept</button>
                        <button class="sp-btn panel" data-action="open-inbox">Open in Panel</button>
                    </div>
                </div>
            </div>`
    }

    function renderChatContent(doc: Document, conv: ChatConversation, messages: PipChatMsg[]) {
        const root = doc.getElementById("pip-root")
        if (!root) return
        const icon = CHANNEL_ICON[conv.channel] || '💬'
        const curSug = stateRef.current.suggestionHistory[stateRef.current.suggestionIndex]
        const sugHtml = curSug ? renderSuggestionHtml(curSug, stateRef.current.suggestionIndex, stateRef.current.suggestionHistory.length) : ''
        const msgsHtml = messages.map(m => chatBubbleHtml(m)).join('')
        const typingHtml = visitorTyping ? '<div class="pip-typing-dots"><span></span><span></span><span></span></div>' : ''

        root.innerHTML = `
            <div class="pip-container pip-content-fade" data-channel="${conv.channel}" style="position:relative">
                ${renderCoachOverlay()}
                <div class="pip-header">
                    <span style="font-size:16px">${icon}</span>
                    <div style="flex:1;min-width:0">
                        <div style="font-weight:600;font-size:13px;color:#1a1a1a">${escapeHtml(conv.visitorName)}</div>
                        <div style="font-size:10px;color:#10b981;font-weight:500">Active · ${conv.channel}</div>
                    </div>
                    <span class="pip-sentiment">${sentimentEmoji(sentiment)}</span>
                    <button data-action="close" class="pip-close-btn">${ICON.close}</button>
                </div>
                ${sugHtml}
                <div class="pip-chat-header">
                    ${ICON.messageSquare}<span>Messages</span>
                    <span class="count">${messages.length}</span>
                </div>
                <div class="pip-chat" id="pip-scroll">${msgsHtml}${typingHtml}</div>
            </div>`
        const scroll = doc.getElementById("pip-scroll")
        if (scroll) scroll.scrollTop = scroll.scrollHeight
    }

    function chatBubbleHtml(m: PipChatMsg): string {
        const isAgent = m.role === 'agent'
        const bg = isAgent ? '#6C4BF5' : '#9ca3af'
        const initials = m.name.slice(0, 2).toUpperCase()
        const metaColor = isAgent ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.4)'
        return `<div class="chat-row ${isAgent ? 'right' : 'left'}">
            <div class="chat-avatar" style="background:${bg}">${initials}</div>
            <div class="chat-wrap">
                <div class="chat-bubble">${escapeHtml(m.text)}${m.time ? `<div class="chat-meta" style="color:${metaColor}">${m.time}</div>` : ''}</div>
            </div>
        </div>`
    }

    function appendChatMessage(doc: Document, msg: PipChatMsg) {
        const scroll = doc.getElementById("pip-scroll")
        if (!scroll) return
        // UX-5: \u79fb\u9664 typing \u6307\u793a\u5668
        const dots = scroll.querySelector('.pip-typing-dots')
        if (dots) dots.remove()
        // \u8ffd\u52a0\u65b0\u6d88\u606f
        scroll.insertAdjacentHTML('beforeend', chatBubbleHtml(msg))
        // UX-4: \u65b0\u6d88\u606f\u8df3\u8f6c\u6761
        if (pipScrollNearBottom) {
            scroll.scrollTop = scroll.scrollHeight
        } else {
            const existing = doc.querySelector('.pip-new-msg-bar')
            if (!existing) {
                scroll.parentElement?.insertAdjacentHTML('beforeend',
                    `<button class="pip-new-msg-bar" data-action="scroll-bottom">${ICON.chevronDown} New messages</button>`)
            }
        }
        // \u66f4\u65b0\u6d88\u606f\u8ba1\u6570
        const countEl = doc.querySelector('.pip-chat-header .count')
        if (countEl) countEl.textContent = `${stateRef.current.chatMessages.length}`
    }

    function showChatToast(doc: Document, msg: PipChatMsg) {
        const root = doc.getElementById("pip-root")
        if (!root) return
        // \u6e05\u9664\u65e7 toast
        const old = root.querySelector('.pip-chat-toast')
        if (old) old.remove()
        const channel = stateRef.current.chatConv?.channel || 'webchat'
        const icon = CHANNEL_ICON[channel] || '💬'
        root.querySelector('.pip-container')?.insertAdjacentHTML('afterbegin', `
            <div class="pip-chat-toast" data-channel="${channel}">
                <div class="toast-badge">${icon}</div>
                <div class="toast-text"><b>${escapeHtml(msg.name)}</b>: ${escapeHtml(msg.text.slice(0, 60))}</div>
            </div>`)
        // 5s \u540e\u81ea\u52a8\u6d88\u5931
        if (chatToastTimerRef.current) clearTimeout(chatToastTimerRef.current)
        chatToastTimerRef.current = window.setTimeout(() => {
            root.querySelector('.pip-chat-toast')?.remove()
        }, 5000)
    }

    function updateSuggestionSlot(doc: Document, sug: { text: string; source?: string }, idx?: number, total?: number) {
        const existing = doc.querySelector('.pip-suggestion-card')
        if (existing) {
            existing.outerHTML = renderSuggestionHtml(sug, idx, total)
        }
    }

    function renderSuggestionHtml(sug: { text: string; source?: string }, idx?: number, total?: number): string {
        const shortText = sug.text.length > 100 ? sug.text.slice(0, 97) + '...' : sug.text
        const hasNav = total !== undefined && total > 1
        const canPrev = idx !== undefined && idx > 0
        const canNext = idx !== undefined && total !== undefined && idx < total - 1
        const navHtml = hasNav ? `<div style="display:flex;align-items:center;gap:4px;margin-left:auto;flex-shrink:0">
            <button data-action="sug-prev" style="background:none;border:none;cursor:${canPrev ? 'pointer' : 'default'};opacity:${canPrev ? '0.7' : '0.2'};padding:2px;font-size:11px;line-height:1">▲</button>
            <span style="font-size:9px;color:#9ca3af;min-width:24px;text-align:center">${(idx || 0) + 1}/${total}</span>
            <button data-action="sug-next" style="background:none;border:none;cursor:${canNext ? 'pointer' : 'default'};opacity:${canNext ? '0.7' : '0.2'};padding:2px;font-size:11px;line-height:1">▼</button>
        </div>` : ''
        return `<div class="pip-suggestion-card">
            <span style="font-size:12px">✨</span>
            <div class="sug-text" style="flex:1">${escapeHtml(shortText)}${sug.source ? `<div style="font-size:9px;color:#9ca3af;margin-top:2px">${escapeHtml(sug.source)}</div>` : ''}</div>
            <button class="sug-copy" data-action="copy-suggestion" data-text="${escapeHtml(sug.text).replace(/"/g, '&quot;')}" title="Copy">Copy</button>
            ${navHtml}
        </div>`
    }

    function updateTypingIndicator(doc: Document, isTyping: boolean) {
        const scroll = doc.getElementById("pip-scroll")
        if (!scroll) return
        const existing = scroll.querySelector('.pip-typing-dots')
        if (isTyping && !existing) {
            scroll.insertAdjacentHTML('beforeend', '<div class="pip-typing-dots"><span></span><span></span><span></span></div>')
            if (pipScrollNearBottom) scroll.scrollTop = scroll.scrollHeight
        } else if (!isTyping && existing) {
            existing.remove()
        }
    }

    function sentimentEmoji(s: string): string {
        const map: Record<string, string> = { positive: '😊', negative: '😟', neutral: '😐', frustrated: '😤', satisfied: '😌', angry: '😠', happy: '😄' }
        return map[s?.toLowerCase()] || ''
    }

    // ──── Render: Active Call (matches SidePanel TranscriptionList) ────

    function renderPiPContent(doc: Document, c: CallData, trans: Array<{ text: string; speaker: string; timestamp?: string }>, mySip: string) {
        const root = doc.getElementById("pip-root")
        if (!root) return
        const name = normalizeSIP(c.callee) || "Unknown"
        const initials = getInitials(c.callee)
        const msgs = trans.slice(-15)
        const asrOff = stateRef.current.asrEnabled === false

        const chatHtml = msgs.length === 0
            ? asrOff
                ? `<div class="pip-empty"><span style="font-size:20px">🔇</span><span style="font-weight:500;color:#374151">Transcript Not Enabled</span><span style="font-size:11px;color:#9ca3af">ASR is disabled for this agent</span></div>`
                : `<div class="pip-empty">${ICON.mic}<span>Waiting for transcription...</span></div>`
            : msgs.map(t => {
                const speaker = normalizeSIP(t.speaker || '')
                const isMe = (mySip && (speaker === mySip || t.speaker?.includes(mySip))) || t.speaker === "Me" || /^(Me|Agent)$/i.test(t.speaker || '')
                const ti = getInitials(t.speaker || '')
                const avatarBg = isMe ? '#6C4BF5' : '#9ca3af'
                const time = t.timestamp ? new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
                const metaColor = isMe ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.4)'
                return `<div class="chat-row ${isMe ? 'right' : 'left'}">
                    <div class="chat-avatar" style="background:${avatarBg}">${ti}</div>
                    <div style="max-width:80%">
                        <div class="chat-bubble">${escapeHtml(t.text)}${time ? `<div class="chat-meta" style="color:${metaColor}">${time}</div>` : ''}</div>
                    </div>
                </div>`
            }).join("")

        // Determine call direction
        const callerNum = normalizeSIP(c.caller)
        const calleeNum = normalizeSIP(c.callee)
        const isIncoming = mySip && calleeNum.includes(mySip)
        const remoteNum = isIncoming ? callerNum : calleeNum
        const dirIcon = isIncoming ? ICON.phoneIncoming : ICON.phoneOutgoing
        const dirColor = isIncoming ? '#10b981' : '#3b82f6'
        const dirBg = isIncoming ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)'

        // 算当前已过时间, 防re-render闪烁
        let currentTimer = '0:00'
        if (c.startTime) {
            const elapsed = Math.max(0, Math.floor((Date.now() - new Date(c.startTime).getTime()) / 1000))
            currentTimer = `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}`
        }

        root.innerHTML = `
            <div class="pip-container" style="position:relative">
                ${renderCoachOverlay()}                <div class="pip-header">
                    <div style="display:flex;align-items:center;gap:10px;flex:1">
                        <div style="width:32px;height:32px;border-radius:8px;background:${dirBg};color:${dirColor};display:flex;align-items:center;justify-content:center;flex-shrink:0">
                            ${dirIcon}
                        </div>
                        <div style="font-weight:600;font-size:16px;color:#1a1a1a;letter-spacing:-0.02em">${escapeHtml(remoteNum || name)}</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px">
                        <div style="font-size:16px;font-weight:500;color:#1a1a1a;font-variant-numeric:tabular-nums"><span id="pip-timer">${currentTimer}</span></div>
                        <div style="color:${c.status === 'ringing' ? '#f59e0b' : '#10b981'};font-size:12px;font-weight:500;background:${c.status === 'ringing' ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)'};padding:2px 8px;border-radius:12px">${c.status === 'ringing' ? 'Ringing' : 'Active'}</div>
                    </div>
                </div>
                ${renderSopSection(stateRef.current.sopState)}
                ${stateRef.current.suggestionHistory[stateRef.current.suggestionIndex] ? renderSuggestionHtml(stateRef.current.suggestionHistory[stateRef.current.suggestionIndex], stateRef.current.suggestionIndex, stateRef.current.suggestionHistory.length) : ''}
                <div class="pip-chat-header">
                    ${ICON.messageSquare}<span>Transcript</span>
                    <span class="count">${msgs.length}/${trans.length} msgs</span>
                </div>
                <div class="pip-chat" id="pip-scroll">${chatHtml}</div>
                <button id="pip-new-msg-btn" style="display:none;position:absolute;bottom:8px;left:50%;transform:translateX(-50%);padding:4px 12px;border-radius:16px;background:#6C4BF5;color:#fff;border:none;cursor:pointer;font-size:11px;font-weight:500;box-shadow:0 2px 8px rgba(108,75,245,0.4);z-index:20;align-items:center;gap:3px">
                    ${ICON.chevronDown} New messages
                </button>
            </div>`
        const scroll = doc.getElementById("pip-scroll")
        const newMsgBtn = doc.getElementById("pip-new-msg-btn")
        if (scroll) {
            if (pipScrollNearBottom) {
                scroll.scrollTop = scroll.scrollHeight
                if (newMsgBtn) newMsgBtn.style.display = 'none'
            } else {
                // Restore approximate scroll position
                scroll.scrollTop = pipScrollPos
                if (msgs.length > 0 && newMsgBtn) newMsgBtn.style.display = 'flex'
            }
            // 记录scroll位置给下次render用
            scroll.onscroll = () => {
                const nearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 60
                pipScrollNearBottom = nearBottom
                pipScrollPos = scroll.scrollTop
                if (nearBottom && newMsgBtn) newMsgBtn.style.display = 'none'
            }
            if (newMsgBtn) {
                newMsgBtn.onclick = () => {
                    scroll.scrollTop = scroll.scrollHeight
                    newMsgBtn.style.display = 'none'
                    pipScrollNearBottom = true
                }
            }
        }


    }

    // ──── Render: Post-Call Summary + Outcome ────

    function renderPostCallState(doc: Document, callId: string | null, sum: SummaryData | null, loading: boolean, outcome: string | null, saved: boolean, ci: { caller: string; callee: string; startTime: string; finalDuration: string } | null = null, notEnabled = false, timedOut = false, skipped = false) {
        const root = doc.getElementById("pip-root")
        if (!root) return

        const SENTIMENT_EMOJI: Record<string, string> = {
            positive: "😊", negative: "😟", neutral: "😐", frustrated: "😤",
            satisfied: "😌", angry: "😠", happy: "😄",
        }

        // 算通话方向
        const ciCallerNum = normalizeSIP(ci?.caller || '')
        const ciCalleeNum = normalizeSIP(ci?.callee || '')
        const ciIsIncoming = agentSip && ciCalleeNum.includes(agentSip)
        const ciRemoteNum = ciIsIncoming ? ciCallerNum : ciCalleeNum
        const ciDirIcon = ciIsIncoming ? ICON.phoneIncoming : ICON.phoneOutgoing
        const ciDirColor = ciIsIncoming ? '#10b981' : '#3b82f6'
        const ciDirBg = ciIsIncoming ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)'
        const ciDirLabel = ciIsIncoming ? 'Inbound' : 'Outbound'

        // Call info bar HTML
        const callInfoHtml = ci ? `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;background:#f9fafb;border:1px solid rgba(0,0,0,0.06);margin-bottom:10px">
                <div style="width:28px;height:28px;border-radius:6px;background:${ciDirBg};color:${ciDirColor};display:flex;align-items:center;justify-content:center;flex-shrink:0">
                    ${ciDirIcon}
                </div>
                <div style="flex:1;min-width:0">
                    <div style="font-size:13px;font-weight:600;color:#1a1a1a">${escapeHtml(ciRemoteNum || 'Unknown')}</div>
                    <div style="font-size:10px;color:#9ca3af">${ciDirLabel}${ci.finalDuration ? ` · ${ci.finalDuration}` : ''}</div>
                </div>
            </div>
        ` : ''

        // Outcome buttons
        const outcomeHtml = callId ? `
            <div>
                <div style="font-size:11px;font-weight:500;color:#9ca3af;margin-bottom:8px">Select Outcome</div>
                <div class="pip-outcome-row">
                    <button class="pip-outcome-btn ${outcome === 'success' ? 'active-success' : ''}" data-action="outcome" data-outcome="success">
                        <span style="font-size:16px">✅</span>Success
                    </button>
                    <button class="pip-outcome-btn ${outcome === 'failure' ? 'active-failure' : ''}" data-action="outcome" data-outcome="failure">
                        <span style="font-size:16px">❌</span>Failure
                    </button>
                    <button class="pip-outcome-btn ${outcome === 'follow_up' ? 'active-followup' : ''}" data-action="outcome" data-outcome="follow_up">
                        <span style="font-size:16px">⏰</span>Follow Up
                    </button>
                </div>
            </div>
            ${saved ? `<div class="pip-saved-badge">${ICON.checkCircle} Outcome Saved</div>` : ''}
        ` : ''

        // Summary content
        let summaryHtml = ''
        if (loading && !sum && !notEnabled) {
            summaryHtml = `
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                    <div style="display:flex;align-items:center;gap:6px;flex:1">
                        ${ICON.sparkles}
                        <span style="font-size:12px;font-weight:600;color:#6C4BF5">Generating AI Summary...</span>
                    </div>
                    ${ICON.loader}
                </div>
                ${[1, 2, 3].map(i => `
                    <div style="margin-bottom:6px">
                        <div style="height:6px;width:50px;border-radius:4px;background:#e5e7eb;margin-bottom:3px"></div>
                        <div style="height:10px;width:${50 + i * 15}%;border-radius:4px;background:#e5e7eb;animation:pulse 1.5s ease-in-out infinite"></div>
                    </div>
                `).join('')}`
        } else if (skipped) {
            summaryHtml = `
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px 10px;border-radius:6px;background:rgba(245, 158, 11, 0.06);border:1px solid rgba(245, 158, 11, 0.12)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                    <span style="font-size:12px;font-weight:600;color:#f59e0b">Not enough transcript, skip AI Summary</span>
                </div>
                <textarea id="pip-manual-summary" placeholder="Write your summary here..." style="width:100%;min-height:50px;border:1px solid #e5e7eb;border-radius:6px;padding:6px 8px;font-size:12px;line-height:1.4;resize:vertical;font-family:inherit;outline:none;background:#fafafa;color:#1a1a1a"></textarea>`
        } else if (notEnabled) {
            summaryHtml = `
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px 10px;border-radius:6px;background:rgba(239, 68, 68, 0.06);border:1px solid rgba(239, 68, 68, 0.12)">
                    <span style="font-size:16px">⚠️</span>
                    <span style="font-size:12px;font-weight:600;color:var(--text-muted, #94a3b8)">AI Summary not enabled</span>
                </div>
                <textarea id="pip-manual-summary" placeholder="Write your summary here..." style="width:100%;min-height:50px;border:1px solid #e5e7eb;border-radius:6px;padding:6px 8px;font-size:12px;line-height:1.4;resize:vertical;font-family:inherit;outline:none;background:#fafafa;color:#1a1a1a"></textarea>`
        } else if (!loading && !sum) {
            // LLM 超时降级: 显示手写 textarea
            summaryHtml = `
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                    <span style="font-size:12px;font-weight:600;color:#f59e0b">AI Summary unavailable</span>
                </div>
                <textarea id="pip-manual-summary" placeholder="Write your summary here..." style="width:100%;min-height:50px;border:1px solid #e5e7eb;border-radius:6px;padding:6px 8px;font-size:12px;line-height:1.4;resize:vertical;font-family:inherit;outline:none;background:#fafafa;color:#1a1a1a"></textarea>`
        } else if (sum) {
            const emoji = SENTIMENT_EMOJI[sum.sentiment?.toLowerCase() || ''] || '💬'
            const rows: string[] = []
            if (sum.intent) rows.push(summaryRow(ICON.target, 'Intent', sum.intent))
            if (sum.outcome) rows.push(summaryRow(ICON.fileText, 'AI Conclusion', sum.outcome))
            if (sum.nextAction) rows.push(summaryRow(ICON.arrowRight, 'Next Step', sum.nextAction))
            if (sum.sentiment) rows.push(summaryRow(ICON.smilePlus, 'Sentiment', `${emoji} ${sum.sentiment}`))

            // Entities — 需要安全解析, 可能以 JSON string 到达
            let entities: Record<string, any> = {}
            try {
                const raw = sum.entities
                entities = typeof raw === 'string' ? JSON.parse(raw) : (raw || {})
            } catch { entities = {} }
            const entityKeys = Object.keys(entities).filter(k => !['intent', 'outcome', 'next_action', 'sentiment'].includes(k))
            let entitiesHtml = ''
            if (entityKeys.length > 0) {
                entitiesHtml = `<div style="margin-top:6px">
                    <div class="pip-summary-label" style="margin-bottom:4px;display:flex;align-items:center;gap:4px">${ICON.tag} Entities</div>
                    <div style="display:flex;flex-wrap:wrap;gap:4px">
                        ${entityKeys.map(k => `<span style="font-size:10px;padding:2px 8px;border-radius:12px;background:rgba(108,75,245,0.1);color:#6C4BF5;font-weight:500">${escapeHtml(k)}: ${escapeHtml(typeof entities[k] === 'string' ? entities[k] : JSON.stringify(entities[k]))}</span>`).join('')}
                    </div>
                </div>`
            }
            summaryHtml = rows.join('') + entitiesHtml

            // rawSummary 段落
            if (sum.rawSummary) {
                summaryHtml += `<div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(108,75,245,0.06);border-left:3px solid #6C4BF5">
                    <div style="font-size:10px;font-weight:600;color:#6C4BF5;margin-bottom:4px;display:flex;align-items:center;gap:4px">${ICON.fileText} Summary</div>
                    <div style="font-size:11px;line-height:1.5;color:#374151">${escapeHtml(sum.rawSummary)}</div>
                </div>`
            }
        }

        root.innerHTML = `
            <div class="pip-container">
                <div class="pip-header">
                    <span class="pip-summary-title">Conversation Ended</span>
                    <button class="pip-close-btn" data-action="close">${ICON.close}</button>
                </div>
                <div class="pip-summary">
                    ${callInfoHtml}
                    ${outcomeHtml}
                    ${(loading || sum || summaryHtml) ? '<div class="pip-separator"></div>' : ''}
                    ${summaryHtml}
                    ${callId ? `
                    <div style="margin-top:10px;border-top:1px solid rgba(0,0,0,0.06);padding-top:8px">
                        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
                            <button class="pip-action-chip" data-action="wrapup-action" data-wrapup="followup">📋 Follow-up</button>
                            <button class="pip-action-chip" data-action="wrapup-action" data-wrapup="ticket">🏷️ Ticket</button>
                            <button class="pip-action-chip" data-action="wrapup-action" data-wrapup="callback">⏰ Callback</button>
                        </div>
                        <button class="pip-complete-btn" data-action="complete-wrapup">✅ Complete Wrap-up</button>
                    </div>` : ''}
                </div>
            </div>`

        // Outcome 按钮现在通过事件委托处理 (data-action="outcome")

        // Close 按钮通过事件委托处理 (data-action="close")
    }

    function summaryRow(icon: string, label: string, value: string): string {
        return `<div class="pip-summary-row">
            <div class="pip-summary-label">${icon} ${escapeHtml(label)}</div>
            <div class="pip-summary-value">${escapeHtml(value)}</div>
        </div>`
    }

    // ──── Render: Idle ────

    function renderIdleState(doc: Document) {
        const root = doc.getElementById("pip-root")
        if (!root) return
        root.innerHTML = `
            <div class="pip-container">
                <div class="pip-header">
                    <div class="pip-brand" style="font-size:13px">CXMI</div>
                    <span style="font-size:13px;color:#9ca3af;font-weight:500">Copilot</span>
                </div>
                <div class="pip-empty" style="flex:1">
                    <span>${ICON.phone}</span>
                    <span style="font-size:14px;font-weight:500;color:#374151">No Active Call</span>
                    <span style="font-size:12px;color:#9ca3af">Waiting for incoming call...</span>
                </div>
            </div>`
    }

    // ──── Launcher UI ────

    if (pipActive) {
        return (
            <div style={ls.container}>
                <div style={ls.card}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                    <h2 style={ls.title}>Always-on-Top Active</h2>
                    <p style={ls.subtitle}>The call view is floating on top of all windows.</p>
                    <p style={{ ...ls.subtitle, fontSize: 11, marginTop: 8 }}>You can minimize this tab.</p>
                </div>
            </div>
        )
    }

    return (
        <div style={ls.container}>
            <div style={ls.card}>
                <div style={ls.icon}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="3" width="20" height="14" rx="2" />
                        <rect x="12" y="11" width="10" height="10" rx="1" fill="white" fillOpacity="0.3" stroke="white" />
                    </svg>
                </div>
                <h2 style={ls.title}>
                    {error ? "⚠️ Error" : call ? "Call Active" : "Copilot Floating View"}
                </h2>
                <p style={ls.subtitle}>
                    {error ? error : call
                        ? `${normalizeSIP(call.callee)} — Click to pin on top`
                        : connected ? "Click to pin call view on top of all windows" : "Connecting to server..."}
                </p>
                {!error && (
                    <button onClick={activatePiP} autoFocus style={ls.btn}
                        onMouseEnter={e => { (e.target as HTMLElement).style.transform = 'scale(1.02)'; (e.target as HTMLElement).style.boxShadow = '0 6px 20px rgba(108,75,245,0.45)' }}
                        onMouseLeave={e => { (e.target as HTMLElement).style.transform = 'scale(1)'; (e.target as HTMLElement).style.boxShadow = '0 4px 12px rgba(108,75,245,0.35)' }}
                    >
                        📌 Pin Always-on-Top
                    </button>
                )}
                {error && <button onClick={() => window.close()} style={ls.btnSecondary}>Close</button>}
            </div>
        </div>
    )
}

const ls: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'linear-gradient(135deg, #f8f9ff 0%, #f0f0ff 50%, #fdf2f8 100%)',
        padding: 24, fontFamily: "'Inter', system-ui, sans-serif"
    },
    card: {
        background: 'white', borderRadius: 16, padding: 32, textAlign: 'center' as const,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', maxWidth: 340, width: '100%'
    },
    icon: {
        width: 56, height: 56, borderRadius: 16,
        background: 'linear-gradient(135deg, #6C4BF5, #8B5CF6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 16px', boxShadow: '0 4px 16px rgba(108,75,245,0.3)'
    },
    title: { fontSize: 18, fontWeight: 700, marginBottom: 6 },
    subtitle: { fontSize: 13, color: '#6b7280', marginBottom: 20, lineHeight: 1.5 },
    btn: {
        width: '100%', padding: '12px 24px', borderRadius: 10, border: 'none',
        background: 'linear-gradient(135deg, #6C4BF5, #8B5CF6)', color: 'white',
        cursor: 'pointer', fontWeight: 600, fontSize: 14,
        boxShadow: '0 4px 12px rgba(108,75,245,0.35)',
        transition: 'all 0.2s', fontFamily: 'inherit'
    },
    btnSecondary: {
        padding: '10px 24px', borderRadius: 10, border: '1px solid #e5e7eb',
        background: 'white', color: '#374151', cursor: 'pointer',
        fontWeight: 500, fontSize: 14, fontFamily: 'inherit'
    },
}

export default PiPLauncher
