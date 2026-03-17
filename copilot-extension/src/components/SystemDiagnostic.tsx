import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Cpu, BrainCircuit, Chrome, RefreshCw, CheckCircle2, AlertCircle, Loader2, XCircle } from "lucide-react"

interface DiagItem {
    id: string
    label: string
    detail: string
    status: "checking" | "ok" | "warn" | "fail"
    icon: React.ReactNode
}

async function detectGeminiNano(): Promise<{ status: DiagItem["status"]; detail: string }> {
    try {
        // Chrome Built-in AI: Prompt API (Chrome 138+)
        const ai = (globalThis as any).ai
        if (!ai?.languageModel) {
            return { status: "fail", detail: "API not available" }
        }

        const caps = await ai.languageModel.capabilities()
        if (caps.available === "readily") {
            return { status: "ok", detail: "Ready — on-device model loaded" }
        } else if (caps.available === "after-download") {
            return { status: "warn", detail: "Available — model download required" }
        } else {
            return { status: "fail", detail: "Not available on this device" }
        }
    } catch (e: any) {
        return { status: "fail", detail: e.message || "Detection failed" }
    }
}

async function detectWebLLM(): Promise<{ status: DiagItem["status"]; detail: string }> {
    try {
        // Check if WebAssembly SIMD is supported (required for WebLLM)
        const simdSupported = typeof WebAssembly === "object" &&
            typeof WebAssembly.validate === "function" &&
            WebAssembly.validate(new Uint8Array([
                0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123,
                3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11
            ]))

        if (!simdSupported) {
            return { status: "fail", detail: "WebAssembly SIMD not supported" }
        }

        // Check WebGPU (preferred backend for WebLLM)
        const gpu = (navigator as any).gpu
        if (gpu) {
            try {
                const adapter = await gpu.requestAdapter()
                if (adapter) {
                    const info = await adapter.requestAdapterInfo?.() || {}
                    const name = info.device || info.description || "Unknown GPU"
                    return { status: "warn", detail: `WebGPU ready (${name}) — SDK not integrated` }
                }
            } catch { /* fallback */ }
        }

        return { status: "warn", detail: "Wasm SIMD only — SDK not integrated" }
    } catch {
        return { status: "fail", detail: "Detection failed" }
    }
}

function getBrowserInfo(): { browser: string; version: string; extVersion: string } {
    const ua = navigator.userAgent
    let browser = "Unknown"
    let version = ""

    const chromeMatch = ua.match(/Chrome\/(\d+\.\d+)/)
    const edgeMatch = ua.match(/Edg\/(\d+\.\d+)/)
    const firefoxMatch = ua.match(/Firefox\/(\d+\.\d+)/)

    if (edgeMatch) {
        browser = "Edge"
        version = edgeMatch[1]
    } else if (chromeMatch) {
        browser = "Chrome"
        version = chromeMatch[1]
    } else if (firefoxMatch) {
        browser = "Firefox"
        version = firefoxMatch[1]
    }

    let extVersion = "—"
    try {
        const manifest = chrome?.runtime?.getManifest?.()
        if (manifest?.version) extVersion = manifest.version
    } catch { /* not in extension context */ }

    return { browser, version, extVersion }
}

export function SystemDiagnostic() {
    const [items, setItems] = useState<DiagItem[]>([])
    const [running, setRunning] = useState(false)
    const [hasRun, setHasRun] = useState(false)

    const runDiagnostics = async () => {
        setRunning(true)
        setHasRun(true)

        const { browser, version, extVersion } = getBrowserInfo()

        // 初始checking状态
        const initial: DiagItem[] = [
            {
                id: "browser",
                label: "Browser & Extension",
                detail: `${browser} ${version} • Extension v${extVersion}`,
                status: "ok",
                icon: <Chrome className="w-4 h-4" />,
            },
            {
                id: "gemini",
                label: "Gemini Nano",
                detail: "Detecting...",
                status: "checking",
                icon: <BrainCircuit className="w-4 h-4" />,
            },
            {
                id: "webllm",
                label: "WebLLM Runtime",
                detail: "Detecting...",
                status: "checking",
                icon: <Cpu className="w-4 h-4" />,
            },
        ]
        setItems([...initial])

        // Detect Gemini Nano
        await new Promise(r => setTimeout(r, 400)) // Brief delay for animation
        const gemini = await detectGeminiNano()
        initial[1] = { ...initial[1], ...gemini }
        setItems([...initial])

        // Detect WebLLM
        await new Promise(r => setTimeout(r, 300))
        const webllm = await detectWebLLM()
        initial[2] = { ...initial[2], ...webllm }
        setItems([...initial])

        setRunning(false)
    }

    // Auto-run on mount
    useEffect(() => {
        runDiagnostics()
    }, [])

    const getStatusIcon = (status: DiagItem["status"]) => {
        switch (status) {
            case "ok":
                return <CheckCircle2 className="w-4 h-4" style={{ color: "var(--success)" }} />
            case "warn":
                return <AlertCircle className="w-4 h-4" style={{ color: "var(--warning)" }} />
            case "fail":
                return <XCircle className="w-4 h-4" style={{ color: "var(--danger)" }} />
            case "checking":
                return <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--primary)" }} />
        }
    }

    const getStatusColor = (status: DiagItem["status"]) => {
        switch (status) {
            case "ok": return "var(--success)"
            case "warn": return "var(--warning)"
            case "fail": return "var(--danger)"
            case "checking": return "var(--primary)"
        }
    }

    return (
        <div className="glass-card" style={{ padding: 16 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                <h3 className="text-xs font-semibold text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                    System Check
                </h3>
                {hasRun && (
                    <button
                        onClick={runDiagnostics}
                        disabled={running}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: running ? 'default' : 'pointer',
                            color: 'var(--text-muted)',
                            padding: 4,
                            display: 'flex',
                            alignItems: 'center',
                            opacity: running ? 0.4 : 0.7,
                            transition: 'opacity 0.2s',
                        }}
                        title="Re-run diagnostics"
                    >
                        <RefreshCw size={14} style={running ? { animation: 'spin 1s linear infinite' } : {}} />
                    </button>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((item, index) => (
                    <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.08, duration: 0.25 }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 10px',
                            borderRadius: 10,
                            background: 'rgba(0,0,0,0.02)',
                            border: '1px solid transparent',
                            transition: 'all 0.3s',
                        }}
                    >
                        {/* Icon */}
                        <div style={{
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: `color-mix(in srgb, ${getStatusColor(item.status)} 10%, transparent)`,
                            color: getStatusColor(item.status),
                            flexShrink: 0,
                            transition: 'all 0.3s',
                        }}>
                            {item.icon}
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, lineHeight: 1.3 }}>
                                {item.label}
                            </div>
                            <div style={{
                                fontSize: '0.7rem',
                                color: item.status === 'fail' ? 'var(--danger)' :
                                    item.status === 'warn' ? 'var(--warning)' : 'var(--text-muted)',
                                lineHeight: 1.3,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}>
                                {item.detail}
                            </div>
                        </div>

                        {/* Status icon */}
                        <div style={{ flexShrink: 0 }}>
                            {getStatusIcon(item.status)}
                        </div>
                    </motion.div>
                ))}
            </div>

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
            `}</style>
        </div>
    )
}
