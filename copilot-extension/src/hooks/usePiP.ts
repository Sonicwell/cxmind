import { useCallback } from "react"

/**
 * Simplified PiP hook for SidePanel.
 * PiP window is managed by background.ts via chrome.windows.create.
 * This hook just provides open/close via messaging.
 *
 * Auto-open behavior (when enablePIP is ON):
 *   - Background auto-opens PiP window on call_create
 *   - User manually closes → reopens on next call
 *
 * Manual behavior (when enablePIP is OFF):
 *   - User clicks Pop Out → sends pip:open message → background opens window
 */

interface UsePiPReturn {
    /** Manually open PiP window via background */
    openPiP: () => void
    /** Close PiP window via background */
    closePiP: () => void
}

export function usePiP(): UsePiPReturn {
    const openPiP = useCallback(() => {
        chrome.runtime.sendMessage({ type: "pip:open" }).catch(console.error)
    }, [])

    const closePiP = useCallback(() => {
        chrome.runtime.sendMessage({ type: "pip:close" }).catch(console.error)
    }, [])

    return { openPiP, closePiP }
}
