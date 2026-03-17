
import { Lightbulb, Copy, Check, ArrowRight, ChevronDown, MessageCircle, AlertTriangle, HelpCircle, RotateCw, Search, FileText } from "lucide-react"
import type { AISuggestion } from "~/hooks/useWebSocket"
import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useApi } from "~/hooks/useApi"

interface SuggestionsPanelProps {
  suggestions: AISuggestion[]
  readOnly?: boolean
  /** Voice 模式下 Correct 按钮低调 */
  isVoice?: boolean
  callId?: string
  contactId?: string
}

// 根据 type 决定图标/颜色
const TYPE_CONFIG: Record<string, { icon: typeof Lightbulb; bg: string; color: string; label: string }> = {
  tip: { icon: Lightbulb, bg: 'rgba(108,75,245,0.10)', color: '#6c4bf5', label: 'TIP' },
  alert: { icon: AlertTriangle, bg: 'rgba(239,68,68,0.10)', color: '#dc2626', label: 'ALERT' },
  chitchat: { icon: MessageCircle, bg: 'rgba(148,163,184,0.12)', color: '#888', label: 'CHITCHAT' },
  unknown: { icon: HelpCircle, bg: 'rgba(245,158,11,0.10)', color: '#b45309', label: 'UNKNOWN' },
}

export function SuggestionsPanel({ suggestions, readOnly, isVoice, callId, contactId }: SuggestionsPanelProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(suggestions.length)
  const [hasNew, setHasNew] = useState(false)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [collapsed, setCollapsed] = useState(false)

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    setIsNearBottom(near)
    if (near) setHasNew(false)
  }, [])

  useEffect(() => {
    if (suggestions.length > prevCountRef.current) {
      if (isNearBottom && !collapsed) {
        const el = listRef.current
        if (el) el.scrollTop = el.scrollHeight
      } else {
        setHasNew(true)
      }
    }
    prevCountRef.current = suggestions.length
  }, [suggestions.length, isNearBottom, collapsed])

  const scrollToLatest = useCallback(() => {
    setCollapsed(false)
    setTimeout(() => {
      const el = listRef.current
      if (el) el.scrollTop = el.scrollHeight
    }, 100)
    setHasNew(false)
    setIsNearBottom(true)
  }, [])

  return (
    <div className="suggestions-panel glass-panel" style={{ marginTop: 12, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', maxHeight: collapsed ? 'none' : '40vh' }}>
      <div
        className="suggestions-header"
        onClick={() => setCollapsed(c => !c)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <Lightbulb size={14} className="text-warning" />
        <span className="font-medium text-sm">Suggestions</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {suggestions.length}
        </span>
        {readOnly && (
          <span style={{
            fontSize: '0.65rem', padding: '1px 6px', borderRadius: 8, marginLeft: 6,
            background: 'var(--glass-highlight)', color: 'var(--text-muted)', fontWeight: 500
          }}>
            📋 Post-call
          </span>
        )}
        <ChevronDown size={14} style={{
          color: 'var(--text-muted)', transition: 'transform 0.2s',
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          marginLeft: 4, flexShrink: 0,
        }} />
      </div>

      {!collapsed && (
        <>
          <div
            ref={listRef}
            onScroll={handleScroll}
            style={{ flex: 1, overflowY: 'auto', position: 'relative' }}
          >
            <div className="suggestions-list">
              <AnimatePresence initial={false}>
                {suggestions.map((s, i) => (
                  <SuggestionItem key={s.id || i} suggestion={s} readOnly={readOnly} isVoice={isVoice} callId={callId} contactId={contactId} />
                ))}
              </AnimatePresence>
            </div>
          </div>
        </>
      )}

      {/* 新 suggestion 浮动提示 — 折叠时也显示 */}
      <AnimatePresence>
        {hasNew && (
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            onClick={scrollToLatest}
            style={{
              position: collapsed ? 'relative' : 'absolute',
              bottom: collapsed ? 'auto' : 10,
              left: '50%', transform: 'translateX(-50%)',
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 14px', borderRadius: 20, border: 'none',
              background: 'var(--primary)', color: '#fff',
              cursor: 'pointer', fontSize: 11, fontWeight: 600,
              boxShadow: '0 2px 12px rgba(108,75,245,0.4)',
              zIndex: 20, fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              margin: collapsed ? '6px auto' : undefined,
            }}
          >
            <ChevronDown size={13} />
            New suggestion
          </motion.button>
        )}
      </AnimatePresence>

      <style>{`
        .suggestions-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: rgba(255,250,235, 0.3);
          border-bottom: 1px solid rgba(251, 191, 36, 0.1);
        }
        [data-theme="dark"] .suggestions-header {
          background: hsla(35, 40%, 15%, 0.3);
        }
        .suggestions-list {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
      `}</style>
    </div>
  )
}

function SuggestionItem({ suggestion, readOnly, isVoice, callId, contactId }: { suggestion: AISuggestion; readOnly?: boolean; isVoice?: boolean; callId?: string; contactId?: string }) {
  const [copied, setCopied] = useState(false)
  const [showCorrect, setShowCorrect] = useState(false)
  const [corrected, setCorrected] = useState(false)
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)
  const api = useApi()

  const cfg = TYPE_CONFIG[suggestion.type] || TYPE_CONFIG.tip
  const Icon = cfg.icon

  // 空文本保护
  if (!suggestion.text?.trim()) return null

  const handleCopy = () => {
    navigator.clipboard.writeText(suggestion.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    api.fetchApi('/api/telemetry/events', {
      method: 'POST',
      body: JSON.stringify({ callId, contactId, eventType: 'suggestion_copy', eventData: { suggestionId: suggestion.id, textSnippet: suggestion.text.slice(0, 30) } })
    }).catch(console.error)
  }

  const handleCorrect = (newCategory: string) => {
    setCorrected(true)
    setShowCorrect(false)
    setTimeout(() => setCorrected(false), 3000)
    api.fetchApi('/api/telemetry/events', {
      method: 'POST',
      body: JSON.stringify({ callId, contactId, eventType: 'suggestion_correct', eventData: { suggestionId: suggestion.id, original: suggestion.intent?.category, corrected: newCategory } })
    }).catch(console.error)
  }

  const handleFeedback = (type: 'up' | 'down') => {
    setFeedback(type)
    api.fetchApi('/api/telemetry/events', {
      method: 'POST',
      body: JSON.stringify({ callId, contactId, eventType: 'suggestion_feedback', eventData: { suggestionId: suggestion.id, feedback: type } })
    }).catch(console.error)
  }

  const handleApply = () => {
    api.fetchApi('/api/telemetry/events', {
      method: 'POST',
      body: JSON.stringify({ callId, contactId, eventType: 'suggestion_apply', eventData: { suggestionId: suggestion.id } })
    }).catch(console.error)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: readOnly ? 0.75 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="suggestion-card group"
    >
      {/* 分类 badge */}
      <div className="suggestion-badge" style={{ background: cfg.bg, color: cfg.color, marginBottom: 6 }}>
        <Icon size={10} style={{ marginRight: 3 }} />
        {cfg.label}
      </div>

      <div className="text-sm" style={{ lineHeight: 1.4 }}>
        {suggestion.text}
      </div>

      {/* Intent reasoning */}
      {suggestion.intent && (
        <div style={{
          fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4,
          display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap'
        }}>
          <span style={{
            background: 'var(--glass-highlight)', padding: '1px 5px', borderRadius: 4,
          }}>
            {suggestion.intent.category} ({Math.round(suggestion.intent.confidence * 100)}%)
          </span>
          <span style={{ fontStyle: 'italic' }}>{suggestion.intent.reasoning}</span>
        </div>
      )}

      {/* Source 标注 */}
      {suggestion.source && (
        <div style={{
          fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 3,
          display: 'flex', alignItems: 'center', gap: 3
        }}>
          <FileText size={10} />
          Source: {suggestion.source.title} ({Math.round(suggestion.source.score * 100)}%)
        </div>
      )}

      {!readOnly && (
        <div className="suggestion-actions" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
          <button
            className="btn btn-sm btn-secondary"
            onClick={handleCopy}
            style={{ fontSize: '0.75rem', padding: '4px 8px', gap: 4 }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>

          {/* Voice: 👍/👎 反馈;  OmniChannel: Apply 插入文本 */}
          {isVoice ? (
            <div style={{ display: 'flex', gap: 2 }}>
              <button
                onClick={() => handleFeedback('up')}
                disabled={feedback !== null}
                style={{
                  padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)',
                  background: feedback === 'up' ? 'rgba(34,197,94,0.15)' : 'transparent',
                  color: feedback === 'up' ? 'var(--success, #22c55e)' : 'var(--text-muted)',
                  cursor: feedback !== null ? 'default' : 'pointer', fontSize: '0.8rem',
                  opacity: feedback === 'down' ? 0.3 : 1,
                }}
              >👍</button>
              <button
                onClick={() => handleFeedback('down')}
                disabled={feedback !== null}
                style={{
                  padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)',
                  background: feedback === 'down' ? 'rgba(239,68,68,0.15)' : 'transparent',
                  color: feedback === 'down' ? 'var(--danger, #ef4444)' : 'var(--text-muted)',
                  cursor: feedback !== null ? 'default' : 'pointer', fontSize: '0.8rem',
                  opacity: feedback === 'up' ? 0.3 : 1,
                }}
              >👎</button>
            </div>
          ) : (
            <>
              <button
                className="btn btn-sm btn-primary"
                onClick={handleApply}
                style={{ fontSize: '0.75rem', padding: '4px 8px', gap: 4 }}
              >
                <ArrowRight size={12} />
                Apply
              </button>
              {/* Chat 模式也提供 👍/👎 */}
              <div style={{ display: 'flex', gap: 2 }}>
                <button
                  onClick={() => handleFeedback('up')}
                  disabled={feedback !== null}
                  style={{
                    padding: '3px 5px', borderRadius: 4, border: '1px solid var(--border)',
                    background: feedback === 'up' ? 'rgba(34,197,94,0.15)' : 'transparent',
                    color: feedback === 'up' ? 'var(--success, #22c55e)' : 'var(--text-muted)',
                    cursor: feedback !== null ? 'default' : 'pointer', fontSize: '0.72rem',
                    opacity: feedback === 'down' ? 0.3 : 1,
                  }}
                >👍</button>
                <button
                  onClick={() => handleFeedback('down')}
                  disabled={feedback !== null}
                  style={{
                    padding: '3px 5px', borderRadius: 4, border: '1px solid var(--border)',
                    background: feedback === 'down' ? 'rgba(239,68,68,0.15)' : 'transparent',
                    color: feedback === 'down' ? 'var(--danger, #ef4444)' : 'var(--text-muted)',
                    cursor: feedback !== null ? 'default' : 'pointer', fontSize: '0.72rem',
                    opacity: feedback === 'up' ? 0.3 : 1,
                  }}
                >👎</button>
              </div>
            </>
          )}

          {/* Correct 按钮 */}
          {suggestion.intent && !corrected && (
            <button
              onClick={() => setShowCorrect(!showCorrect)}
              style={{
                fontSize: '0.65rem', padding: '3px 6px', gap: 3,
                background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center',
                color: 'var(--text-muted)',
                opacity: isVoice ? 0.3 : 0.7,
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = isVoice ? '0.3' : '0.7')}
              title="Correct this classification"
            >
              <RotateCw size={10} />
              Correct
            </button>
          )}
          {corrected && (
            <span style={{ fontSize: '0.65rem', color: 'var(--success, #22c55e)' }}>✓ Feedback saved</span>
          )}
        </div>
      )}

      {/* Correct 展开选项 */}
      <AnimatePresence>
        {showCorrect && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', display: 'flex', gap: 4, marginTop: 4 }}
          >
            {suggestion.intent?.category !== 'actionable' && (
              <button
                onClick={() => handleCorrect('actionable')}
                style={{ fontSize: '0.6rem', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--primary)', background: 'transparent', color: 'var(--primary)', cursor: 'pointer' }}
              >
                Actually actionable
              </button>
            )}
            {suggestion.intent?.category !== 'chitchat' && (
              <button
                onClick={() => handleCorrect('chitchat')}
                style={{ fontSize: '0.6rem', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--text-muted)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                Actually chitchat
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// KB 手动搜索组件
function KBSearchBox() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const api = useApi()

  const doSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const resp = await api.fetchApi<{ results: any[] }>(`/api/knowledge/search?q=${encodeURIComponent(query)}&limit=3`)
      setResults(resp.results || [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '8px 12px' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', padding: 0, width: '100%',
        }}
      >
        <Search size={12} />
        Ask Knowledge Base
        <ChevronDown size={12} style={{ marginLeft: 'auto', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doSearch()}
                placeholder="Type your question..."
                style={{
                  flex: 1, fontSize: '0.75rem', padding: '6px 8px',
                  border: '1px solid var(--border)', borderRadius: 6,
                  background: 'var(--bg-primary)', color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
              <button
                onClick={doSearch}
                disabled={loading}
                className="btn btn-sm btn-primary"
                style={{ fontSize: '0.7rem', padding: '4px 10px' }}
              >
                {loading ? '...' : 'Go'}
              </button>
            </div>

            {results.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {results.map((r: any) => (
                  <div key={r.id} style={{
                    padding: '8px 10px', borderRadius: 6,
                    background: 'var(--glass-highlight)', border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      <FileText size={11} color="var(--primary)" />
                      <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>{r.title}</span>
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        {Math.round((r.score || 0) * 100)}%
                      </span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {r.content?.slice(0, 150)}{r.content?.length > 150 ? '...' : ''}
                    </div>
                    <button
                      onClick={() => handleCopy(r.content, r.id)}
                      style={{
                        marginTop: 4, fontSize: '0.6rem', padding: '2px 6px',
                        borderRadius: 4, border: '1px solid var(--border)',
                        background: 'transparent', cursor: 'pointer',
                        color: copiedId === r.id ? 'var(--success, #22c55e)' : 'var(--text-muted)',
                      }}
                    >
                      {copiedId === r.id ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
