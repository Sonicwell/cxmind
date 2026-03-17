import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Phone, Mic, MicOff, ArrowDownToLine, User } from "lucide-react"
import type { CallEvent, Transcription } from "~/hooks/useWebSocket"
import { useAuth } from "~/hooks/useAuth"

interface PiPCallViewProps {
    call: CallEvent
    transcriptions: Transcription[]
    pipWindow: Window
    onClose: () => void
    asrEnabled?: boolean | null
}

/**
 * Compact call view rendered inside Document PiP window.
 * Uses React createPortal to render into the PiP window's #pip-root div.
 */
export function PiPCallView({ call, transcriptions, pipWindow, onClose, asrEnabled }: PiPCallViewProps) {
    const [duration, setDuration] = useState(0)
    const [isMuted, setIsMuted] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const { agentInfo } = useAuth()

    function normalizeSIP(uri: string): string {
        if (!uri) return ""
        const match = uri.match(/sip:([^@]+)/) || uri.match(/^(\d+)$/) || uri.match(/^([^"<]+)/)
        return match ? match[1].trim() : uri.trim()
    }
    const myNumber = agentInfo ? normalizeSIP(agentInfo.sipNumber) : ""

    // Timer
    useEffect(() => {
        const start = call.start_time || new Date().toISOString()
        const startTime = new Date(start).getTime()

        if (isNaN(startTime)) {
            setDuration(0)
            return
        }

        const timer = setInterval(() => {
            const now = Date.now()
            const diff = Math.floor((now - startTime) / 1000)
            setDuration(diff > 0 ? diff : 0)
        }, 1000)

        setDuration(Math.max(0, Math.floor((Date.now() - startTime) / 1000)))

        return () => clearInterval(timer)
    }, [call.start_time, call])

    // Auto-scroll transcriptions
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [transcriptions.length])

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, "0")}`
    }

    // Show last N transcriptions for compact view
    const recentTranscriptions = transcriptions.slice(-8)

    const mountEl = pipWindow.document.getElementById("pip-root")
    if (!mountEl) return null

    return createPortal(
        <div className="pip-container">
            {/* Header */}
            <div className="pip-header">
                <div className="pip-avatar">
                    <User size={18} />
                </div>
                <div className="pip-caller-info">
                    <div className="pip-caller-name">
                        {call.callee || call.callee_uri || "Unknown"}
                    </div>
                    <div className="pip-duration">
                        <span className="pip-live-dot" />
                        {formatTime(duration)}
                    </div>
                </div>
                <div className="pip-brand">CXMI</div>
            </div>

            {/* Transcription */}
            <div className="pip-transcript" ref={scrollRef}>
                {recentTranscriptions.length === 0 ? (
                    <div className="pip-empty">
                        {asrEnabled === false ? (
                            <>
                                <MicOff size={20} style={{ opacity: 0.4 }} />
                                <span style={{ fontWeight: 500, color: '#374151', fontSize: 13 }}>Transcript Not Enabled</span>
                                <span style={{ opacity: 0.5, fontSize: 11 }}>ASR is disabled for this agent</span>
                            </>
                        ) : (
                            <span style={{ opacity: 0.5, fontSize: 12 }}>Waiting for transcription...</span>
                        )}
                    </div>
                ) : (
                    recentTranscriptions.map((t, i) => {
                        const spk = normalizeSIP(t.speaker)
                        const isAgent = (myNumber && (spk === myNumber || t.speaker.includes(myNumber))) || /^(Me|Agent)$/i.test(t.speaker)
                        const initial = isAgent && agentInfo?.displayName
                            ? agentInfo.displayName.charAt(0)
                            : spk.slice(0, 1).toUpperCase()
                        return (
                            <div key={i} className={`pip-msg ${isAgent ? "pip-msg-right" : "pip-msg-left"}`}>
                                <div className="pip-msg-avatar" style={{
                                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                    background: isAgent ? '#6366f1' : '#9ca3af',
                                    color: '#fff', fontSize: 10, fontWeight: 600,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>{initial}</div>
                                <div className="pip-msg-bubble">
                                    {t.text}
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

            {/* Controls */}
            <div className="pip-controls">
                <button
                    className="pip-btn pip-btn-dock"
                    onClick={onClose}
                    title="Dock back to Side Panel"
                >
                    <ArrowDownToLine size={18} />
                </button>
            </div>
        </div>,
        mountEl
    )
}
