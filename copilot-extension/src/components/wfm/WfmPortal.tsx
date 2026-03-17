import { useState, useEffect, useRef } from "react"
import { useAuth } from "~/hooks/useAuth"
import { useApi } from "~/hooks/useApi"
import { ChevronLeft, ChevronRight, Plus, Clock, CalendarOff, Send, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { useTranslation } from 'react-i18next'

// Simple date helpers (no date-fns dependency)
function getMonday(d: Date): Date {
    const dt = new Date(d)
    const day = dt.getDay()
    const diff = dt.getDate() - day + (day === 0 ? -6 : 1)
    dt.setDate(diff)
    dt.setHours(0, 0, 0, 0)
    return dt
}

function addDaysTo(d: Date, n: number): Date {
    const dt = new Date(d)
    dt.setDate(dt.getDate() + n)
    return dt
}

function formatDate(d: Date, fmt: 'iso' | 'short' | 'day-name' | 'day-num'): string {
    switch (fmt) {
        case 'iso': {
            // Use local date to avoid UTC timezone shift
            const y = d.getFullYear()
            const m = String(d.getMonth() + 1).padStart(2, '0')
            const day = String(d.getDate()).padStart(2, '0')
            return `${y}-${m}-${day}`
        }
        case 'short': return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        case 'day-name': return d.toLocaleDateString('en-US', { weekday: 'short' })
        case 'day-num': return String(d.getDate())
    }
}

interface Shift {
    _id: string
    date: string
    startTime: string
    endTime: string
    status: string
}

interface WfmRequest {
    _id: string
    type: 'leave' | 'swap' | 'overtime'
    status: 'pending' | 'approved' | 'rejected'
    date: string
    reason?: string
    createdAt: string
}

type WfmView = 'schedule' | 'request' | 'my-requests'

export function WfmPortal() {
    const { agentInfo } = useAuth()
    const { fetchApi, isInitialized } = useApi()
    const { t } = useTranslation()
    const [shifts, setShifts] = useState<Shift[]>([])
    const [requests, setRequests] = useState<WfmRequest[]>([])
    const [loading, setLoading] = useState(true)
    const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
    const [view, setView] = useState<WfmView>('schedule')
    const [requestForm, setRequestForm] = useState({ type: 'leave' as const, date: '', reason: '' })
    const [submitting, setSubmitting] = useState(false)

    const weekEnd = addDaysTo(weekStart, 6)
    const today = formatDate(new Date(), 'iso')

    // Load shifts
    useEffect(() => {
        if (!isInitialized) return
        let cancelled = false
        const load = async () => {
            setLoading(true)
            try {
                const startDate = formatDate(weekStart, 'iso')
                const endDate = formatDate(weekEnd, 'iso')
                const data = await fetchApi(`/api/agent-wfm/my-shifts?startDate=${startDate}&endDate=${endDate}`)
                if (!cancelled) setShifts(data?.data || [])
            } catch (e) {
                console.warn('[WFM] Failed to load shifts:', e)
                if (!cancelled) setShifts([])
            }
            if (!cancelled) setLoading(false)
        }
        load()
        return () => { cancelled = true }
    }, [weekStart, isInitialized])

    // Load my requests + poll for status changes (toast notification)
    const prevRequestStatusRef = useRef<Map<string, string>>(new Map())
    const [toast, setToast] = useState<string | null>(null)

    useEffect(() => {
        if (!isInitialized) return
        let cancelled = false
        const load = async () => {
            try {
                const data = await fetchApi('/api/agent-wfm/my-requests')
                if (cancelled) return
                const newRequests: WfmRequest[] = data?.data || []
                setRequests(newRequests)

                // Check for status changes → toast notification
                const prevMap = prevRequestStatusRef.current
                for (const r of newRequests) {
                    const prev = prevMap.get(r._id)
                    if (prev && prev === 'pending' && r.status !== 'pending') {
                        const msg = r.status === 'approved'
                            ? `✅ ${t('wfm.requestApproved', 'Your {{type}} request was approved!', { type: r.type })}`
                            : `❌ ${t('wfm.requestRejected', 'Your {{type}} request was rejected.', { type: r.type })}`
                        setToast(msg)
                        setTimeout(() => setToast(null), 5000)
                        // Chrome desktop notification
                        chrome.notifications?.create?.({
                            type: 'basic', iconUrl: 'icon-128.png',
                            title: r.status === 'approved' ? `✅ ${t('wfm.approved', 'Request Approved')}` : `❌ ${t('wfm.rejected', 'Request Rejected')}`,
                            message: t('wfm.requestStatusMsg', 'Your {{type}} request for {{date}} was {{status}}.', { type: r.type, date: r.date, status: r.status }),
                            priority: 2,
                        })
                    }
                }
                // 更新tracking map
                const newMap = new Map<string, string>()
                for (const r of newRequests) newMap.set(r._id, r.status)
                prevRequestStatusRef.current = newMap
            } catch {
                console.warn('[WFM] Failed to load requests')
                if (!cancelled) setRequests([])
            }
        }
        load()
        // Poll every 30s for status updates
        const timer = setInterval(load, 30000)
        return () => { cancelled = true; clearInterval(timer) }
    }, [view, isInitialized])

    // Today's shift
    const todayShift = shifts.find(s => s.date?.startsWith(today))

    // Submit request
    const handleSubmitRequest = async () => {
        if (!requestForm.date || !requestForm.reason) return
        setSubmitting(true)
        try {
            await fetchApi('/api/agent-wfm/requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: requestForm.type,
                    requestedDate: requestForm.date,
                    reason: requestForm.reason,
                })
            })
            setRequestForm({ type: 'leave', date: '', reason: '' })
            setView('my-requests')
        } catch (e) { console.error('[WFM] Submit failed:', e) }
        setSubmitting(false)
    }

    if (view === 'request') {
        return (
            <div className="wfm-v2">
                <div className="wfm-v2-header">
                    <button onClick={() => setView('schedule')} className="wfm-back">← {t('common.back', 'Back')}</button>
                    <span className="wfm-v2-title">{t('wfm.newRequest', 'New Request')}</span>
                </div>
                <div className="wfm-v2-body">
                    <div className="wfm-form-group">
                        <label className="wfm-label">{t('wfm.type', 'Type')}</label>
                        <select
                            className="wfm-select"
                            value={requestForm.type}
                            onChange={e => setRequestForm(f => ({ ...f, type: e.target.value as any }))}
                        >
                            <option value="leave">🏖️ {t('wfm.leave', 'Leave')}</option>
                            <option value="swap">🔄 {t('wfm.shiftSwap', 'Shift Swap')}</option>
                            <option value="overtime">⏰ {t('wfm.overtime', 'Overtime')}</option>
                        </select>
                    </div>
                    <div className="wfm-form-group">
                        <label className="wfm-label">{t('wfm.date', 'Date')}</label>
                        <input
                            type="date"
                            className="wfm-input"
                            value={requestForm.date}
                            onChange={e => setRequestForm(f => ({ ...f, date: e.target.value }))}
                        />
                    </div>
                    <div className="wfm-form-group">
                        <label className="wfm-label">{t('wfm.reason', 'Reason')}</label>
                        <textarea
                            className="wfm-input"
                            rows={3}
                            placeholder={t('wfm.reasonPlaceholder', 'Brief reason...')}
                            value={requestForm.reason}
                            onChange={e => setRequestForm(f => ({ ...f, reason: e.target.value }))}
                        />
                    </div>
                    <button
                        className="wfm-submit-btn"
                        onClick={handleSubmitRequest}
                        disabled={submitting || !requestForm.date || !requestForm.reason}
                    >
                        {submitting ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                        {t('wfm.submitRequest', 'Submit Request')}
                    </button>
                </div>
                <WfmStyles />
            </div>
        )
    }

    if (view === 'my-requests') {
        return (
            <div className="wfm-v2">
                <div className="wfm-v2-header">
                    <button onClick={() => setView('schedule')} className="wfm-back">← {t('common.back', 'Back')}</button>
                    <span className="wfm-v2-title">{t('wfm.myRequests', 'My Requests')}</span>
                </div>
                <div className="wfm-v2-body">
                    {requests.length === 0 ? (
                        <div className="wfm-empty">{t('wfm.noRequests', 'No requests yet')}</div>
                    ) : (
                        requests.map(r => (
                            <div key={r._id} className="wfm-request-card">
                                <div className="wfm-req-top">
                                    <span className="wfm-req-type">
                                        {r.type === 'leave' ? '🏖️' : r.type === 'swap' ? '🔄' : '⏰'} {r.type}
                                    </span>
                                    <span className={`wfm-req-status wfm-req-${r.status}`}>
                                        {r.status === 'approved' ? <CheckCircle2 size={12} /> : r.status === 'rejected' ? <XCircle size={12} /> : <Clock size={12} />}
                                        {r.status}
                                    </span>
                                </div>
                                <div className="wfm-req-date">{r.date}</div>
                                {r.reason && <div className="wfm-req-reason">{r.reason}</div>}
                            </div>
                        ))
                    )}
                </div>
                <WfmStyles />
            </div>
        )
    }

    // Default: Schedule view
    return (
        <div className="wfm-v2">
            {/* Toast notification for approval status changes */}
            {toast && (
                <div style={{
                    padding: '8px 12px', marginBottom: 8, borderRadius: 8,
                    background: toast.startsWith('✅') ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                    color: toast.startsWith('✅') ? '#22c55e' : '#ef4444',
                    fontSize: '0.75rem', fontWeight: 600, textAlign: 'center',
                    animation: 'fadeIn 0.3s ease',
                }} onClick={() => setToast(null)}>
                    {toast}
                </div>
            )}
            {/* Today highlight */}
            {todayShift && (
                <div className="wfm-today-card">
                    <div className="wfm-today-label">📅 {t('wfm.todaysShift', "Today's Shift")}</div>
                    <div className="wfm-today-time">{todayShift.startTime} — {todayShift.endTime}</div>
                </div>
            )}
            {!todayShift && !loading && (
                <div className="wfm-today-card wfm-today-off">
                    <div className="wfm-today-label">🌴 {t('wfm.noShiftToday', 'No shift today')}</div>
                    <div className="wfm-today-time">{t('wfm.enjoyDayOff', 'Enjoy your day off!')}</div>
                </div>
            )}

            {/* Week nav */}
            <div className="wfm-week-nav">
                <button onClick={() => setWeekStart(w => addDaysTo(w, -7))} className="wfm-nav-btn"><ChevronLeft size={16} /></button>
                <span className="wfm-week-label">
                    {formatDate(weekStart, 'short')} — {formatDate(weekEnd, 'short')}
                </span>
                <button onClick={() => setWeekStart(w => addDaysTo(w, 7))} className="wfm-nav-btn"><ChevronRight size={16} /></button>
            </div>

            {/* Shift list */}
            <div className="wfm-shift-list-v2">
                {loading ? (
                    <div className="wfm-empty"><Loader2 size={18} className="spin" /> {t('common.loading', 'Loading...')}</div>
                ) : (
                    Array.from({ length: 7 }, (_, i) => {
                        const day = addDaysTo(weekStart, i)
                        const dateStr = formatDate(day, 'iso')
                        const shift = shifts.find(s => s.date?.startsWith(dateStr))
                        const isToday = dateStr === today
                        return (
                            <div key={dateStr} className={`wfm-day-row ${isToday ? 'wfm-day-today' : ''}`}>
                                <div className="wfm-day-label">
                                    <span className="wfm-day-name">{formatDate(day, 'day-name')}</span>
                                    <span className="wfm-day-num">{formatDate(day, 'day-num')}</span>
                                </div>
                                {shift ? (
                                    <div className="wfm-day-shift">
                                        <span>{shift.startTime} — {shift.endTime}</span>
                                        <span className={`wfm-shift-badge wfm-sb-${shift.status}`}>{shift.status}</span>
                                    </div>
                                ) : (
                                    <div className="wfm-day-off">{t('wfm.off', 'Off')}</div>
                                )}
                            </div>
                        )
                    })
                )}
            </div>

            {/* Quick actions */}
            <div className="wfm-actions">
                <button className="wfm-action-btn" onClick={() => setView('request')}>
                    <Plus size={14} /> {t('wfm.newRequest', 'New Request')}
                </button>
                <button className="wfm-action-btn wfm-action-sec" onClick={() => setView('my-requests')}>
                    📋 {t('wfm.myRequests', 'My Requests')} {requests.length > 0 && <span className="wfm-req-count">{requests.length}</span>}
                </button>
            </div>

            <WfmStyles />
        </div>
    )
}

function WfmStyles() {
    return (
        <style>{`
      .wfm-v2 { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
      .wfm-v2-header {
        display: flex; align-items: center; gap: 8px;
        padding-bottom: 8px; border-bottom: 1px solid var(--glass-border);
      }
      .wfm-back {
        background: none; border: none; color: var(--primary); cursor: pointer;
        font-size: 0.8rem; font-weight: 500; font-family: inherit; padding: 4px 0;
      }
      .wfm-v2-title { font-weight: 600; font-size: 0.85rem; }
      .wfm-v2-body { display: flex; flex-direction: column; gap: 10px; padding-top: 8px; }

      .wfm-today-card {
        padding: 14px 16px; border-radius: 10px;
        background: linear-gradient(135deg, rgba(108,75,245,0.08), rgba(168,85,247,0.06));
        border: 1px solid rgba(108,75,245,0.15);
      }
      .wfm-today-off {
        background: linear-gradient(135deg, rgba(34,197,94,0.06), rgba(16,185,129,0.04));
        border-color: rgba(34,197,94,0.15);
      }
      .wfm-today-label { font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px; }
      .wfm-today-time { font-weight: 700; font-size: 0.9rem; color: var(--text-primary); }

      .wfm-week-nav {
        display: flex; align-items: center; justify-content: space-between;
        background: var(--glass-bg); border: 1px solid var(--glass-border);
        border-radius: 8px; padding: 6px 10px;
      }
      .wfm-nav-btn {
        background: none; border: none; cursor: pointer; color: var(--text-muted);
        padding: 4px; border-radius: 4px; display: flex;
      }
      .wfm-nav-btn:hover { background: rgba(0,0,0,0.04); color: var(--primary); }
      .wfm-week-label { font-size: 0.78rem; font-weight: 600; color: var(--text-primary); }

      .wfm-shift-list-v2 { display: flex; flex-direction: column; gap: 2px; }
      .wfm-day-row {
        display: flex; align-items: center; gap: 12px; padding: 8px 12px;
        border-radius: 8px; transition: background 0.2s;
      }
      .wfm-day-row:hover { background: rgba(0,0,0,0.02); }
      .wfm-day-today { background: rgba(108,75,245,0.05); border: 1px solid rgba(108,75,245,0.1); }
      .wfm-day-label { width: 40px; text-align: center; flex-shrink: 0; }
      .wfm-day-name { display: block; font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase; }
      .wfm-day-num { display: block; font-size: 0.85rem; font-weight: 700; color: var(--text-primary); }
      .wfm-day-shift { flex: 1; display: flex; align-items: center; justify-content: space-between; font-size: 0.78rem; }
      .wfm-day-off { flex: 1; font-size: 0.75rem; color: var(--text-muted); font-style: italic; }
      .wfm-shift-badge {
        font-size: 0.6rem; padding: 2px 6px; border-radius: 4px; font-weight: 600;
        text-transform: uppercase;
      }
      .wfm-sb-published { background: rgba(34,197,94,0.1); color: #16a34a; }
      .wfm-sb-draft { background: rgba(245,158,11,0.1); color: #d97706; }
      .wfm-sb-leave { background: rgba(239,68,68,0.1); color: #dc2626; }

      .wfm-actions { display: flex; gap: 8px; }
      .wfm-action-btn {
        flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
        padding: 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 600;
        font-family: inherit; cursor: pointer; transition: all 0.2s;
        background: var(--primary); color: white; border: none;
      }
      .wfm-action-btn:hover { opacity: 0.9; transform: translateY(-1px); }
      .wfm-action-sec {
        background: var(--glass-bg); color: var(--text-primary);
        border: 1px solid var(--glass-border);
      }
      .wfm-req-count {
        background: var(--danger); color: white; border-radius: 8px;
        font-size: 0.6rem; padding: 1px 5px; min-width: 16px; text-align: center;
      }

      .wfm-empty {
        display: flex; flex-direction: column; align-items: center; gap: 8px;
        padding: 24px; color: var(--text-muted); font-size: 0.8rem;
      }

      .wfm-request-card {
        padding: 12px; border: 1px solid var(--glass-border); border-radius: 8px;
        background: var(--glass-bg);
      }
      .wfm-req-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
      .wfm-req-type { font-size: 0.78rem; font-weight: 600; text-transform: capitalize; }
      .wfm-req-status {
        display: flex; align-items: center; gap: 3px;
        font-size: 0.65rem; font-weight: 600; text-transform: uppercase;
        padding: 2px 6px; border-radius: 4px;
      }
      .wfm-req-pending { background: rgba(245,158,11,0.1); color: #d97706; }
      .wfm-req-approved { background: rgba(34,197,94,0.1); color: #16a34a; }
      .wfm-req-rejected { background: rgba(239,68,68,0.1); color: #dc2626; }
      .wfm-req-date { font-size: 0.75rem; color: var(--text-muted); }
      .wfm-req-reason { font-size: 0.72rem; color: var(--text-muted); margin-top: 4px; font-style: italic; }

      .wfm-form-group { display: flex; flex-direction: column; gap: 4px; }
      .wfm-label { font-size: 0.72rem; font-weight: 600; color: var(--text-muted); }
      .wfm-select, .wfm-input {
        padding: 8px 10px; border: 1px solid var(--glass-border); border-radius: 6px;
        font-size: 0.8rem; font-family: inherit; background: white;
        color: var(--text-primary); transition: border-color 0.2s;
      }
      .wfm-select:focus, .wfm-input:focus {
        outline: none; border-color: var(--primary);
        box-shadow: 0 0 0 2px rgba(108,75,245,0.1);
      }
      .wfm-submit-btn {
        display: flex; align-items: center; justify-content: center; gap: 6px;
        padding: 10px; border-radius: 8px; font-size: 0.8rem; font-weight: 600;
        font-family: inherit; cursor: pointer;
        background: var(--primary); color: white; border: none;
      }
      .wfm-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .spin { animation: spin-anim 1s linear infinite; }
      @keyframes spin-anim { to { transform: rotate(360deg); } }
    `}</style>
    )
}
