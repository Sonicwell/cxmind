// Copilot 端 WebLLM 状态管理 hook
// 通过 chrome.runtime.sendMessage 与 Offscreen Document 中的 WebLLM Engine 通信

import { useState, useEffect, useCallback, useRef } from "react"
import { useStorage } from "@plasmohq/storage/hook"
import type { WebLLMStatus, WebLLMSettings } from "~/utils/webllm-types"
import { DEFAULT_WEBLLM_SETTINGS, getModelConfig } from "~/utils/webllm-types"

interface WebLLMState {
    status: WebLLMStatus
    progress: number
    progressText: string
    modelId: string | null
    error: string | null
    inferenceCount: number  // 今日推理次数
    avgLatencyMs: number    // 平均推理延迟
}

export function useWebLLM() {
    const [settings, setSettings] = useStorage<WebLLMSettings>("webllm-settings", DEFAULT_WEBLLM_SETTINGS)
    const [state, setState] = useState<WebLLMState>({
        status: 'disabled',
        progress: 0,
        progressText: '',
        modelId: null,
        error: null,
        inferenceCount: 0,
        avgLatencyMs: 0,
    })

    // 推理统计 ref (不触发 re-render)
    const statsRef = useRef({ totalLatency: 0, count: 0 })
    const currentSettings = settings || DEFAULT_WEBLLM_SETTINGS

    // 监听来自 Offscreen 的 WebLLM 事件
    useEffect(() => {
        const listener = (msg: any) => {
            if (!msg.type?.startsWith('webllm:')) return

            switch (msg.type) {
                case 'webllm:status':
                    setState(s => ({
                        ...s,
                        status: msg.status,
                        modelId: msg.modelId || s.modelId,
                        progress: msg.progress ?? s.progress,
                    }))
                    break

                case 'webllm:progress':
                    setState(s => ({
                        ...s,
                        progress: msg.progress,
                        progressText: msg.text || '',
                    }))
                    break

                case 'webllm:loaded':
                    setState(s => ({
                        ...s,
                        status: 'ready',
                        modelId: msg.modelId,
                        progress: 100,
                        progressText: '',
                        error: null,
                    }))
                    break

                case 'webllm:error':
                    setState(s => ({
                        ...s,
                        status: 'error',
                        error: msg.error,
                    }))
                    break

                case 'webllm:result':
                    // 统计推理性能
                    if (msg.latencyMs) {
                        statsRef.current.totalLatency += msg.latencyMs
                        statsRef.current.count += 1
                        setState(s => ({
                            ...s,
                            inferenceCount: statsRef.current.count,
                            avgLatencyMs: Math.round(statsRef.current.totalLatency / statsRef.current.count),
                        }))
                    }
                    break

                case 'webllm:unloaded':
                    setState(s => ({ ...s, status: 'disabled', modelId: null, progress: 0 }))
                    break
            }
        }

        chrome.runtime.onMessage.addListener(listener)
        return () => chrome.runtime.onMessage.removeListener(listener)
    }, [])

    // Settings 变化时同步状态
    useEffect(() => {
        if (!currentSettings.enabled) {
            setState(s => ({ ...s, status: 'disabled' }))
        } else if (state.status === 'disabled') {
            // 刚开启 → 立即触发下载+加载
            setState(s => ({ ...s, status: 'not_cached' }))
            const modelId = getModelConfig(currentSettings.language, currentSettings.modelTier).id
            console.log('[useWebLLM] Auto-download on enable:', modelId)
            // 给 offscreen doc 一点时间就绪
            setTimeout(() => {
                chrome.runtime.sendMessage({ type: 'webllm:load', modelId }).catch(() => { })
            }, 500)
        }
    }, [currentSettings.enabled])

    // 通用 RPC 包装 (捕捉未建立连接等静默失败)
    const callEngine = useCallback((msg: any): Promise<any> => {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(msg, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message))
                } else {
                    resolve(response)
                }
            })
        })
    }, [])

    // 加载模型
    const loadModel = useCallback(async (modelId?: string) => {
        const id = modelId || getModelConfig(currentSettings.language, currentSettings.modelTier).id
        setState(s => ({ ...s, status: 'downloading', progress: 0, progressText: 'Requesting engine...', error: null }))
        try {
            const res = await callEngine({ type: 'webllm:load', modelId: id })
            if (res && res.error) throw new Error(res.error)
            console.log('[useWebLLM] Requested load:', id)
        } catch (err: any) {
            console.error('[useWebLLM] Load RPC failed:', err)
            setState(s => ({ ...s, status: 'error', error: `Engine unreachable: ${err.message}` }))
        }
    }, [currentSettings.modelTier, callEngine])

    // 卸载模型
    const unloadModel = useCallback(async () => {
        try {
            await callEngine({ type: 'webllm:unload' })
        } catch { /* ignore */ }
    }, [callEngine])

    // 推理请求
    const generate = useCallback((
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        options?: { temperature?: number; max_tokens?: number }
    ): Promise<string> => {
        return new Promise((resolve, reject) => {
            const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

            const listener = (msg: any) => {
                if (msg.type === 'webllm:result' && msg.requestId === requestId) {
                    chrome.runtime.onMessage.removeListener(listener)
                    resolve(msg.text)
                }
                if (msg.type === 'webllm:error' && msg.requestId === requestId) {
                    chrome.runtime.onMessage.removeListener(listener)
                    reject(new Error(msg.error))
                }
            }

            // 30s 超时
            const timeout = setTimeout(() => {
                chrome.runtime.onMessage.removeListener(listener)
                reject(new Error('WebLLM inference timeout'))
            }, 30000)

            chrome.runtime.onMessage.addListener(listener)

            chrome.runtime.sendMessage({
                type: 'webllm:generate',
                requestId,
                messages,
                temperature: options?.temperature ?? 0.7,
                max_tokens: options?.max_tokens ?? 512,
            }).catch(err => {
                clearTimeout(timeout)
                chrome.runtime.onMessage.removeListener(listener)
                reject(err)
            })
        })
    }, [])

    // 清除缓存
    const clearCache = useCallback(() => {
        chrome.runtime.sendMessage({ type: 'webllm:clear_cache' }).catch(() => { })
    }, [])

    // 查询状态
    const refreshStatus = useCallback(() => {
        chrome.runtime.sendMessage({ type: 'webllm:status' }, (resp) => {
            if (chrome.runtime.lastError || !resp) return
            setState(s => ({
                ...s,
                status: resp.status || s.status,
                modelId: resp.modelId || s.modelId,
                progress: resp.progress ?? s.progress,
            }))
        })
    }, [])

    // 更新设置
    const updateSettings = useCallback((patch: Partial<WebLLMSettings>) => {
        setSettings((prev) => ({
            ...(prev || DEFAULT_WEBLLM_SETTINGS),
            ...patch,
        }))
    }, [setSettings])

    // 获取当前模型配置
    const modelConfig = getModelConfig(currentSettings.language, currentSettings.modelTier)

    return {
        ...state,
        settings: currentSettings,
        modelConfig,
        loadModel,
        unloadModel,
        generate,
        clearCache,
        refreshStatus,
        updateSettings,
        isReady: state.status === 'ready',
        isLoading: state.status === 'downloading' || state.status === 'loading',
    }
}
