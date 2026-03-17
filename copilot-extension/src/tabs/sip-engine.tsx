import { useState, useEffect } from "react"
import "../style.css"

// ── Module-level WebLLM engine (不依赖 React state, 避免闭包陷阱) ──

let engine: any = null
let currentModelId: string | null = null
let currentStatus: 'idle' | 'downloading' | 'loading' | 'ready' | 'error' = 'idle'

function broadcast(msg: any) {
    chrome.runtime.sendMessage(msg).catch(() => { /* panel closed */ })
}

// --------- Global Error Catchers for Offscreen ---------
window.addEventListener('unhandledrejection', event => {
    console.error('[Offscreen] Unhandled promise rejection:', event.reason)
    broadcast({ type: 'webllm:error', error: `Fatal: ${event.reason?.message || event.reason}` })
})

window.addEventListener('error', event => {
    console.error('[Offscreen] Global error:', event.error)
    broadcast({ type: 'webllm:error', error: `Fatal: ${event.error?.message || event.message}` })
})
// -----------------------------------------------------

async function loadModel(modelId: string) {
    console.log(`[Offscreen] Entering loadModel with ID: ${modelId}`)

    // 已加载相同模型
    if (engine && currentModelId === modelId && currentStatus === 'ready') {
        console.log(`[Offscreen] Model ${modelId} already loaded.`)
        broadcast({ type: 'webllm:status', status: 'ready', modelId })
        broadcast({ type: 'webllm:loaded', modelId })
        return
    }

    try {
        currentModelId = modelId
        currentStatus = 'downloading'
        broadcast({ type: 'webllm:status', status: 'downloading', modelId, progress: 0 })

        console.log(`[Offscreen] Dynamically importing @mlc-ai/web-llm...`)
        const mlc = await import("@mlc-ai/web-llm")
        console.log(`[Offscreen] Import success. hasWorker: ${!!mlc.hasModelInCache}, CreateMLCEngine available: ${!!mlc.CreateMLCEngine}`)

        const startTime = Date.now()

        console.log(`[Offscreen] Starting CreateMLCEngine call...`)
        engine = await mlc.CreateMLCEngine(modelId, {
            initProgressCallback: (report: any) => {
                const progress = report.progress || 0
                const text = report.text || ''
                const pct = Math.round(progress * 100)

                console.log(`[Offscreen] Progress: ${pct}% - ${text}`)

                const isGPU = text.includes('Loading') || text.includes('shader') || text.includes('GPU')
                currentStatus = isGPU ? 'loading' : 'downloading'

                broadcast({ type: 'webllm:progress', progress: pct, text, timeElapsed: Date.now() - startTime })
                broadcast({ type: 'webllm:status', status: currentStatus, modelId, progress: pct })
            },
        })

        console.log(`[Offscreen] CreateMLCEngine finished successfully`)
        currentStatus = 'ready'
        broadcast({ type: 'webllm:loaded', modelId })
        broadcast({ type: 'webllm:status', status: 'ready', modelId })
        console.log(`[Offscreen] WebLLM loaded: ${modelId} in ${Date.now() - startTime}ms`)

    } catch (err: any) {
        console.error('[Offscreen] WebLLM load failed EXCEPTION:', err)
        currentStatus = 'error'
        broadcast({ type: 'webllm:error', error: err.message || String(err) })
        broadcast({ type: 'webllm:status', status: 'error', modelId })
    }
}

async function unloadModel() {
    if (engine) {
        try { await engine.unload() } catch { /* ignore */ }
        engine = null
    }
    currentStatus = 'idle'
    currentModelId = null
    broadcast({ type: 'webllm:unloaded' })
    broadcast({ type: 'webllm:status', status: 'cached' })
}

async function generateResponse(msg: any) {
    const { requestId, messages, temperature = 0.7, max_tokens = 512 } = msg

    if (!engine || currentStatus !== 'ready') {
        broadcast({ type: 'webllm:error', requestId, error: 'Model not loaded' })
        return
    }

    try {
        const startTime = Date.now()
        const reply = await engine.chat.completions.create({ messages, temperature, max_tokens })
        const text = reply.choices?.[0]?.message?.content || ''
        const usage = reply.usage ? {
            prompt_tokens: reply.usage.prompt_tokens || 0,
            completion_tokens: reply.usage.completion_tokens || 0,
        } : undefined

        broadcast({ type: 'webllm:result', requestId, text, usage, latencyMs: Date.now() - startTime })
    } catch (err: any) {
        console.error('[Offscreen] WebLLM generate failed:', err)
        broadcast({ type: 'webllm:error', requestId, error: err.message || String(err) })
    }
}

async function clearCache() {
    await unloadModel()
    try {
        const cacheNames = await caches.keys()
        for (const name of cacheNames) {
            if (name.includes('webllm') || name.includes('mlc')) {
                await caches.delete(name)
            }
        }
        console.log('[Offscreen] WebLLM cache cleared')
    } catch (err) {
        console.error('[Offscreen] Cache clear failed:', err)
    }
    broadcast({ type: 'webllm:status', status: 'not_cached' })
}

// ── 全局消息监听 (不放 useEffect 里, 避免 React 闭包问题) ──

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "KEEP_ALIVE") return

    if (msg.type === 'webllm:load') {
        loadModel(msg.modelId)
        sendResponse({ ack: true })
        return false
    }
    if (msg.type === 'webllm:unload') {
        unloadModel()
        sendResponse({ ack: true })
        return false
    }
    if (msg.type === 'webllm:generate') {
        generateResponse(msg)
        sendResponse({ ack: true })
        return false
    }
    if (msg.type === 'webllm:status') {
        sendResponse({ status: currentStatus, modelId: currentModelId })
        return false
    }
    if (msg.type === 'webllm:clear_cache') {
        clearCache()
        sendResponse({ ack: true })
        return false
    }
})

// ── React 组件 (仅用于 Plasmo 渲染,不承担逻辑) ──

function Offscreen() {
    const [ready, setReady] = useState(false)
    useEffect(() => {
        chrome.runtime.sendMessage({ type: "OFFSCREEN_READY" }).catch(() => { })
        setReady(true)
    }, [])

    return (
        <div className="p-4">
            <h2>CXMind RTC Engine</h2>
            <p>Status: {ready ? "Active" : "Initializing..."}</p>
            <p className="text-sm text-gray-500">
                Handles WebRTC audio and WebLLM inference.
            </p>
        </div>
    )
}

export default Offscreen
