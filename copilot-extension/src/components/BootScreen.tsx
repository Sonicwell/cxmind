import { useEffect, useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Server, Wifi, ShieldCheck, CheckCircle2, AlertCircle, Loader2, WifiOff, BrainCircuit, Cpu } from "lucide-react"
import i18n from "~/i18n/config"
import { useTranslation } from "react-i18next"
import { DEMO_ENABLED } from "~/utils/demo-flag"

interface BootScreenProps {
    authStatus: "loading" | "authenticated" | "unauthenticated"
    wsStatus: "connecting" | "connected" | "disconnected"
    apiStatus: "loading" | "ready" | "error"
    isDemoMode?: boolean
    onComplete: () => void
}

const WS_TIMEOUT_MS = 8000   // Auto-skip after 8 seconds
const SKIP_SHOW_MS = 4000    // Show skip button after 4 seconds

type ItemStatus = "ready" | "authenticated" | "connected" | "loading" | "connecting" | "error" | "skipped" | "warn"

interface BootItem {
    id: string
    label: string
    icon: React.ReactNode
    status: ItemStatus
    displayStatus: string
}

async function detectGeminiNano(isDemoMode?: boolean): Promise<{ status: ItemStatus; display: string }> {
    const t = i18n.t.bind(i18n)
    if (DEMO_ENABLED && isDemoMode) return { status: "ready", display: t('boot.onDeviceReadyDemo') }
    try {
        const ai = (globalThis as any).ai
        if (!ai?.languageModel) {
            return { status: "skipped", display: t('boot.notAvailable') }
        }
        const caps = await ai.languageModel.capabilities()
        if (caps.available === "readily") {
            return { status: "ready", display: t('boot.onDeviceReady') }
        } else if (caps.available === "after-download") {
            return { status: "warn", display: t('boot.downloadRequired') }
        }
        return { status: "skipped", display: t('boot.notAvailable') }
    } catch {
        return { status: "skipped", display: t('boot.notAvailable') }
    }
}

async function detectWebLLM(isDemoMode?: boolean): Promise<{ status: ItemStatus; display: string }> {
    const t = i18n.t.bind(i18n)
    if (DEMO_ENABLED && isDemoMode) return { status: "ready", display: t('boot.localAIReadyDemo') }
    try {
        const result = await chrome.storage.local.get(["webllm-settings"])
        const settings = result["webllm-settings"]
        if (!settings?.enabled) {
            return { status: "skipped", display: t('boot.disabled') }
        }

        const gpu = (navigator as any).gpu
        if (!gpu) {
            return { status: "error", display: t('boot.webgpuNotAvailable') }
        }

        const adapter = await gpu.requestAdapter().catch(() => null)
        if (!adapter) {
            return { status: "error", display: t('boot.noGpuAdapter') }
        }

        const modelTier = settings.modelTier || 'standard'
        const modelLabel = modelTier === 'advanced' ? 'Phi-3.5 Mini' : 'Qwen2.5 1.5B'
        return { status: "loading", display: t('boot.modelInitializing', { model: modelLabel }) }
    } catch {
        return { status: "skipped", display: t('boot.notAvailable') }
    }
}

export function BootScreen({ authStatus, wsStatus, apiStatus, isDemoMode, onComplete }: BootScreenProps) {
    const [progress, setProgress] = useState(0)
    const [isReady, setIsReady] = useState(false)
    const [showSkip, setShowSkip] = useState(false)
    const [wsTimedOut, setWsTimedOut] = useState(false)
    const completedRef = useRef(false)

    const { t } = useTranslation()

    const [geminiStatus, setGeminiStatus] = useState<{ status: ItemStatus; display: string }>({ status: "loading", display: t('boot.detecting') })
    const [webllmStatus, setWebllmStatus] = useState<{ status: ItemStatus; display: string }>({ status: "loading", display: t('boot.detecting') })
    const [aiChecked, setAiChecked] = useState(false)

    // Run AI diagnostics on mount
    useEffect(() => {
        let mounted = true
        const run = async () => {
            // Brief delay so boot items animate in first
            await new Promise(r => setTimeout(r, 600))
            const g = await detectGeminiNano(isDemoMode)
            if (mounted) setGeminiStatus(g)

            await new Promise(r => setTimeout(r, 300))
            const w = await detectWebLLM(isDemoMode)
            if (mounted) {
                setWebllmStatus(w)
                setAiChecked(true)
            }
        }
        run()

        // 监听 WebLLM 实际加载进度 (从 Offscreen Document 广播)
        const llmListener = (msg: any) => {
            if (!mounted) return
            if (msg.type === 'webllm:progress') {
                setWebllmStatus({
                    status: 'loading',
                    display: t('boot.loadingProgress', { progress: msg.progress }),
                })
            } else if (msg.type === 'webllm:loaded') {
                setWebllmStatus({
                    status: 'ready',
                    display: t('boot.modelReady', { model: msg.modelId?.split('-').slice(0, 2).join(' ') || 'Local AI' }),
                })
            } else if (msg.type === 'webllm:status' && msg.status === 'ready') {
                setWebllmStatus({
                    status: 'ready',
                    display: t('boot.modelReady', { model: msg.modelId?.split('-').slice(0, 2).join(' ') || 'Local AI' }),
                })
            } else if (msg.type === 'webllm:error') {
                setWebllmStatus({
                    status: 'warn',
                    display: t('boot.loadFailed'),
                })
                // 加载失败不阻塞启动
                setAiChecked(true)
            }
        }
        chrome.runtime.onMessage.addListener(llmListener)

        return () => {
            mounted = false
            chrome.runtime.onMessage.removeListener(llmListener)
        }
    }, [isDemoMode])

    // Show "Skip" button after SKIP_SHOW_MS
    useEffect(() => {
        const timer = setTimeout(() => setShowSkip(true), SKIP_SHOW_MS)
        return () => clearTimeout(timer)
    }, [])

    // Auto-timeout WS after WS_TIMEOUT_MS
    useEffect(() => {
        if (wsStatus === 'connected') return
        if (DEMO_ENABLED && isDemoMode) {
            setWsTimedOut(true) // Instant mock timeout for demo
            return
        }
        const timer = setTimeout(() => {
            setWsTimedOut(true)
        }, WS_TIMEOUT_MS)
        return () => clearTimeout(timer)
    }, [wsStatus, isDemoMode])

    // If WS connects, clear timeout state
    useEffect(() => {
        if (wsStatus === 'connected') setWsTimedOut(false)
    }, [wsStatus])

    // 按state算进度
    useEffect(() => {
        let p = 0
        if (apiStatus === "ready") p += 20
        if (authStatus !== "loading") p += 20
        if (wsStatus === "connected" || wsTimedOut) p += 20
        if (geminiStatus.status !== "loading") p += 20
        if (webllmStatus.status !== "loading") p += 20
        if (authStatus === "unauthenticated") p = 100

        setProgress(p)
    }, [authStatus, wsStatus, apiStatus, wsTimedOut, geminiStatus, webllmStatus])

    // Fire onComplete once when progress hits 100
    useEffect(() => {
        if (progress >= 100 && !completedRef.current) {
            completedRef.current = true
            const timer = setTimeout(() => {
                setIsReady(true)
                onComplete()
            }, 800)
            return () => clearTimeout(timer)
        }
    }, [progress, onComplete])

    // Manual skip handler
    const handleSkip = () => {
        if (completedRef.current) return
        completedRef.current = true
        setProgress(100)
        setTimeout(() => {
            setIsReady(true)
            onComplete()
        }, 300)
    }

    const StatusIcon = ({ status }: { status: string }) => {
        const isLoading = status === "loading" || status === "connecting"
        const isOk = status === "ready" || status === "authenticated" || status === "connected"
        const isWarn = status === "warn" || status === "skipped"
        const isFail = !isLoading && !isOk && !isWarn

        return (
            <AnimatePresence mode="wait">
                {isLoading ? (
                    <motion.div
                        key="loading"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1, rotate: 360 }}
                        exit={{ opacity: 0, scale: 0.3 }}
                        transition={{ rotate: { duration: 1, repeat: Infinity, ease: "linear" }, scale: { duration: 0.2 } }}
                        style={{ display: 'flex' }}
                    >
                        <Loader2 className="w-4 h-4" style={{ color: 'rgba(96,165,250,0.9)' }} />
                    </motion.div>
                ) : isOk ? (
                    <motion.div
                        key="ok"
                        initial={{ opacity: 0, scale: 0, rotate: -180 }}
                        animate={{ opacity: 1, scale: [0, 1.3, 1], rotate: 0 }}
                        transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
                        style={{ display: 'flex' }}
                    >
                        <CheckCircle2 className="w-4 h-4" style={{ color: 'rgba(74,222,128,0.9)' }} />
                    </motion.div>
                ) : isWarn ? (
                    <motion.div
                        key="warn"
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: [0, 1, 0.7, 1], scale: [0, 1.2, 0.9, 1] }}
                        transition={{ duration: 0.5 }}
                        style={{ display: 'flex' }}
                    >
                        <AlertCircle className="w-4 h-4" style={{ color: 'rgba(251,191,36,0.9)' }} />
                    </motion.div>
                ) : (
                    <motion.div
                        key="fail"
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1, x: [0, -3, 3, -3, 3, 0] }}
                        transition={{ duration: 0.5, x: { delay: 0.15, duration: 0.35 } }}
                        style={{ display: 'flex' }}
                    >
                        <AlertCircle className="w-4 h-4" style={{ color: 'rgba(248,113,113,0.9)' }} />
                    </motion.div>
                )}
            </AnimatePresence>
        )
    }

    const wsDisplayStatus = wsStatus === "connected"
        ? t('boot.online')
        : wsTimedOut
            ? t('boot.offlineRetry')
            : t('boot.connecting')

    const wsItemStatus = wsStatus === "connected"
        ? "connected"
        : wsTimedOut
            ? "skipped"
            : "connecting"

    const items: BootItem[] = [
        {
            id: "api",
            label: t('boot.systemConfig'),
            icon: <Server className="w-4 h-4" />,
            status: apiStatus === "ready" ? "ready" : apiStatus === "error" ? "error" : "loading",
            displayStatus: apiStatus === "ready" ? t('boot.loaded') : t('boot.initializing')
        },
        {
            id: "auth",
            label: t('boot.userAuth'),
            icon: <ShieldCheck className="w-4 h-4" />,
            status: authStatus === "authenticated" ? "authenticated" : authStatus === "unauthenticated" ? "error" : "loading",
            displayStatus: authStatus === "authenticated" ? t('boot.verified') : authStatus === "unauthenticated" ? t('boot.signInRequired') : t('boot.verifying')
        },
        {
            id: "ws",
            label: t('boot.realtimeEngine'),
            icon: <Wifi className="w-4 h-4" />,
            status: wsItemStatus as ItemStatus,
            displayStatus: wsDisplayStatus
        },
        {
            id: "gemini",
            label: t('boot.geminiNano'),
            icon: <BrainCircuit className="w-4 h-4" />,
            status: geminiStatus.status,
            displayStatus: geminiStatus.display
        },
        {
            id: "webllm",
            label: t('boot.localAI'),
            icon: <Cpu className="w-4 h-4" />,
            status: webllmStatus.status,
            displayStatus: webllmStatus.display
        }
    ]

    return (
        <motion.div
            className="boot-screen"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
        >
            <div className="boot-content">
                <motion.div
                    className="boot-logo"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5 }}
                >
                    <div className="logo-glow"></div>
                    <div className="logo-glow"></div>
                    <div className="mb-4 text-white">
                        <svg width="64" height="64" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="6" y="11" width="4" height="10" rx="2" fill="currentColor" />
                            <rect x="14" y="6" width="4" height="20" rx="2" fill="currentColor" />
                            <rect x="22" y="11" width="4" height="10" rx="2" fill="currentColor" />
                        </svg>
                    </div>
                    <h1>CXMI.ai</h1>
                    <p>Copilot</p>
                </motion.div>

                <div className="boot-engine-list">
                    {items.map((item, index) => (
                        <motion.div
                            key={item.id}
                            className="boot-engine-item"
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: 0.2 + (index * 0.1) }}
                        >
                            <div className="engine-icon">{item.icon}</div>
                            <div className="engine-info">
                                <span className="engine-label">{item.label}</span>
                                <span className="engine-status-text">{item.displayStatus}</span>
                            </div>
                            <div className="engine-status-icon">
                                <StatusIcon status={item.status} />
                            </div>
                        </motion.div>
                    ))}
                </div>

                <div className="boot-progress-container">
                    <motion.div
                        className="boot-progress-bar"
                        initial={{ width: "0%" }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.5 }}
                    />
                </div>

                {/* Skip button — appears after SKIP_SHOW_MS */}
                {showSkip && progress < 100 && (
                    <motion.button
                        className="boot-skip-btn"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        onClick={handleSkip}
                    >
                        {t('boot.continueOffline')}
                    </motion.button>
                )}

                <div className="boot-footer">
                    v1.0.0 • {t('boot.privacyFirst')}
                </div>
            </div>

            <style>{`
                .boot-skip-btn {
                    margin-top: 12px;
                    padding: 8px 20px;
                    border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 8px;
                    background: rgba(255,255,255,0.06);
                    color: rgba(255,255,255,0.7);
                    font-size: 0.78rem;
                    font-family: inherit;
                    cursor: pointer;
                    transition: all 0.2s;
                    backdrop-filter: blur(8px);
                }
                .boot-skip-btn:hover {
                    background: rgba(255,255,255,0.12);
                    color: white;
                    border-color: rgba(255,255,255,0.3);
                }
            `}
            </style>
        </motion.div>
    )
}
