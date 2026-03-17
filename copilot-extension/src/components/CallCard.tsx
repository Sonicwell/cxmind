import { useState, useEffect } from "react"
import { PhoneIncoming, PhoneOutgoing, Clock, Timer } from "lucide-react"
import type { CallEvent } from "~/hooks/useWebSocket"
import { useAuth } from "~/hooks/useAuth"
import { safeDate } from "~/utils/safeDate"

interface CallCardProps {
    call: CallEvent
}

function parseSIPInfo(uri: string): { name: string; number: string } {
    if (!uri) return { name: "Unknown", number: "" }

    // 兼容格式: "Name" <sip:1001@domain>, sip:1001@domain, 1001
    const nameMatch = uri.match(/^"?([^"<]+)"?\s*</)
    const numberMatch = uri.match(/sip:([^@>]+)/) || uri.match(/^(\d+)$/)

    return {
        name: nameMatch?.[1]?.trim() || numberMatch?.[1] || uri,
        number: numberMatch?.[1] || uri
    }
}

function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    return `${m}:${String(s).padStart(2, "0")}`
}

export function CallCard({ call }: CallCardProps) {
    const { agentInfo } = useAuth()
    const [elapsed, setElapsed] = useState(0)

    const isInbound = agentInfo?.sipNumber
        ? call.callee === agentInfo.sipNumber
        : false

    const remoteParty = isInbound
        ? parseSIPInfo(call.caller)
        : parseSIPInfo(call.callee)

    // Live duration counter
    useEffect(() => {
        if (call.status === "active" || call.status === "ringing") {
            const startTime = safeDate(call.start_time).getTime()
            const update = () => {
                setElapsed(Math.floor((Date.now() - startTime) / 1000))
            }
            update()
            const interval = setInterval(update, 1000)
            return () => clearInterval(interval)
        }
    }, [call.start_time, call.status])

    const statusColor =
        call.status === "active" ? "var(--success)" :
            call.status === "ringing" ? "var(--warning)" :
                "var(--text-muted)"

    return (
        <div className="call-card animate-fade-in">
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                <div className={`direction-badge ${isInbound ? "inbound" : "outbound"}`}>
                    {isInbound ? (
                        <><PhoneIncoming size={12} /> Inbound</>
                    ) : (
                        <><PhoneOutgoing size={12} /> Outbound</>
                    )}
                </div>
                <div
                    className="text-xs font-medium"
                    style={{ color: statusColor, textTransform: "capitalize" }}
                >
                    ● {call.status}
                </div>
            </div>

            <div style={{ marginBottom: 8 }}>
                <div className="font-semibold">{remoteParty.name}</div>
                {remoteParty.number !== remoteParty.name && (
                    <div className="text-sm text-muted">{remoteParty.number}</div>
                )}
            </div>

            <div className="flex items-center gap-sm text-xs text-muted">
                <Clock size={12} />
                <span>{safeDate(call.start_time).toLocaleTimeString()}</span>
                {(call.status === "active" || call.status === "ringing") && (
                    <>
                        <Timer size={12} style={{ marginLeft: 8 }} />
                        <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                            {formatDuration(elapsed)}
                        </span>
                    </>
                )}
            </div>
        </div>
    )
}
