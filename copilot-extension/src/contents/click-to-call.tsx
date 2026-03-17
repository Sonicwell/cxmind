
import cssText from "data-text:~/style.css"
import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useState } from "react"
import { Phone, Copy, UserPlus } from "lucide-react"
import { useStorage } from "@plasmohq/storage/hook"
import { INITIAL_SETTINGS } from "../hooks/useSettings"

export const config: PlasmoCSConfig = {
    matches: ["<all_urls>"],
    run_at: "document_idle"
}

export const getStyle = () => {
    const style = document.createElement("style")
    style.textContent = `
        ${cssText}
        .cxmind-tooltip {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(108, 75, 245, 0.2);
            border-radius: 12px;
            padding: 8px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.15);
            display: flex;
            gap: 8px;
            pointer-events: auto;
            animation: slideUp 0.2s ease-out;
            transform-origin: center bottom;
            z-index: 2147483647;
            position: fixed;
        }
        .cxmind-btn {
            width: 36px;
            height: 36px;
            border-radius: 8px;
            border: none;
            background: transparent;
            color: #666;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }
        .cxmind-btn:hover {
            background: rgba(108, 75, 245, 0.1);
            color: #6C4BF5;
            transform: translateY(-2px);
        }
        .cxmind-btn.primary {
            background: #6C4BF5;
            color: white;
            box-shadow: 0 4px 12px rgba(108, 75, 245, 0.3);
        }
        .cxmind-btn.primary:hover {
            background: #5b3fd1;
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(108, 75, 245, 0.4);
        }
        .cxmind-phone-wrapper {
            border-bottom: 2px solid rgba(108, 75, 245, 0.3);
            cursor: pointer;
            transition: all 0.2s;
            position: relative;
            display: inline-block;
        }
        .cxmind-phone-wrapper:hover {
            background-color: rgba(108, 75, 245, 0.1);
            border-bottom-color: #6C4BF5;
        }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(10px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
    `
    return style
}

const ClickToCallOverlay = () => {
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
    const [phoneNumber, setPhoneNumber] = useState<string | null>(null)
    const [isActive, setIsActive] = useState(false)
    const [settings] = useStorage("user-settings", INITIAL_SETTINGS)

    useEffect(() => {
        if (!settings.enableClickToCall) {
            // 清理: 移除wrapper恢复原文
            const wrappers = document.querySelectorAll('.cxmind-phone-wrapper')
            wrappers.forEach(wrapper => {
                const parent = wrapper.parentNode
                if (parent) {
                    const text = wrapper.textContent
                    const textNode = document.createTextNode(text || '')
                    parent.replaceChild(textNode, wrapper)
                }
            })
            // Also close global overlay if open
            setIsActive(false)
            return
        }
        // Simple scanner for demo purposes. 
        // In production, this would be more robust (libphonenumber-js).
        // Matches typical US/Intl formats.
        const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g

        const scan = () => {
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: (node) => {
                        const parent = node.parentElement
                        if (!parent) return NodeFilter.FILTER_REJECT
                        const tag = parent.tagName.toLowerCase()
                        if (['script', 'style', 'textarea', 'input', 'select', 'code', 'pre'].includes(tag)) {
                            return NodeFilter.FILTER_REJECT
                        }
                        if (parent.classList.contains('cxmind-phone-wrapper')) {
                            return NodeFilter.FILTER_REJECT
                        }
                        return NodeFilter.FILTER_ACCEPT
                    }
                }
            )

            const nodesToProcess: { node: Text, matches: RegExpMatchArray[] }[] = []

            while (walker.nextNode()) {
                const node = walker.currentNode as Text
                const text = node.nodeValue
                if (!text || text.length < 10) continue

                const matches = Array.from(text.matchAll(phoneRegex))
                if (matches.length > 0) {
                    nodesToProcess.push({ node, matches })
                }
            }

            nodesToProcess.forEach(({ node, matches }) => {
                const parent = node.parentNode
                if (!parent) return

                const fragment = document.createDocumentFragment()
                let lastIndex = 0

                matches.forEach(match => {
                    if (match.index === undefined) return

                    if (match.index > lastIndex) {
                        fragment.appendChild(document.createTextNode(node.nodeValue!.slice(lastIndex, match.index)))
                    }

                    const span = document.createElement('span')
                    span.textContent = match[0]
                    span.className = 'cxmind-phone-wrapper'

                    span.addEventListener('mouseenter', (e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setTargetRect(rect)
                        setPhoneNumber(match[0])
                        setIsActive(true)
                    })

                    span.addEventListener('click', (e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        chrome.runtime.sendMessage({
                            type: "CALL_NUMBER",
                            number: match[0].replace(/[^\d+]/g, '')
                        })
                        setIsActive(false)
                    })

                    fragment.appendChild(span)
                    lastIndex = match.index + match[0].length
                })

                if (lastIndex < node.nodeValue!.length) {
                    fragment.appendChild(document.createTextNode(node.nodeValue!.slice(lastIndex)))
                }

                parent.replaceChild(fragment, node)
            })
        }

        // Initial scan
        setTimeout(scan, 1000)

        // Observer for dynamic content
        let timer: ReturnType<typeof setTimeout>
        const observer = new MutationObserver(() => {
            clearTimeout(timer)
            timer = setTimeout(scan, 1500)
        })
        observer.observe(document.body, { childList: true, subtree: true })

        // Click outside listener
        const handleClickOutside = (e: MouseEvent) => {
            if (isActive && !(e.target as HTMLElement).closest('.cxmind-tooltip')) {
                setIsActive(false)
            }
        }
        window.addEventListener('click', handleClickOutside)

        return () => {
            observer.disconnect()
            window.removeEventListener('click', handleClickOutside)
        }
    }, [isActive, settings.enableClickToCall])

    if (!isActive || !targetRect || !phoneNumber) return null

    // 算位置
    const top = targetRect.bottom + 8
    const left = targetRect.left + (targetRect.width / 2) - 80 // Center

    return (
        <div
            className="cxmind-tooltip"
            style={{
                top: top,
                left: left,
            }}
        >
            <button
                className="cxmind-btn primary"
                title="Call"
                onClick={() => {
                    chrome.runtime.sendMessage({
                        type: "CALL_NUMBER",
                        number: phoneNumber.replace(/[^\d+]/g, '')
                    })
                    setIsActive(false)
                }}
            >
                <Phone size={18} />
            </button>
            <button
                className="cxmind-btn"
                title="Copy"
                onClick={() => {
                    navigator.clipboard.writeText(phoneNumber)
                    setIsActive(false)
                }}
            >
                <Copy size={18} />
            </button>
            <button
                className="cxmind-btn"
                title="Add Contact"
                onClick={() => {
                    // Placeholder for tracking
                    console.log("Add contact clicked")
                    setIsActive(false)
                }}
            >
                <UserPlus size={18} />
            </button>
        </div>
    )
}

export default ClickToCallOverlay
