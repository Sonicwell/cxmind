import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, Zap, RefreshCw } from "lucide-react"
import { useApi } from "~/hooks/useApi"

interface SmartReplyProps {
    channelId: string
    lastMessage?: string       // last received message text
    onInsert: (text: string) => void
}

// Context-aware canned responses
const QUICK_REPLIES = [
    { text: "I'll look into that right away", emoji: "🔍" },
    { text: "Let me check that for you", emoji: "🔎" },
    { text: "Thank you for your patience", emoji: "🙏" },
    { text: "Is there anything else I can help with?", emoji: "💬" },
    { text: "I understand your concern", emoji: "💡" },
    { text: "I'll escalate this to our specialist team", emoji: "🔄" },
]

// Intent-based suggestions based on last message keywords
function getSuggestions(lastMsg?: string): { text: string; emoji: string }[] {
    if (!lastMsg) return QUICK_REPLIES.slice(0, 3)

    const lower = lastMsg.toLowerCase()
    const results: { text: string; emoji: string }[] = []

    // Greeting patterns
    if (/\b(hi|hello|hey|good morning|good afternoon)\b/.test(lower)) {
        results.push(
            { text: "Hello! How can I help you today?", emoji: "👋" },
            { text: "Welcome! What can I assist you with?", emoji: "🌟" },
        )
    }

    // Problem/complaint patterns
    if (/\b(issue|problem|broken|not working|error|bug|wrong)\b/.test(lower)) {
        results.push(
            { text: "I'm sorry to hear that. Let me investigate right away.", emoji: "🔧" },
            { text: "I understand the frustration. Let me check what's going on.", emoji: "🔍" },
            { text: "Could you share more details so I can help resolve this?", emoji: "📋" },
        )
    }

    // Billing/payment patterns
    if (/\b(bill|payment|charge|invoice|refund|subscription)\b/.test(lower)) {
        results.push(
            { text: "Let me pull up your account details.", emoji: "💳" },
            { text: "I'll review the charges on your account.", emoji: "📊" },
        )
    }

    // Urgency patterns
    if (/\b(urgent|asap|immediately|emergency|critical)\b/.test(lower)) {
        results.push(
            { text: "I understand this is urgent. I'm prioritizing your request now.", emoji: "🚨" },
            { text: "Let me fast-track this for you right away.", emoji: "⚡" },
        )
    }

    // Thank you patterns
    if (/\b(thank|thanks|appreciate)\b/.test(lower)) {
        results.push(
            { text: "You're welcome! Happy to help.", emoji: "😊" },
            { text: "Glad I could help! Anything else?", emoji: "✨" },
        )
    }

    // Question patterns
    if (/\b(how|what|when|where|can you|could you)\b/.test(lower)) {
        results.push(
            { text: "Great question! Let me explain.", emoji: "💡" },
            { text: "Sure, I can help with that.", emoji: "✅" },
        )
    }

    // Default fallback
    if (results.length === 0) {
        return QUICK_REPLIES.slice(0, 3)
    }

    return results.slice(0, 3)
}

export function SmartReplyChips({ channelId, lastMessage, onInsert }: SmartReplyProps) {
    const [replies, setReplies] = useState(getSuggestions(lastMessage))
    const [visible, setVisible] = useState(true)
    const [loading, setLoading] = useState(false)

    // 最后一条消息变了就更新suggestions
    useEffect(() => {
        setReplies(getSuggestions(lastMessage))
        setVisible(true)
    }, [lastMessage, channelId])

    const handleClick = (text: string) => {
        onInsert(text)
        setVisible(false)
    }

    const handleRefresh = () => {
        setLoading(true)
        // Shuffle and pick different suggestions
        const all = [...QUICK_REPLIES].sort(() => Math.random() - 0.5)
        setTimeout(() => {
            setReplies(all.slice(0, 3))
            setLoading(false)
        }, 300)
    }

    if (!visible || replies.length === 0) return null

    return (
        <div className="smart-reply-bar">
            <div className="smart-reply-label">
                <Sparkles size={10} />
                <span>Suggested</span>
                <button className="smart-reply-refresh" onClick={handleRefresh} disabled={loading}>
                    <RefreshCw size={10} className={loading ? 'spin' : ''} />
                </button>
            </div>
            <div className="smart-reply-chips">
                <AnimatePresence mode="popLayout">
                    {replies.map((r, i) => (
                        <motion.button
                            key={`${r.text}-${i}`}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ delay: i * 0.05 }}
                            className="smart-reply-chip"
                            onClick={() => handleClick(r.text)}
                        >
                            <span className="smart-reply-emoji">{r.emoji}</span>
                            <span className="smart-reply-text">{r.text}</span>
                        </motion.button>
                    ))}
                </AnimatePresence>
            </div>

            <style>{`
        .smart-reply-bar {
          flex-shrink: 0;
          padding: 6px 12px 2px;
          border-top: 1px solid var(--glass-border);
          background: rgba(255,255,255,0.5);
          max-height: 140px;
          overflow-y: auto;
        }
        .smart-reply-label {
          display: flex; align-items: center; gap: 4px;
          font-size: 0.58rem; color: var(--text-muted); margin-bottom: 4px;
          text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;
        }
        .smart-reply-refresh {
          background: none; border: none; cursor: pointer; color: var(--text-muted);
          padding: 2px; display: flex; margin-left: auto;
        }
        .smart-reply-refresh:hover { color: var(--primary); }
        .smart-reply-chips {
          display: flex; flex-direction: column; gap: 4px; padding-bottom: 6px;
        }
        .smart-reply-chip {
          display: flex; align-items: center; gap: 6px;
          background: rgba(108,75,245,0.04); border: 1px solid rgba(108,75,245,0.1);
          border-radius: 8px; padding: 6px 10px; cursor: pointer;
          font-family: inherit; text-align: left; transition: all 0.15s;
          width: 100%;
        }
        .smart-reply-chip:hover {
          background: rgba(108,75,245,0.08); border-color: rgba(108,75,245,0.2);
          transform: translateX(2px);
        }
        .smart-reply-emoji { font-size: 0.75rem; flex-shrink: 0; }
        .smart-reply-text {
          font-size: 0.68rem; color: var(--text-primary);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .spin { animation: spin-anim 1s linear infinite; }
        @keyframes spin-anim { to { transform: rotate(360deg); } }
      `}</style>
        </div>
    )
}
