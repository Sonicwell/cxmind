import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
    onSend: (text: string) => void;
    disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
    const [text, setText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSend = () => {
        if (!text.trim() || disabled) return;
        onSend(text.trim());
        setText("");
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'; // 重置高度
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [text]);

    return (
        <div className="chat-input-container">
            <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                disabled={disabled}
                rows={1}
                className="chat-textarea"
            />
            <button
                onClick={handleSend}
                disabled={!text.trim() || disabled}
                className="chat-send-btn"
            >
                <Send size={18} />
            </button>
            <style>{`
                .chat-input-container {
                    flex-shrink: 0;
                    padding: 12px;
                    background: var(--glass-bg, rgba(255,255,255,0.7));
                    backdrop-filter: blur(8px);
                    border-top: 1px solid var(--glass-border);
                    display: flex;
                    gap: 8px;
                    align-items: flex-end;
                }
                .chat-textarea {
                    flex: 1;
                    background: var(--glass-bg, rgba(255,255,255,0.5));
                    border: 1px solid var(--glass-border);
                    border-radius: 12px;
                    padding: 8px 12px;
                    font-size: 14px;
                    font-family: inherit;
                    resize: none;
                    outline: none;
                    min-height: 36px;
                    max-height: 120px;
                    color: var(--text-primary, var(--foreground));
                }
                .chat-textarea:focus {
                    border-color: var(--primary);
                }
                [data-theme="dark"] .chat-input-container {
                    background: hsla(var(--surface-hue), 15%, 10%, 0.9);
                    border-color: hsla(var(--surface-hue), 10%, 25%, 0.4);
                }
                [data-theme="dark"] .chat-textarea {
                    background: hsla(var(--surface-hue), 15%, 14%, 0.8);
                    color: var(--text-primary);
                    border-color: hsla(var(--surface-hue), 10%, 25%, 0.3);
                }
                [data-theme="dark"] .chat-textarea:focus {
                    border-color: var(--primary);
                    background: hsla(var(--surface-hue), 15%, 18%, 0.9);
                }
                .chat-send-btn {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    background: var(--primary);
                    color: white;
                    border: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s;
                    flex-shrink: 0;
                }
                .chat-send-btn:hover:not(:disabled) {
                    transform: scale(1.05);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                .chat-send-btn:disabled {
                    background: var(--glass-border);
                    color: var(--muted);
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    );
}
