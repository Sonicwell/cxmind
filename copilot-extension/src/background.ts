// Copilot Background Service Worker
// 从 chrome-extension/background.js 移植, 含完整call-state管理
import { DEMO_ENABLED } from "./utils/demo-flag"
import { decodeJWT } from "./utils/jwt"
import {
    createDefaultApiConfig, isApiReady,
    processCallEvent, mergeTranscription, processSuggestion,
    archiveCallToHistory, isGhostCall, validateChatSend,
    shouldBroadcastCallEvent,
    type CurrentCall, type TranscriptionSegment, type Suggestion, type ApiConfig
} from "./call-state"

// 条件 import: production build 时 DemoStreamer 整个模块被 tree-shake
let DemoStreamerClass: typeof import('./mock/demo-streamer').DemoStreamer | null = null
if (DEMO_ENABLED) {
    import('./mock/demo-streamer').then(m => { DemoStreamerClass = m.DemoStreamer })
}

// transcription storage debounce timer
let transcriptionPersistTimer: ReturnType<typeof setTimeout> | null = null

// 点extension图标直接开side panel (不用popup)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })

let socket: WebSocket | null = null
let reconnectAttempts = 0
let currentCall: CurrentCall | null = null
let lastAsrInfo: any = null
let pipWindowId: number | null = null
let documentPipActive = false // Document PiP 是否正在运行
let demoStreamer: any = null

// Summary 超时降级: LLM 不可用时 15s 后广播 timeout 事件
let summaryTimer: ReturnType<typeof setTimeout> | null = null
const SUMMARY_TIMEOUT_MS = 15_000

// SEC-CP-1: 默认 apiUrl 为空, storage 回调写入后才允许 WS/API 请求
const apiConfig = createDefaultApiConfig()

// ───────────────────── Storage & Init ─────────────────────

// ───────────────────── Storage & Init ─────────────────────

chrome.storage.sync.get(["apiUrl"], (result) => {
    if (result.apiUrl) apiConfig.apiUrl = result.apiUrl

    chrome.storage.local.get(["token", "currentCall", "pipWindowId"], (localResult) => {
        // 清理上一轮 SW 残留的 PiP popup (reload/crash 场景)
        if (localResult.pipWindowId) {
            chrome.windows.remove(localResult.pipWindowId).catch(() => { })
            chrome.storage.local.remove("pipWindowId")
        }

        if (localResult.token) apiConfig.token = localResult.token

        // Restore active call state upon Service Worker wake-up
        if (localResult.currentCall) {
            const callStart = new Date(localResult.currentCall.startTime).getTime();
            const now = Date.now();
            const elapsedHours = (now - callStart) / (1000 * 60 * 60);

            if (DEMO_ENABLED && localResult.token === 'demo-mode-token') {
                // Demo mode: NEVER restore old calls. Always start fresh.
                console.log("[Copilot] Demo mode — clearing any leftover call state.");
                chrome.storage.local.remove(["currentCall"]);
            } else {
                // Production: If the call is older than 4 hours, it's a ghost call from an unhandled disconnect. Discard it.
                if (elapsedHours > 4) {
                    console.log("[Copilot] Discarding extremely old ghost call state on startup.");
                    chrome.storage.local.remove(["currentCall"]);
                } else {
                    currentCall = localResult.currentCall;
                    // Re-hydrate Date objects
                    if (currentCall) {
                        currentCall.startTime = new Date(currentCall.startTime);
                        if (currentCall.endTime) currentCall.endTime = new Date(currentCall.endTime);
                        currentCall.suggestions.forEach(s => s.timestamp = new Date(s.timestamp));
                        console.log("[Copilot] Restored active call:", currentCall.callId);
                    }
                }
            }
        }

        if (apiConfig.token) connectWebSocket()
    })
})

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "sync") {
        if (changes.apiUrl) apiConfig.apiUrl = changes.apiUrl.newValue
    }
    if (namespace === "local") {
        if (changes.token) {
            apiConfig.token = changes.token.newValue
            // Cleanly close old socket without triggering onclose reconnect
            if (socket) {
                socket.onclose = null
                socket.close()
                socket = null
            }
            if (apiConfig.token) {
                reconnectAttempts = 0
                connectWebSocket()
            }
        }
        // Watch for enablePIP setting changes
        if (changes["user-settings"]) {
            const newSettings = changes["user-settings"].newValue
            const oldSettings = changes["user-settings"].oldValue
            if (newSettings?.enablePIP && !oldSettings?.enablePIP) {
                // PiP just enabled → open window
                openPipWindow()
            } else if (!newSettings?.enablePIP && oldSettings?.enablePIP) {
                // PiP just disabled → close window
                closePipWindow()
            }
        }
    }
})

// ───────────────────── PiP Window Management ─────────────────────

async function openPipWindow() {
    console.log("[Copilot] openPipWindow called, current pipWindowId:", pipWindowId)

    if (pipWindowId !== null) {
        try {
            const win = await chrome.windows.get(pipWindowId)
            // Document PiP 运行时不抢焦点，仅确保窗口存在
            if (documentPipActive) {
                console.log("[Copilot] Document PiP active, skipping window focus")
                return
            }
            // PiP 未运行: 新通话来了拉到最前面
            if (win.state === "minimized" || !win.focused) {
                await chrome.windows.update(pipWindowId, { state: "normal", focused: true })
                console.log("[Copilot] PiP window restored to front for new call")
            }
            return
        } catch {
            pipWindowId = null
        }
    }

    const pipUrl = chrome.runtime.getURL("tabs/pip-launcher.html")
    console.log("[Copilot] Creating PiP window at:", pipUrl)

    try {
        const win = await chrome.windows.create({
            url: pipUrl,
            type: "popup",
            width: 380,
            height: 500,
            focused: true
        })

        if (win?.id) {
            pipWindowId = win.id
            chrome.storage.local.set({ pipWindowId: win.id })
            console.log("[Copilot] PiP window created:", pipWindowId)
        }
    } catch (err) {
        console.error("[Copilot] Failed to create PiP window:", err)
    }
}


function closePipWindow() {
    if (pipWindowId !== null) {
        chrome.windows.remove(pipWindowId).catch(() => { })
        pipWindowId = null
        chrome.storage.local.remove("pipWindowId")
        console.log("[Copilot] PiP window closed")
    }
}


// 用户手动关PiP窗口时跟踪
chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === pipWindowId) {
        pipWindowId = null
        chrome.storage.local.remove("pipWindowId")
        console.log("[Copilot] PiP window closed by user")
    }
})

// ───────────────────── WebSocket ─────────────────────

function connectWebSocket() {
    // SEC-CP-1: apiUrl 未就绪时不发起连接
    if (!isApiReady(apiConfig)) {
        console.log("[Copilot] apiUrl not yet loaded from storage, deferring WS connection")
        return
    }
    if (!apiConfig.token) {
        console.log("[Copilot] No token available, skipping WebSocket connection")
        return
    }

    // Close existing connection cleanly (prevent onclose from triggering reconnect)
    if (socket) {
        socket.onclose = null
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close()
        }
        socket = null
    }

    // === Demo Mode Interceptor (编译时 flag 控制) ===
    if (DEMO_ENABLED && apiConfig.token === 'demo-mode-token') {
        console.log("[Copilot] Demo Mode active. Bypassing WS connection.");
        if (!demoStreamer && DemoStreamerClass) {
            demoStreamer = new DemoStreamerClass((msg: any) => {
                handleWebSocketMessage(msg);
            });
            console.log("[Copilot] DemoStreamer initialized.");
        }
        chrome.action.setBadgeText({ text: "●" })
        chrome.action.setBadgeBackgroundColor({ color: "#00FF00" })
        return;
    }
    // =============================

    // SEC-CP-V6-1: 使用 URL 对象安全替换协议 (避免简单字符串替换误匹配)
    const u = new URL(apiConfig.apiUrl)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = u.toString()

    try {
        socket = new WebSocket(wsUrl)

        socket.onopen = () => {
            console.log("[Copilot] WebSocket connected")
            reconnectAttempts = 0

            socket!.send(JSON.stringify({
                type: "auth",
                token: apiConfig.token
            }))

            chrome.action.setBadgeText({ text: "●" })
            chrome.action.setBadgeBackgroundColor({ color: "#00FF00" })
        }

        socket.onmessage = (event) => {
            let data: any
            try {
                data = JSON.parse(event.data)
            } catch (e) {
                console.error("[Copilot] Failed to parse WebSocket message:", e)
                return
            }
            handleWebSocketMessage(data)
        }

        socket.onerror = (error) => {
            console.error("[Copilot] WebSocket error:", error)
            chrome.action.setBadgeText({ text: "!" })
            chrome.action.setBadgeBackgroundColor({ color: "#FF0000" })
        }

        socket.onclose = (event) => {
            console.log("[Copilot] WebSocket disconnected:", event.code, event.reason)
            chrome.action.setBadgeText({ text: "" })

            // 认证失败 code=1008
            if (event.code === 1008) {
                console.error("[Copilot] Authentication failed (expired/invalid token). Logging out.");
                apiConfig.token = null;
                currentCall = null;
                closePipWindow();
                chrome.storage.local.remove(["token", "currentCall"]);
                broadcastToUI({ type: "logged_out" });
                return;
            }

            // Don't reconnect if replaced by new connection (server sent 4001)
            if (event.code === 4001) {
                console.log("[Copilot] Connection replaced, not reconnecting")
                return
            }

            reconnectAttempts++
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 60000)
            console.log(`[Copilot] Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts})`)
            setTimeout(() => {
                if (apiConfig.token) connectWebSocket()
            }, delay)
        }
    } catch (error) {
        console.error("[Copilot] Failed to create WebSocket:", error)
    }
}

// ───────────────────── Message Routing ─────────────────────

function handleWebSocketMessage(data: any) {
    console.log("[Copilot] WebSocket message:", data.type)

    switch (data.type) {
        case "auth:force_logout":
            console.error("[Copilot] Force logout triggered by admin:", data.reason);
            apiConfig.token = null;
            currentCall = null;
            closePipWindow();
            chrome.storage.local.remove(["token", "currentCall", "userProfile"]);
            broadcastToUI({ type: "force_logout", reason: data.reason });
            break

        // L2: 身份已变更（角色/Agent绑定），提示重登
        case "auth:identity_changed":
            broadcastToUI(data);
            break

        // L3: 分组变更，静默同步
        case "agent:group_changed": {
            const newGroupIds = data.data?.groupIds || [];
            chrome.storage.local.get(["userProfile"], (result: any) => {
                const profile = result.userProfile || {};
                chrome.storage.local.set({
                    userProfile: { ...profile, groupIds: newGroupIds },
                    groupChatUnread: {}
                });
            });
            broadcastToUI(data);
            break
        }

        // Re-sync cached bizStatus after (re)connect so server matches Copilot UI
        case "auth_success":
            resyncCachedBizStatus()
            break
        case "call:event":
            handleCallEvent(data.data)
            break
        case "call:transcription":
            handleTranscription(data.data)
            break
        case "call:transcription_replay":
            // Also update our local state if we are missing these?
            // Ideally we should merge. For now just broadcast.
            broadcastToUI({ type: "call:transcription_replay", data: data.data })
            break
        case "call:quality":
            broadcastToUI(data)
            break
        case "chat:message":
            // 仅用于内部 P2P/Group 聊天
            broadcastToUI({ type: data.type, data: data.data })
            // B3: 按 groupId 粒度持久化未读计数
            if (data.data?.channelId?.startsWith('group:') && apiConfig.token) {
                try {
                    const payload = decodeJWT(apiConfig.token)
                    // sender.id 是 Agent._id，需同时比对 agentId 和 userId
                    const senderId = data.data.sender?.id
                    const myAgentId = payload?.agentId
                    const myUserId = payload?.userId || payload?.sub
                    const isMine = senderId && (senderId === myAgentId || senderId === myUserId)
                    if (!isMine) {
                        const groupId = data.data.channelId.slice(6) // "group:xxx" → "xxx"
                        chrome.storage.local.get(['groupChatUnread'], (result) => {
                            const unreadMap = result.groupChatUnread || {}
                            unreadMap[groupId] = (unreadMap[groupId] || 0) + 1
                            chrome.storage.local.set({ groupChatUnread: unreadMap })
                        })
                    }
                } catch { /* ignore decode errors */ }
            }
            break
        case "chat:recall":
        case "chat:edit":
            broadcastToUI({ type: data.type, data: data.data })
            break
        case "chat:typing":
            broadcastToUI({ type: data.type, data: data.data })
            break
        case "call:asr_info":
            lastAsrInfo = data.data
            broadcastToUI(data)
            break
        case "call:compliance":
            broadcastToUI(data)
            break
        case "call:context_brief":
            broadcastToUI(data)
            break
        default:
            // Process omni:suggestion locally just like voice suggestions
            if (data.type === "omni:suggestion") {
                handleSuggestion(data.data);
            }
            // omni:summary 到达 → 清除超时 timer
            if (data.type === "omni:summary" && summaryTimer) {
                clearTimeout(summaryTimer); summaryTimer = null
            }
            // omni:conversation_resolved → Chat 场景同样启动超时 timer
            if (data.type === "omni:conversation_resolved") {
                if (summaryTimer) clearTimeout(summaryTimer)
                summaryTimer = setTimeout(() => {
                    console.log('[Copilot] Chat summary generation timed out')
                    broadcastToUI({ type: 'omni:summary_timeout' })
                    summaryTimer = null
                }, SUMMARY_TIMEOUT_MS)
            }
            // call:summary_skipped 到达 → 无转写内容，清除超时 timer
            if (data.type === "call:summary_skipped" && summaryTimer) {
                clearTimeout(summaryTimer); summaryTimer = null
            }
            // Forward omni:* / agent:* / sop:* / policy:* / call:summary_not_enabled / call:summary_skipped to sidepanel
            if (data.type && (data.type.startsWith("omni:") || data.type.startsWith("agent:") || data.type.startsWith("sop:") || data.type.startsWith("policy:") || data.type === "call:summary_not_enabled" || data.type === "call:summary_skipped")) {
                broadcastToUI(data)
            }
            break
    }
}

// ───────────────────── Call Events ─────────────────────

function handleCallEvent(event: any) {
    const { call_id, event_type, caller_uri, callee_uri } = event

    // ARCH-V7-2: 在状态变更前决定是否广播 (hangup 会清 currentCall)
    const shouldBroadcast = shouldBroadcastCallEvent(event, currentCall)

    if (event_type === "call_create") {
        if (currentCall && currentCall.callId === call_id) {
            console.log("[Copilot] Call already active:", call_id)
            return
        }


        // 清除上一轮 summary 超时 timer
        if (summaryTimer) { clearTimeout(summaryTimer); summaryTimer = null }

        currentCall = {
            callId: call_id,
            caller: caller_uri,
            callee: callee_uri,
            caller_type: event.caller_type || 'customer',
            callee_type: event.callee_type || 'customer',
            status: event.status || 'active',
            startTime: new Date(),
            transcriptions: [],
            suggestions: []
        }

        // Persist state
        chrome.storage.local.set({ currentCall })

        // ✅ Join the call room to receive transcriptions & suggestions
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "join", callId: call_id }))
            console.log(`[Copilot] Joined room for call: ${call_id}`)
        }

        chrome.action.setBadgeText({ text: "1" })
        chrome.action.setBadgeBackgroundColor({ color: "#0066FF" })

        // Auto-open PiP window if enablePIP is ON
        chrome.storage.local.get(["user-settings"], (result) => {
            const settings = result["user-settings"]
            console.log("[Copilot] PiP check - stored settings:", JSON.stringify(settings))
            const enablePIP = settings?.enablePIP !== undefined ? settings.enablePIP : true
            if (enablePIP) {
                console.log("[Copilot] PiP enabled, opening window...")
                openPipWindow()
            } else {
                console.log("[Copilot] PiP disabled, skipping window")
            }
        })

    } else if (event_type === "call_answer") {
        // 振铃→接通：更新 status + 重置 startTime
        if (currentCall && currentCall.callId === call_id) {
            currentCall.status = 'active'
            currentCall.startTime = new Date()
            chrome.storage.local.set({ currentCall })
        }

    } else if (event_type === "call_hangup") {
        if (currentCall && currentCall.callId === call_id) {
            currentCall.endTime = new Date()

            // ✅ Leave the call room
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: "leave", callId: call_id }))
                console.log(`[Copilot] Left room for call: ${call_id}`)
            }

            chrome.action.setBadgeText({ text: "●" })
            chrome.action.setBadgeBackgroundColor({ color: "#00FF00" })

            archiveCall(currentCall)
            currentCall = null
            lastAsrInfo = null

            // Clear persisted state
            chrome.storage.local.remove("currentCall")

            // 挂断后等待 LLM summary，超时则广播降级事件
            if (summaryTimer) clearTimeout(summaryTimer)
            summaryTimer = setTimeout(() => {
                console.log('[Copilot] Summary generation timed out after', SUMMARY_TIMEOUT_MS / 1000, 's')
                broadcastToUI({ type: 'omni:summary_timeout' })
                summaryTimer = null
            }, SUMMARY_TIMEOUT_MS)
        }
    }

    // ARCH-V7-2: 只广播与当前通话相关的事件
    if (shouldBroadcast) {
        broadcastToUI({ type: "call_event", data: event })
    }
}

// ───────────────────── Transcription ─────────────────────

function handleTranscription(segment: any) {
    if (!currentCall) return;
    // Tolerate mismatch in demo mode or different properties (call_id vs callId)
    const matchId = currentCall.callId === segment.call_id || (currentCall as any).call_id === segment.call_id || (DEMO_ENABLED && currentCall.callId?.includes('mock-call'));
    if (!matchId) return;

    // ROBUST-CP-1: 使用 call-state 中更稳健的合并逻辑 (前缀 ≥50% && minLen>3)
    mergeTranscription(currentCall.transcriptions, segment)

    // Debounce storage persist (每 500ms 最多写一次)
    if (transcriptionPersistTimer) clearTimeout(transcriptionPersistTimer)
    transcriptionPersistTimer = setTimeout(() => {
        chrome.storage.local.set({ currentCall })
        transcriptionPersistTimer = null
    }, 500)

    broadcastToUI({ type: "transcription_update", data: currentCall.transcriptions })
}

// ───────────────────── Suggestions ─────────────────────

function handleSuggestion(suggestion: any) {
    if (!processSuggestion(currentCall, suggestion)) return

    // Persist state
    chrome.storage.local.set({ currentCall })

    if (suggestion.confidence > 0.8 && chrome.notifications) {
        chrome.notifications.create({
            type: "basic",
            iconUrl: chrome.runtime.getURL("assets/icon128.png"),
            title: "AI Suggestion",
            message: suggestion.suggestion
        })
    }

    broadcastToUI({ type: "suggestion_update", data: currentCall!.suggestions })
}

// ───────────────────── Status Re-Sync ─────────────────────

/**
 * After WebSocket (re)connects, re-send the Copilot's last-known bizStatus
 * to the server. Covers the case where AS restarted and onCopilotDisconnect
 * already cleared Redis — the server would default to 'available' but the
 * Copilot UI still shows e.g. 'dnd'.
 */
function resyncCachedBizStatus() {
    // SEC-CP-1: apiUrl 未就绪时不发起 fetch
    if (!isApiReady(apiConfig)) return

    chrome.storage.local.get(["cachedBizStatus"], (result) => {
        const cached = result.cachedBizStatus as string | undefined

        // 过滤系统状态：诸如 working, busy 等系统内联状态不可人工持久化复原，重置为 available
        const systemOnly = ['ring', 'oncall', 'onhold', 'wrapup', 'working', 'busy', 'offline'];
        let statusToSend = cached || "available";
        if (systemOnly.includes(statusToSend)) {
            statusToSend = "available";
        }

        console.log(`[Copilot] Syncing bizStatus to server on connect: ${statusToSend}`);

        // PUT /api/agent/status with the checked value
        fetch(`${apiConfig.apiUrl}/api/agent/status`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiConfig.token}`
            },
            body: JSON.stringify({
                availabilityStatus: statusToSend,
                changedAt: new Date().toISOString()
            })
        })
            .then(resp => {
                if (resp.ok) {
                    console.log(`[Copilot] Re-synced bizStatus to server: ${statusToSend}`)
                } else {
                    console.warn(`[Copilot] Failed to re-sync bizStatus: ${resp.status}`)
                }
            })
            .catch(err => console.error("[Copilot] Re-sync fetch error:", err))
    })
}

// ───────────────────── SOP State (shared between SidePanel + PiP) ─────────────────────

let sopState: any = null // Current SOP guidance state, synced between both windows

// ───────────────────── Utility ─────────────────────

function broadcastToUI(message: any) {
    chrome.runtime.sendMessage(message).catch(() => {
        // Side panel not open, ignore
    })
    // pip popup 可能在 minimize 状态收不到 runtime message, 直发 tab
    if (pipWindowId !== null) {
        chrome.tabs.query({ windowId: pipWindowId }, (tabs) => {
            tabs?.forEach(t => {
                if (t.id) chrome.tabs.sendMessage(t.id, message).catch(() => { })
            })
        })
    }
}

// ARCH-CP-2: 使用 call-state 中带大小限制的归档函数
function archiveCall(call: CurrentCall) {
    chrome.storage.local.get(["callHistory"], (result) => {
        const history = result.callHistory || []
        archiveCallToHistory(history, call)
        chrome.storage.local.set({ callHistory: history })
    })
}

// ───────────────────── Message Handlers ─────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case "getCurrentCall":
            sendResponse({ call: currentCall, asrInfo: lastAsrInfo })
            return true

        case "getConnectionStatus":
            sendResponse({
                connected: socket?.readyState === WebSocket.OPEN,
                connecting: socket?.readyState === WebSocket.CONNECTING,
                hasToken: !!apiConfig.token
            })
            return true

        case "openSidePanel":
            if (sender.tab?.id) {
                chrome.sidePanel.open({ tabId: sender.tab.id })
            } else if (sender.tab?.windowId) {
                chrome.sidePanel.open({ windowId: sender.tab.windowId })
            }
            sendResponse({ success: true })
            return true

        case "reconnect":
            if (socket) socket.close()
            reconnectAttempts = 0
            connectWebSocket()
            sendResponse({ success: true })
            return true

        case "logout":
            if (socket) socket.close()
            apiConfig.token = null
            currentCall = null
            closePipWindow()
            chrome.action.setBadgeText({ text: "" })
            chrome.storage.local.remove(["currentCall"])
            sendResponse({ success: true })
            return true

        case "clearActiveCall":
            currentCall = null
            chrome.storage.local.remove(["currentCall"])
            sendResponse({ success: true })
            return true

        case "pip:open":
            openPipWindow()
            sendResponse({ success: true })
            return true

        case "pip:close":
            closePipWindow()
            sendResponse({ success: true })
            return true

        case "pip:openWindow":
            openPipWindow()
            sendResponse({ success: true })
            return true

        case "PLAYWRIGHT_INJECT":
            // E2E Mocking listener: Bypass all WebSocket and auth logic to force state
            if (message.payload.type === 'call_event') {
                handleCallEvent(message.payload.data);
            } else if (message.payload.type === 'transcription_update') {
               // The original handleTranscription expects a single segment at a time
               message.payload.data.forEach((seg: any) => handleTranscription(seg));
            }
            sendResponse({ success: true });
            return true;

        case "pip:switchConversation":
            // 中继到 pip popup window
            if (pipWindowId !== null) {
                chrome.tabs.query({ windowId: pipWindowId }, (tabs) => {
                    tabs.forEach(t => {
                        if (t.id) chrome.tabs.sendMessage(t.id, message).catch(() => { })
                    })
                })
            }
            sendResponse({ success: true })
            return true

        case "pip:activated":
            // Document PiP is now active — minimize the launcher popup
            documentPipActive = true
            if (pipWindowId !== null) {
                chrome.windows.update(pipWindowId, { state: "minimized" }).catch(() => { })
            }
            sendResponse({ success: true })
            return true

        case "pip:deactivated":
            // Document PiP closed — 直接关闭 launcher popup, 不再恢复弹出
            documentPipActive = false
            closePipWindow()
            sendResponse({ success: true })
            return true

        // ── SOP State Sync ──
        case "getSopState":
            sendResponse({ sopState })
            return true

        case "sop:stateUpdate":
            // SidePanel pushes SOP state → store + broadcast to PiP
            sopState = message.data
            broadcastToUI({ type: 'sop:stateUpdate', data: sopState })
            sendResponse({ success: true })
            return true

        case "sop:selectBranch":
            // PiP selects a branch → broadcast to SidePanel
            broadcastToUI({ type: 'sop:selectBranch', targetNodeId: message.targetNodeId })
            sendResponse({ success: true })
            return true

        case "sop:requestState":
            // PiP requests latest state → broadcast to both
            broadcastToUI({ type: 'sop:stateUpdate', data: sopState })
            sendResponse({ sopState })
            return true

        case "coach:message":
            // Supervisor sends coaching message → broadcast to PiP and SidePanel
            broadcastToUI({ type: 'coach:message', data: message.data })
            sendResponse({ success: true })
            return true

        case "pip:wrapupComplete":
        case "sidepanel:wrapupComplete":
            // 收到用户强行结案: 直接取消超时的后台计时器
            if (summaryTimer) {
                clearTimeout(summaryTimer);
                summaryTimer = null;
            }
            // 双向同步: 任一面板完成 wrap-up → 广播给所有 UI
            broadcastToUI({ type: 'wrapup:completed' })
            sendResponse({ success: true })
            return true

        case "CALL_NUMBER":
            // content script发来的click-to-call或者面板控制台专用发起的Call Simulate
            const { number } = message
            console.log("[Copilot] Click-to-Call initiated for:", number, "from:", sender.url)

            if (!number) {
                console.warn("[Copilot] Ignored empty CALL_NUMBER trigger.");
                sendResponse({ success: false, reason: "No number provided" });
                return true;
            }

            // Open SidePanel if not open
            if (sender.tab?.id) {
                chrome.sidePanel.open({ tabId: sender.tab.id })
            } else if (sender.tab?.windowId) {
                chrome.sidePanel.open({ windowId: sender.tab.windowId })
            }

            // DEMO MODE TRIGGER (编译时 flag 控制)
            if (DEMO_ENABLED && apiConfig.token === 'demo-mode-token') {
                if (!demoStreamer && DemoStreamerClass) {
                    demoStreamer = new DemoStreamerClass((msg: any) => handleWebSocketMessage(msg))
                }
                const callId = `mock-call-${Date.now()}`;

                // DON'T pre-set currentCall here!
                // Let DemoStreamer's call:event broadcast flow through handleCallEvent()
                // so that broadcastToUI() fires and the SidePanel gets notified immediately.
                if (demoStreamer) demoStreamer.startCall(callId, "Copilot Demo User", number);
                sendResponse({ success: true });
                return true;
            }

            // Real Production SIP Call Start Mechanism (Not Mocked Here for Actual Use)

            sendResponse({ success: true, warning: "SIP call initiation disabled outside of demo mode for safety in this version" })
            return true

        case "chat:send":
            // SEC-CP-2: 发送前校验字段
            const chatValidation = validateChatSend(message.data)
            if (!chatValidation.valid) {
                sendResponse({ success: false, error: chatValidation.error })
                return true
            }
            // Forward chat message from sidepanel to WebSocket server
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: "chat:send",
                    ...message.data
                }))
                sendResponse({ success: true })
            } else if (DEMO_ENABLED && apiConfig.token === 'demo-mode-token') {
                // Ignore outbound chat failure in Demo mode to preserve illusion
                sendResponse({ success: true })
            } else {
                sendResponse({ success: false, error: "WebSocket not connected" })
            }
            return true

        case "chat:recall":
        case "chat:edit":
            // 通过 WebSocket 转发到后端
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: message.type,
                    ...message.data
                }))
                sendResponse({ success: true })
            } else {
                sendResponse({ success: false, error: "WebSocket not connected" })
            }
            return true

        case "demo:trigger_omni":
            if (DEMO_ENABLED && apiConfig.token === 'demo-mode-token' && demoStreamer) {
                demoStreamer.triggerOmniMessage(message.channel);
            }
            sendResponse({ success: true });
            return true;

        case "demo:trigger_all_omni":
            if (DEMO_ENABLED && apiConfig.token === 'demo-mode-token' && demoStreamer) {
                demoStreamer.triggerAllOmniConversations();
            }
            sendResponse({ success: true });
            return true;

        case "demo:omni_accept":
            if (DEMO_ENABLED && apiConfig.token === 'demo-mode-token' && demoStreamer) {
                const acceptConvId = message.convId || message.data?.conversationId || 'demo-webchat-01'
                demoStreamer.onOmniAccept();
                broadcastToUI({ type: 'omni:conversation_accepted', data: { conversationId: acceptConvId } })
            }
            sendResponse({ success: true });
            return true;

        case "demo:omni_approve":
            if (DEMO_ENABLED && apiConfig.token === 'demo-mode-token' && demoStreamer) {
                demoStreamer.onOmniApprove();
            }
            sendResponse({ success: true });
            return true;

        case "demo:omni_reply":
            if (DEMO_ENABLED && apiConfig.token === 'demo-mode-token' && demoStreamer) {
                demoStreamer.onOmniAgentReply(message.text || '', message.convId || 'demo-webchat-01');
            }
            sendResponse({ success: true });
            return true;

        case "demo:omni_resolve":
            if (DEMO_ENABLED && apiConfig.token === 'demo-mode-token' && demoStreamer) {
                const resolveConvId = message.convId || message.data?.conversationId || 'demo-webchat-01'
                broadcastToUI({ type: 'omni:conversation_resolved', data: { conversationId: resolveConvId } })
                demoStreamer.onOmniResolve();
            }
            sendResponse({ success: true });
            return true;
    }
})

// ───────────────────── Keep-alive ─────────────────────

if (chrome.alarms) {
    chrome.alarms.create("keep-alive", { periodInMinutes: 0.5 })
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === "keep-alive") {
            if (apiConfig.token && (!socket || socket.readyState !== WebSocket.OPEN)) {
                connectWebSocket()
            }
            // Ping to keep alive
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: "ping" }))
            }
        }
    })
}

// ───────────────────── Offscreen Document Management ─────────────────────

const OFFSCREEN_DOCUMENT_PATH = "tabs/sip-engine.html"

async function setupOffscreenDocument() {
    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
    })

    if (existingContexts.length > 0) {
        return
    }

    // Create offscreen document (WebRTC + WebLLM inference)
    console.log("[Copilot] Creating Offscreen Document...")
    await chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [chrome.offscreen.Reason.WEB_RTC, chrome.offscreen.Reason.WORKERS],
        justification: "WebRTC audio processing and WebLLM GPU inference via WebGPU"
    })
}

// 启动时init offscreen doc
setupOffscreenDocument().catch(console.error)

// ───────────────────── WebLLM Boot Preload ─────────────────────

// BootScreen 或 Settings 开启后触发预加载
function tryPreloadWebLLM() {
    chrome.storage.local.get(["webllm-settings"], (result) => {
        const settings = result["webllm-settings"]
        if (!settings?.enabled || !settings?.preloadOnBoot) return

        // 从 language × tier 矩阵动态获取 modelId
        const lang = settings.language || 'en'
        const tier = settings.modelTier || 'standard'
        const matrix: Record<string, Record<string, { id: string }>> = {
            en: {
                light: { id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC' },
                standard: { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC' },
                advanced: { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC' },
            },
            zh: {
                light: { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC' },
                standard: { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC' },
                advanced: { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC' },
            },
            ja: {
                light: { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC' },
                standard: { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC' },
                advanced: { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC' },
            },
        }
        const modelId = matrix[lang]?.[tier]?.id || 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'

        console.log(`[Copilot] WebLLM preload: ${modelId} (${lang}/${tier})`)
        // 稍延迟等 offscreen doc 就绪
        setTimeout(() => {
            chrome.runtime.sendMessage({ type: 'webllm:load', modelId }).catch(() => { })
        }, 2000)
    })
}

// SW 启动后自动尝试预加载
tryPreloadWebLLM()

export { }
