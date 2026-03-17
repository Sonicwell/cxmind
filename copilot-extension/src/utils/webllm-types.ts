// WebLLM 通信协议类型定义 — SidePanel / Background / Offscreen 三方共用

export type WebLLMLanguage = 'en' | 'zh' | 'ja'
export type WebLLMModelTier = 'light' | 'standard' | 'advanced'

export interface ModelConfig {
    id: string
    label: string
    size: string
    sizeBytes: number
    contextWindow: number
}

// 语种 × 档位 → 模型矩阵
export const WEBLLM_MODEL_MATRIX: Record<WebLLMLanguage, Record<WebLLMModelTier, ModelConfig>> = {
    en: {
        light: { id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC', label: 'SmolLM2 1.7B', size: '~1.0GB', sizeBytes: 1000 * 1024 * 1024, contextWindow: 2048 },
        standard: { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', label: 'Phi-3.5 Mini', size: '~2.3GB', sizeBytes: 2300 * 1024 * 1024, contextWindow: 4096 },
        advanced: { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC', label: 'Llama 3.1 8B', size: '~5.0GB', sizeBytes: 5000 * 1024 * 1024, contextWindow: 4096 },
    },
    zh: {
        light: { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 1.5B', size: '~900MB', sizeBytes: 900 * 1024 * 1024, contextWindow: 4096 },
        standard: { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 3B', size: '~1.9GB', sizeBytes: 1900 * 1024 * 1024, contextWindow: 4096 },
        advanced: { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 7B', size: '~4.5GB', sizeBytes: 4500 * 1024 * 1024, contextWindow: 4096 },
    },
    ja: {
        light: { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 1.5B', size: '~900MB', sizeBytes: 900 * 1024 * 1024, contextWindow: 4096 },
        standard: { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 3B', size: '~1.9GB', sizeBytes: 1900 * 1024 * 1024, contextWindow: 4096 },
        advanced: { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 7B', size: '~4.5GB', sizeBytes: 4500 * 1024 * 1024, contextWindow: 4096 },
    },
}

// 语言显示信息
export const LANGUAGE_OPTIONS: Array<{ value: WebLLMLanguage; label: string; flag: string }> = [
    { value: 'en', label: 'English', flag: '🇬🇧' },
    { value: 'zh', label: '中文', flag: '🇨🇳' },
    { value: 'ja', label: '日本語', flag: '🇯🇵' },
]

export const TIER_OPTIONS: Array<{ value: WebLLMModelTier; label: string; desc: string }> = [
    { value: 'light', label: '🟢 Light', desc: 'Fast load, basic quality' },
    { value: 'standard', label: '⭐ Standard', desc: 'Recommended balance' },
    { value: 'advanced', label: '🔥 Advanced', desc: 'Best quality, large download' },
]

// 向后兼容: 根据 language + tier 获取模型配置
export function getModelConfig(language?: WebLLMLanguage, tier?: WebLLMModelTier): ModelConfig {
    const lang = language && WEBLLM_MODEL_MATRIX[language] ? language : 'en'
    const t = tier && WEBLLM_MODEL_MATRIX[lang][tier] ? tier : 'standard'
    return WEBLLM_MODEL_MATRIX[lang][t]
}

// 旧版兼容 alias
export const WEBLLM_MODELS = WEBLLM_MODEL_MATRIX.zh

export type WebLLMStatus =
    | 'disabled'     // 用户未开启
    | 'not_cached'   // 开启但未下载
    | 'downloading'  // 下载中
    | 'cached'       // 已下载未加载到 GPU
    | 'loading'      // 加载到 GPU VRAM 中
    | 'ready'        // GPU 推理就绪
    | 'error'        // 出错

// SidePanel / Background → Offscreen 的请求
export type WebLLMRequest =
    | { type: 'webllm:load'; modelId: string }
    | { type: 'webllm:unload' }
    | { type: 'webllm:generate'; requestId: string; messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>; temperature?: number; max_tokens?: number }
    | { type: 'webllm:status' }
    | { type: 'webllm:clear_cache' }

// Offscreen → SidePanel / Background 的响应/事件
export type WebLLMEvent =
    | { type: 'webllm:progress'; progress: number; text: string; timeElapsed?: number }
    | { type: 'webllm:loaded'; modelId: string }
    | { type: 'webllm:result'; requestId: string; text: string; usage?: { prompt_tokens: number; completion_tokens: number }; latencyMs: number }
    | { type: 'webllm:error'; requestId?: string; error: string }
    | { type: 'webllm:status'; status: WebLLMStatus; modelId?: string; progress?: number }
    | { type: 'webllm:unloaded' }

// Settings 中持久化的 WebLLM 配置
export interface WebLLMSettings {
    enabled: boolean
    language: WebLLMLanguage
    modelTier: WebLLMModelTier
    preloadOnBoot: boolean          // BootScreen 时预加载
    enableSummary: boolean          // S1: 会话摘要
    enableCompliance: boolean       // S2: 实时合规
    enableSmartReply: boolean       // S3: Smart Reply
    enableActionDraft: boolean      // S4: Action Draft
}

export const DEFAULT_WEBLLM_SETTINGS: WebLLMSettings = {
    enabled: false,
    language: 'en',
    modelTier: 'standard',
    preloadOnBoot: true,
    enableSummary: true,
    enableCompliance: true,
    enableSmartReply: true,
    enableActionDraft: false,
}
