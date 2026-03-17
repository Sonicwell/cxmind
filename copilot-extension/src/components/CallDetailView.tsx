import { useState, useEffect, useMemo } from "react"
import { ArrowLeft, Phone, Clock, FileText, BarChart3, Loader2, CheckCircle2, XCircle, Clock4, AlertCircle, Zap } from "lucide-react"
import { useApi } from "~/hooks/useApi"
import { useAuth } from "~/hooks/useAuth"
import { safeDate } from "~/utils/safeDate"
import { ContactContext360 } from "./CallerContext360"
import type { CallDetails, CallOutcome, AgentAction } from "~/types"

interface CallDetailViewProps {
  callId: string
  onBack: () => void
}

function normalizeSIP(uri: string): string {
  if (!uri) return ""
  // 从 "user" <sip:user@domain> 或 sip:user@domain 或 user 中取 user part
  const match = uri.match(/sip:([^@]+)/) || uri.match(/^(\d+)$/) || uri.match(/^([^"<]+)/)
  return match ? match[1].trim() : uri.trim()
}

function getInitials(name: string): string {
  const clean = normalizeSIP(name)
  return clean.slice(0, 1).toUpperCase()
}

// 坐席操作时间线——按 type 配置图标和颜色
const ACTION_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  crm_lookup: { icon: '🔍', color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
  refund: { icon: '💳', color: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
  voucher: { icon: '🎟️', color: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
  transfer: { icon: '↗️', color: '#d97706', bg: 'rgba(217,119,6,0.08)' },
  note: { icon: '📝', color: '#0891b2', bg: 'rgba(8,145,178,0.08)' },
  accept: { icon: '✅', color: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
  resolve: { icon: '🏁', color: '#7c3aed', bg: 'rgba(124,58,237,0.08)' },
  tag: { icon: '🏷️', color: '#64748b', bg: 'rgba(100,116,139,0.08)' },
  hold: { icon: '⏸️', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
}

function AgentActionTimeline({ actions }: { actions: AgentAction[] }) {
  if (!actions || actions.length === 0) return null
  return (
    <div className="detail-section glass-card" style={{ padding: 16, marginTop: 12 }}>
      <div className="flex items-center gap-sm" style={{ marginBottom: 12 }}>
        <Zap size={16} style={{ color: 'var(--primary)' }} />
        <span className="font-semibold">Agent Actions</span>
        <span className="text-xs text-muted">{actions.length} events</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
        {/* 竖线轨道 */}
        <div style={{
          position: 'absolute', left: 14, top: 8, bottom: 8,
          width: 2, background: 'var(--border-light)', borderRadius: 2,
          zIndex: 0,
        }} />
        {actions.map((action, i) => {
          const cfg = ACTION_CONFIG[action.type] || { icon: '⚡', color: '#64748b', bg: 'rgba(100,116,139,0.08)' }
          const timeStr = safeDate(action.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '6px 0', position: 'relative', zIndex: 1,
            }}>
              {/* 时间轴节点 */}
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: cfg.bg, border: `1.5px solid ${cfg.color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13,
              }}>
                {cfg.icon}
              </div>
              {/* 内容 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {action.label}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {timeStr}
                  </span>
                </div>
                {action.detail && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 2 }}>
                    {action.detail}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function CallDetailView({ callId, onBack }: CallDetailViewProps) {
  const { fetchApi, isInitialized, apiUrl } = useApi()
  const { agentInfo } = useAuth()
  const [details, setDetails] = useState<CallDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [localOutcome, setLocalOutcome] = useState<string | null>(null)

  useEffect(() => {
    if (details?.outcome?.outcome) {
      setLocalOutcome(details.outcome.outcome)
    }
  }, [details])

  const handleOutcome = async (outcome: 'success' | 'failure' | 'follow_up') => {
    try {
      setSubmitting(outcome)
      // Immediate local feedback
      setLocalOutcome(outcome)

      await fetchApi(`/api/agent/calls/${callId}/outcome`, {
        method: 'POST',
        body: JSON.stringify({ outcome })
      })

      // Optimistic details update (optional if strictly local state used for UI)
      setDetails(prev => prev ? ({
        ...prev,
        outcome: {
          ...prev.outcome,
          call_id: callId,
          outcome,
          source: 'manual',
          created_at: new Date().toISOString()
        } as CallOutcome
      }) : null)

      setSubmitting(null)
    } catch (e) {
      console.error("Failed to update outcome", e)
      setSubmitting(null)
      // Revert local outcome if failed?
      // setLocalOutcome(details?.outcome?.outcome || null)
    }
  }

  useEffect(() => {
    let cancelled = false

    if (!isInitialized) return

    async function load() {
      try {
        setIsLoading(true)
        const data = await fetchApi<CallDetails>(`/api/agent/calls/${callId}`)
        if (!cancelled) {
          setDetails(data)
          setIsLoading(false)
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message)
          setIsLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [callId, fetchApi, isInitialized])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center" style={{ padding: 40 }}>
        <Loader2 size={24} className="spin" style={{ color: "var(--primary)" }} />
      </div>
    )
  }

  if (error || !details) {
    return (
      <div className="detail-error">
        <button className="btn btn-sm btn-secondary" onClick={onBack}>
          <ArrowLeft size={14} /> Back
        </button>
        <p className="text-sm text-muted" style={{ marginTop: 16 }}>
          {error || "Call details not found"}
        </p>
      </div>
    )
  }

  const formatDuration = (s: number) => {
    const min = Math.floor(s / 60)
    const sec = s % 60
    return `${min}m ${sec}s`
  }

  return (
    <div className="call-detail-view animate-fade-in">
      <button className="btn btn-sm btn-secondary" onClick={onBack}>
        <ArrowLeft size={14} /> Back
      </button>

      {/* Contact 360 — 对方联系人画像 */}
      {(() => {
        const myNumber = agentInfo ? normalizeSIP(agentInfo.sipNumber) : ''
        const otherParty = normalizeSIP(details.caller) === myNumber ? details.callee : details.caller
        return otherParty ? (
          <div style={{ marginTop: 12 }}>
            <ContactContext360 callerId={otherParty} />
          </div>
        ) : null
      })()}

      {/* Call Info Card */}
      <div className="detail-section glass-card" style={{ padding: 16, marginTop: 12 }}>
        <div className="flex items-center gap-sm" style={{ marginBottom: 12 }}>
          <Phone size={16} style={{ color: "var(--primary)" }} />
          <span className="font-semibold">Call Information</span>
        </div>
        <div className="detail-grid">
          <div className="detail-field">
            <span className="detail-label">Caller</span>
            <span className="detail-value">{details.caller}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Callee</span>
            <span className="detail-value">{details.callee}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Status</span>
            <span className="detail-value" style={{ textTransform: "capitalize" }}>
              {details.status}
            </span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Duration</span>
            <span className="detail-value">
              {details.duration ? formatDuration(details.duration) : "—"}
            </span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Start</span>
            <span className="detail-value">
              {safeDate(details.startTime).toLocaleString()}
            </span>
          </div>
          <div className="detail-field">
            <span className="detail-label">End</span>
            <span className="detail-value">
              {details.endTime ? safeDate(details.endTime).toLocaleString() : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Summary */}
      {details.summary && (
        <div className="detail-section glass-card" style={{ padding: 16, marginTop: 12 }}>
          <div className="flex items-center gap-sm" style={{ marginBottom: 8 }}>
            <FileText size={16} style={{ color: "var(--primary)" }} />
            <span className="font-semibold">Summary</span>
          </div>
          <p className="text-sm" style={{ lineHeight: 1.6 }}>{details.summary}</p>
        </div>
      )}

      {/* Call Outcome */}
      <div className="detail-section glass-card" style={{ padding: 16, marginTop: 12 }}>
        <div className="flex items-center gap-sm" style={{ marginBottom: 12 }}>
          <CheckCircle2 size={16} style={{ color: "var(--primary)" }} />
          <span className="font-semibold">Call Outcome</span>
        </div>

        <div className="flex gap-sm w-full">
          {([
            { key: 'success' as const, emoji: '✅', label: 'Success', bg: 'rgba(34,197,94,0.12)', border: '#22c55e', text: '#16a34a' },
            { key: 'failure' as const, emoji: '❌', label: 'Failure', bg: 'rgba(239,68,68,0.12)', border: '#ef4444', text: '#dc2626' },
            { key: 'follow_up' as const, emoji: '⏰', label: 'Follow Up', bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', text: '#d97706' },
          ]).map(({ key, emoji, label, bg, border, text }) => {
            const active = localOutcome === key
            return (
              <button
                key={key}
                onClick={() => handleOutcome(key)}
                disabled={!!submitting}
                style={{
                  flex: 1, padding: '10px 8px', height: 'auto',
                  borderRadius: 10,
                  border: active ? `1.5px solid ${border}` : '1px solid var(--glass-border)',
                  background: active ? bg : 'var(--surface-bg)',
                  cursor: submitting ? 'default' : 'pointer',
                  textAlign: 'center' as const,
                  display: 'flex', flexDirection: 'column' as const,
                  alignItems: 'center', gap: 4,
                  transition: 'all 0.2s',
                  opacity: submitting && !active ? 0.5 : 1,
                  fontFamily: 'inherit',
                }}
              >
                {submitting === key
                  ? <Loader2 className="spin" size={18} />
                  : <span style={{ fontSize: 18 }}>{emoji}</span>
                }
                <span style={{ fontSize: 11, fontWeight: 500, color: active ? text : 'var(--text-muted)' }}>
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Quality Metrics */}
      <div className="detail-section glass-card" style={{ padding: 16, marginTop: 12 }}>
        <div className="flex items-center gap-sm" style={{ marginBottom: 12 }}>
          <BarChart3 size={16} style={{ color: "var(--primary)" }} />
          <span className="font-semibold">Quality Metrics</span>
        </div>
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-value">{Number(details.quality.mos).toFixed(1)}</div>
            <div className="metric-label">MOS</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{Number(details.quality.jitter).toFixed(1)}</div>
            <div className="metric-label">Jitter (ms)</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{Number(details.quality.packetLoss).toFixed(2)}%</div>
            <div className="metric-label">Packet Loss</div>
          </div>
        </div>
      </div>

      {/* Transcriptions */}
      {details.transcriptions?.length > 0 && (
        <div className="detail-section glass-card" style={{ padding: 16, marginTop: 12 }}>
          <div className="flex items-center gap-sm" style={{ marginBottom: 12 }}>
            <Clock size={16} style={{ color: "var(--primary)" }} />
            <span className="font-semibold">Transcription</span>
            <span className="text-xs text-muted">{details.transcriptions.length} messages</span>
          </div>
          <div className="transcript-chat-list">
            {details.transcriptions.map((t, i) => {
              const speaker = normalizeSIP(t.speaker)
              const caller = normalizeSIP(details.caller)
              const callee = normalizeSIP(details.callee)

              // Logic: match specific caller/callee or fallback
              // Usually in transcriptions: "1001" or "1002"
              // If matches caller (who initiated), usually Left? 
              // Wait, typical "Chat": ME is Right. 
              // If I am viewing history, who is "Me"? 
              // In history viewer, usually "Agent" (Me) is Right. "Customer" is Left.
              // 得知道这通 call里谁是agent
              // Assuming 'details.caller' or 'details.callee' is the agent.
              // For now, let's stick to the 'TranscriptionList' logic if possible, 
              // but here we don't strictly know 'myNumber' from `useAuth` inside this mapping easily without props.
              // Modification: Use simple heurustic: 
              // If speaker is 4 digits (extension) -> Right? No, calls are internal too.
              // Let's rely on standard: if it matches `details.caller`, Left. If `details.callee`, Right?
              // Actually, better: Reuse the layout. 
              // Let's assume the user viewing this IS the agent.
              // If we can't determine, default to logic: 
              // Alternate colors? No.
              // Let's use the specific logic: 
              // If we can import `useAuth`, we can check `agentInfo`.

              // Let's assume we can use `useAuth` content if we hook it up, but `CallDetailView` is inside `HistoryList`.
              // 试用 `details.caller` 匹配 `t.speaker`

              // For consistent ID:
              const myNumber = agentInfo ? normalizeSIP(agentInfo.sipNumber) : ""
              const speakerSIP = normalizeSIP(t.speaker || '')
              const isMe = (myNumber && (speakerSIP === myNumber || t.speaker?.includes(myNumber))) || t.speaker === "Me" || /^(Me|Agent)$/i.test(t.speaker || '')

              const initials = isMe && agentInfo?.displayName
                ? getInitials(agentInfo.displayName)
                : getInitials(t.speaker || '')

              // 坐席头像 URL
              const agentAvatarUrl = isMe && agentInfo?.avatar
                ? (agentInfo.avatar.startsWith('http') ? agentInfo.avatar : `${apiUrl}${agentInfo.avatar}`)
                : null

              return (
                <div key={i} className={`chat-row ${isMe ? "right" : "left"}`}>
                  {agentAvatarUrl ? (
                    <img
                      src={agentAvatarUrl}
                      alt="Agent"
                      className="chat-avatar"
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      className="chat-avatar"
                      style={{
                        background: isMe ? 'var(--primary)' : '#9ca3af'
                      }}
                    >
                      {initials}
                    </div>
                  )}

                  <div style={{ maxWidth: '85%' }}>
                    <div className="chat-speaker-label">
                      {isMe ? 'Agent' : 'Customer'} · {speaker}
                    </div>
                    <div className="chat-bubble">
                      {t.text}
                      <div className="chat-meta" style={{ color: isMe ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)' }}>
                        {safeDate(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Agent Actions Timeline */}
      {details.agentActions && details.agentActions.length > 0 && (
        <AgentActionTimeline actions={details.agentActions} />
      )}

      <style>{`
        .call-detail-view {
          padding-bottom: var(--spacing-lg);
        }
        /* ... existing styles ... */
        .detail-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--spacing-sm);
        }
        .detail-field {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .detail-label {
          font-size: 0.7rem;
          font-weight: 500;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .detail-value {
          font-size: 0.875rem;
          color: var(--text-primary);
        }
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--spacing-sm);
        }
        .metric-card {
          text-align: center;
          padding: var(--spacing-sm);
          border-radius: var(--radius-sm);
          background: var(--glass-highlight);
        }
        .metric-value {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--primary);
        }
        .metric-label {
          font-size: 0.7rem;
          color: var(--text-muted);
          margin-top: 2px;
        }
        
        /* Scrollbar */
        .transcript-chat-list::-webkit-scrollbar {
          width: 4px;
        }
        .transcript-chat-list::-webkit-scrollbar-track {
          background: transparent;
        }
        .transcript-chat-list::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.1);
          border-radius: 4px;
        }

        .detail-error {
          padding: var(--spacing-md);
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
