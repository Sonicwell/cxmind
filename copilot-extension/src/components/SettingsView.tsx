
import { useSettings } from "~/hooks/useSettings"
import { useAuth } from "~/hooks/useAuth"
import { useWebLLM } from "~/hooks/useWebLLM"
import { LANGUAGE_OPTIONS, TIER_OPTIONS } from "~/utils/webllm-types"
import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Phone, PictureInPicture, ExternalLink, ChevronRight, Lock, X, BrainCircuit, Download, Trash2, Send, Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { ProfileEditView } from "./Settings/ProfileEditView"

export function SettingsView({ onTestSummary }: { onTestSummary?: () => void }) {
    const { settings, toggleSetting } = useSettings()
    const { agentInfo, logout, bindGoogleAccount, unbindGoogleAccount } = useAuth()
    const { t, i18n } = useTranslation()
    const {
        status: llmStatus, progress: llmProgress, modelConfig,
        settings: llmSettings, updateSettings: updateLLMSettings,
        loadModel, clearCache, inferenceCount, avgLatencyMs, error, generate, isReady
    } = useWebLLM()
    const [fileInputRef] = useState<any>(null) // Deprecated
    const [apiUrl, setApiUrl] = useState("")
    const [view, setView] = useState<'main' | 'profile'>('main')
    const [imgError, setImgError] = useState(false)
    const [bindStatus, setBindStatus] = useState<{ type: 'success' | 'error' | 'loading' | null, message: string }>({ type: null, message: '' })
    const [showUnbindConfirm, setShowUnbindConfirm] = useState(false)

    useEffect(() => {
        chrome.storage.sync.get(["apiUrl"], (res) => {
            if (res.apiUrl) setApiUrl(res.apiUrl)
        })
    }, [])

    // avatar变了重置error状态
    useEffect(() => {
        setImgError(false)
    }, [agentInfo?.avatar])

    const avatarUrl = agentInfo?.avatar?.startsWith("http")
        ? agentInfo.avatar
        : agentInfo?.avatar
            ? `${apiUrl}${agentInfo.avatar}`
            : null

    if (view === 'profile') {
        return <ProfileEditView onBack={() => setView('main')} />
    }

    const showImg = avatarUrl && !imgError

    const handleBind = async () => {
        setBindStatus({ type: 'loading', message: t('settings.binding') })
        try {
            await bindGoogleAccount?.()
            setBindStatus({ type: 'success', message: t('settings.bindSuccess') })
            setTimeout(() => setBindStatus({ type: null, message: '' }), 3000)
        } catch (e: any) {
            setBindStatus({ type: 'error', message: e.message })
            setTimeout(() => setBindStatus({ type: null, message: '' }), 4000)
        }
    }

    const handleUnbind = async () => {
        setShowUnbindConfirm(false)
        setBindStatus({ type: 'loading', message: t('settings.unbinding') })
        try {
            await unbindGoogleAccount?.()
            setBindStatus({ type: 'success', message: t('settings.unbindSuccess') })
            setTimeout(() => setBindStatus({ type: null, message: '' }), 3000)
        } catch (e: any) {
            setBindStatus({ type: 'error', message: e.message })
            setTimeout(() => setBindStatus({ type: null, message: '' }), 4000)
        }
    }

    const llmStatusLabel = {
        disabled: t('settings.llmOff'),
        not_cached: t('settings.llmNotCached'),
        downloading: t('settings.llmDownloading', { progress: llmProgress }),
        cached: t('settings.llmCached'),
        loading: t('settings.llmLoading', { progress: llmProgress }),
        ready: t('settings.llmReady'),
        error: t('settings.llmError'),
    }[llmStatus] || llmStatus

    const llmStatusColor = {
        disabled: 'var(--text-muted)',
        not_cached: 'var(--warning)',
        downloading: 'var(--primary)',
        cached: 'var(--text-muted)',
        loading: 'var(--primary)',
        ready: 'var(--success)',
        error: 'var(--danger)',
    }[llmStatus] || 'var(--text-muted)'

    return (
        <div className="flex-col gap-md animate-fade-in" style={{ padding: '0 4px' }}>

            {/* Profile Section */}
            <div className="glass-card" style={{ padding: 16 }}>
                <h3 className="text-xs font-semibold text-muted" style={{ marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t('settings.profile')}
                </h3>

                <div
                    className="flex items-center gap-md cursor-pointer hover:bg-white/5 p-2 -m-2 rounded-lg transition-colors group"
                    onClick={() => setView('profile')}
                >
                    <div className="relative">
                        {showImg ? (
                            <img
                                src={avatarUrl}
                                alt="Avatar"
                                style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
                                onError={() => setImgError(true)}
                            />
                        ) : (
                            <div style={{
                                width: 48,
                                height: 48,
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, var(--primary), #a855f7)',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 20,
                                fontWeight: 'bold'
                            }}>
                                {agentInfo?.displayName?.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>

                    <div className="flex-1">
                        <div className="font-semibold text-base flex items-center gap-2">
                            {agentInfo?.displayName}
                            <ChevronRight size={16} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="text-sm text-muted">{agentInfo?.email}</div>
                        <div className="flex items-center gap-xs mt-1">
                            <span className="text-xs bg-primary bg-opacity-10 text-primary px-2 py-0.5 rounded-full capitalize">
                                {agentInfo?.role}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Google Bind Action */}
                <div style={{ marginTop: 16, borderTop: '1px solid var(--glass-border)', paddingTop: 16 }}>

                    {bindStatus.type && (
                        <AnimatePresence>
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className={`text-xs mb-3 p-2 rounded flex items-center gap-2 ${bindStatus.type === 'success' ? 'bg-green-500/10 text-green-500' :
                                    bindStatus.type === 'error' ? 'bg-red-500/10 text-red-500' :
                                        'bg-blue-500/10 text-blue-500'
                                    }`}
                                style={{
                                    background: bindStatus.type === 'success' ? 'rgba(74, 222, 128, 0.1)' : bindStatus.type === 'error' ? 'rgba(248, 113, 113, 0.1)' : 'rgba(96, 165, 250, 0.1)',
                                    color: bindStatus.type === 'success' ? '#4ade80' : bindStatus.type === 'error' ? '#f87171' : '#60a5fa'
                                }}
                            >
                                {bindStatus.type === 'loading' ? <div className="spin rounded-full h-3 w-3 border-b-2 border-current"></div> : null}
                                <span>{bindStatus.message}</span>
                            </motion.div>
                        </AnimatePresence>
                    )}

                    {!agentInfo?.googleEmail && (
                        <button
                            className="btn btn-secondary w-full"
                            style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}
                            onClick={handleBind}
                            disabled={bindStatus.type === 'loading'}
                        >
                            <svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                                <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
                                <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
                                <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
                                <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
                            </svg>
                            {t('settings.bindGoogle')}
                        </button>
                    )}

                    {agentInfo?.googleEmail && (
                        <>
                            {!showUnbindConfirm ? (
                                <button
                                    className="btn btn-secondary w-full"
                                    style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)' }}
                                    onClick={() => setShowUnbindConfirm(true)}
                                    disabled={bindStatus.type === 'loading'}
                                >
                                    {t('settings.unbindGoogle')}
                                </button>
                            ) : (
                                <div className="flex gap-2">
                                    <button
                                        className="btn w-full"
                                        style={{ background: 'var(--danger)', color: 'white' }}
                                        onClick={handleUnbind}
                                    >
                                        {t('common.confirm')}
                                    </button>
                                    <button
                                        className="btn btn-secondary w-full"
                                        onClick={() => setShowUnbindConfirm(false)}
                                    >
                                        {t('common.cancel')}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Preferences Section */}
            <div className="glass-card" style={{ padding: 16 }}>
                <h3 className="text-xs font-semibold text-muted" style={{ marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t('settings.preferences')}
                </h3>

                <div className="flex-col gap-md">
                    <SettingItem
                        icon={<Phone size={18} />}
                        label={t('settings.clickToCall')}
                        description={t('settings.clickToCallDesc')}
                        checked={settings.enableClickToCall}
                        onChange={() => toggleSetting("enableClickToCall")}
                    />

                    <div style={{ height: 1, background: 'var(--glass-border)' }} />

                    <SettingItem
                        icon={<PictureInPicture size={18} />}
                        label={t('settings.pip')}
                        description={t('settings.pipDesc')}
                        checked={settings.enablePIP}
                        onChange={() => toggleSetting("enablePIP")}
                    />

                    <div style={{ height: 1, background: 'var(--glass-border)' }} />

                    {/* UI Language Selector */}
                    <div style={{ padding: '4px 0' }}>
                        <div className="text-xs text-muted" style={{ marginBottom: 6 }}>{t('settings.uiLanguage')}</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                            {[
                                { code: 'en', flag: '🇺🇸', label: 'English' },
                                { code: 'zh', flag: '🇨🇳', label: '中文' },
                                { code: 'ja', flag: '🇯🇵', label: '日本語' },
                                { code: 'ko', flag: '🇰🇷', label: '한국어' },
                            ].map(lang => (
                                <button
                                    key={lang.code}
                                    onClick={() => i18n.changeLanguage(lang.code)}
                                    style={{
                                        flex: 1, padding: '6px 4px', borderRadius: 8,
                                        border: i18n.language === lang.code ? '1.5px solid var(--primary)' : '1px solid var(--glass-border)',
                                        background: i18n.language === lang.code ? 'rgba(108,75,245,0.08)' : 'transparent',
                                        color: i18n.language === lang.code ? 'var(--primary)' : 'var(--text-primary)',
                                        cursor: 'pointer', fontSize: '0.65rem', fontWeight: 500,
                                        fontFamily: 'inherit', transition: 'all 0.2s',
                                    }}
                                >
                                    {lang.flag} {lang.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Local AI Section */}
            <div className="glass-card" style={{ padding: 16 }}>
                <h3 className="text-xs font-semibold text-muted" style={{ marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t('settings.localAI')}
                </h3>

                <div className="flex-col gap-md">
                    <SettingItem
                        icon={<BrainCircuit size={18} />}
                        label={t('settings.enableLocalAI')}
                        description={t('settings.enableLocalAIDesc')}
                        checked={llmSettings.enabled}
                        onChange={() => updateLLMSettings({ enabled: !llmSettings.enabled })}
                    />

                    {llmSettings.enabled && (
                        <>
                            <div style={{ height: 1, background: 'var(--glass-border)' }} />

                            {/* 语言选择 */}
                            <div style={{ padding: '8px 0' }}>
                                <div className="text-xs text-muted" style={{ marginBottom: 6 }}>{t('settings.language')}</div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    {LANGUAGE_OPTIONS.map(lang => (
                                        <button
                                            key={lang.value}
                                            onClick={() => updateLLMSettings({ language: lang.value })}
                                            style={{
                                                flex: 1, padding: '6px 8px', borderRadius: 8,
                                                border: llmSettings.language === lang.value ? '1.5px solid var(--primary)' : '1px solid var(--glass-border)',
                                                background: llmSettings.language === lang.value ? 'rgba(108,75,245,0.08)' : 'white',
                                                color: llmSettings.language === lang.value ? 'var(--primary)' : 'var(--text-primary)',
                                                cursor: 'pointer', fontSize: '0.7rem', fontWeight: 500,
                                                fontFamily: 'inherit', transition: 'all 0.2s',
                                            }}
                                        >
                                            {lang.flag} {lang.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 模型档位 */}
                            <div style={{ padding: '4px 0 8px' }}>
                                <div className="text-xs text-muted" style={{ marginBottom: 6 }}>{t('settings.modelTier')}</div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    {TIER_OPTIONS.map(tier => (
                                        <button
                                            key={tier.value}
                                            onClick={() => updateLLMSettings({ modelTier: tier.value })}
                                            style={{
                                                flex: 1, padding: '6px 4px', borderRadius: 8,
                                                border: llmSettings.modelTier === tier.value ? '1.5px solid var(--primary)' : '1px solid var(--glass-border)',
                                                background: llmSettings.modelTier === tier.value ? 'rgba(108,75,245,0.08)' : 'white',
                                                color: llmSettings.modelTier === tier.value ? 'var(--primary)' : 'var(--text-primary)',
                                                cursor: 'pointer', fontSize: '0.65rem', fontWeight: 500,
                                                fontFamily: 'inherit', transition: 'all 0.2s',
                                            }}
                                        >
                                            {tier.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ height: 1, background: 'var(--glass-border)' }} />

                            {/* 当前模型信息 */}
                            <div style={{ padding: '8px 0' }}>
                                <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                                    <span className="text-xs text-muted">{t('settings.model')}</span>
                                    <span className="text-xs font-medium">{modelConfig.label}</span>
                                </div>
                                <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                                    <span className="text-xs text-muted">{t('settings.status')}</span>
                                    <span className="text-xs font-medium" style={{ color: llmStatusColor }}>{llmStatusLabel}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted">{t('settings.size')}</span>
                                    <span className="text-xs">{modelConfig.size}</span>
                                </div>
                            </div>

                            {/* 下载进度条 */}
                            {(llmStatus === 'downloading' || llmStatus === 'loading') && (
                                <div style={{ marginBottom: 8 }}>
                                    <div style={{
                                        width: '100%', height: 4, borderRadius: 2,
                                        background: 'var(--glass-border)',
                                        overflow: 'hidden'
                                    }}>
                                        <motion.div
                                            style={{
                                                height: '100%',
                                                borderRadius: 2,
                                                background: 'linear-gradient(90deg, var(--primary), #a855f7)',
                                            }}
                                            animate={{ width: `${llmProgress}%` }}
                                            transition={{ duration: 0.3 }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* 操作按钮 */}
                            <div className="flex gap-2">
                                {(llmStatus === 'not_cached' || llmStatus === 'cached' || llmStatus === 'error') && (
                                    <button
                                        className="btn btn-secondary w-full"
                                        style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}
                                        onClick={() => loadModel()}
                                    >
                                        <Download size={14} />
                                        {llmStatus === 'cached' ? t('settings.loadModel') : t('settings.downloadLoad')}
                                    </button>
                                )}
                                {(llmStatus === 'ready' || llmStatus === 'cached') && (
                                    <button
                                        className="btn btn-secondary w-full"
                                        style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: 'var(--danger)' }}
                                        onClick={clearCache}
                                    >
                                        <Trash2 size={14} />
                                        {t('settings.clearCache')}
                                    </button>
                                )}
                            </div>

                            {/* 错误显示 */}
                            {error && (
                                <div style={{
                                    padding: '8px',
                                    marginTop: '8px',
                                    borderRadius: '6px',
                                    background: 'rgba(248, 113, 113, 0.1)',
                                    color: '#f87171',
                                    fontSize: '0.7rem',
                                    wordBreak: 'break-word'
                                }}>
                                    {error}
                                </div>
                            )}

                            <div style={{ height: 1, background: 'var(--glass-border)' }} />

                            {/* 功能开关 */}
                            <div style={{ padding: '4px 0' }}>
                                <div className="text-xs text-muted" style={{ marginBottom: 8 }}>{t('settings.features')}</div>
                                <LLMFeatureToggle
                                    label={t('settings.sessionSummary')}
                                    desc={t('settings.sessionSummaryDesc')}
                                    checked={llmSettings.enableSummary}
                                    onChange={() => updateLLMSettings({ enableSummary: !llmSettings.enableSummary })}
                                />
                                <LLMFeatureToggle
                                    label={t('settings.complianceCheck')}
                                    desc={t('settings.complianceCheckDesc')}
                                    checked={llmSettings.enableCompliance}
                                    onChange={() => updateLLMSettings({ enableCompliance: !llmSettings.enableCompliance })}
                                />
                                <LLMFeatureToggle
                                    label={t('settings.smartReply')}
                                    desc={t('settings.smartReplyDesc')}
                                    checked={llmSettings.enableSmartReply}
                                    onChange={() => updateLLMSettings({ enableSmartReply: !llmSettings.enableSmartReply })}
                                />
                            </div>

                            <div style={{ height: 1, background: 'var(--glass-border)' }} />

                            {/* 预加载 + 统计 */}
                            <LLMFeatureToggle
                                label={t('settings.preloadStartup')}
                                desc={t('settings.preloadStartupDesc')}
                                checked={llmSettings.preloadOnBoot}
                                onChange={() => updateLLMSettings({ preloadOnBoot: !llmSettings.preloadOnBoot })}
                            />

                            {inferenceCount > 0 && (
                                <div className="text-xs text-muted" style={{ textAlign: 'center', marginTop: 4 }}>
                                    {t('settings.inferences', { count: inferenceCount, latency: (avgLatencyMs / 1000).toFixed(1) })}
                                </div>
                            )}

                            {/* 测试对话框 */}
                            {isReady && (
                                <>
                                    <div style={{ height: 1, background: 'var(--glass-border)', marginTop: 8 }} />
                                    <TestChatBox generate={generate} />
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>



            {/* Account Actions */}
            <div className="glass-card" style={{ padding: 16 }}>
                <h3 className="text-xs font-semibold text-muted" style={{ marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t('settings.account')}
                </h3>

                <button
                    className="flex items-center justify-between w-full btn-secondary"
                    style={{ padding: 12, border: 'none', background: 'transparent' }}
                    onClick={logout}
                >
                    <div className="flex items-center gap-sm">
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} />
                        <span className="font-medium">{t('settings.connectedStatus')}</span>
                    </div>
                    <span className="text-xs text-muted hover:text-red-500 transition-colors">{t('settings.signOutLabel')}</span>
                </button>
            </div>

            {/* Debug Section */}
            {onTestSummary && (
                <div className="glass-card" style={{ padding: 16 }}>
                    <h3 className="text-xs font-semibold text-muted" style={{ marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t('settings.debug')}
                    </h3>
                    <button
                        className="btn btn-secondary w-full"
                        onClick={onTestSummary}
                    >
                        {t('settings.testSummary')}
                    </button>
                </div>
            )}

            {/* About Section */}
            <div style={{ textAlign: 'center', marginTop: 16 }}>
                <p className="text-xs text-muted">{t('settings.version')}</p>
            </div>


        </div>
    )
}

function SettingItem({ icon, label, description, checked, onChange }: any) {
    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-md">
                <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: checked ? 'rgba(108, 75, 245, 0.1)' : 'rgba(0,0,0,0.03)',
                    color: checked ? 'var(--primary)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    {icon}
                </div>
                <div>
                    <div className="font-medium">{label}</div>
                    <div className="text-xs text-muted">{description}</div>
                </div>
            </div>

            <Switch checked={checked} onChange={onChange} />
        </div>
    )
}

function Switch({ checked, onChange }: any) {
    return (
        <div
            onClick={onChange}
            style={{
                width: 44,
                height: 24,
                borderRadius: 999,
                background: checked ? 'var(--primary)' : 'rgba(0,0,0,0.1)',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background 0.2s ease',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
            }}
        >
            <motion.div
                initial={false}
                animate={{ x: checked ? 22 : 2 }}
                style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: 'white',
                    position: 'absolute',
                    top: 2,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}
            />
        </div>
    )
}

function LLMFeatureToggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: () => void }) {
    return (
        <div
            className="flex items-center justify-between"
            style={{ padding: '4px 0', cursor: 'pointer' }}
            onClick={onChange}
        >
            <div>
                <div className="text-xs font-medium">{label}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{desc}</div>
            </div>
            <div style={{
                width: 32,
                height: 18,
                borderRadius: 999,
                background: checked ? 'var(--primary)' : 'rgba(0,0,0,0.1)',
                position: 'relative',
                transition: 'background 0.2s ease',
                flexShrink: 0,
            }}>
                <motion.div
                    initial={false}
                    animate={{ x: checked ? 16 : 2 }}
                    style={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: 'white',
                        position: 'absolute',
                        top: 2,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }}
                />
            </div>
        </div>
    )
}

// 测试对话框 — 用于验证本地 AI 推理是否正常
function TestChatBox({ generate }: { generate: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, options?: any) => Promise<string> }) {
    const { t } = useTranslation()
    const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; latency?: number }>>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }, [messages])

    const handleSend = async () => {
        const text = input.trim()
        if (!text || loading) return

        const userMsg = { role: 'user' as const, content: text }
        setMessages(prev => [...prev, userMsg])
        setInput('')
        setLoading(true)

        try {
            const chatHistory = messages.map(m => ({ role: m.role, content: m.content }))
            const startTime = Date.now()
            const reply = await generate([
                { role: 'system', content: 'You are a helpful assistant. Keep responses concise (under 100 words). Respond in the same language as the user.' },
                ...chatHistory,
                userMsg,
            ], { temperature: 0.7, max_tokens: 256 })
            const latency = Date.now() - startTime
            setMessages(prev => [...prev, { role: 'assistant', content: reply, latency }])
        } catch (err: any) {
            setMessages(prev => [...prev, { role: 'assistant', content: `❌ Error: ${err.message}` }])
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ marginTop: 8 }}>
            <div className="text-xs text-muted" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{t('settings.testChat')}</span>
                {messages.length > 0 && (
                    <button
                        onClick={() => setMessages([])}
                        style={{ fontSize: '0.6rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >{t('common.clear')}</button>
                )}
            </div>

            {/* 消息列表 */}
            <div
                ref={scrollRef}
                style={{
                    maxHeight: 200,
                    overflowY: 'auto',
                    borderRadius: 8,
                    background: 'rgba(0,0,0,0.02)',
                    border: '1px solid var(--glass-border)',
                    padding: messages.length > 0 ? 8 : 0,
                    marginBottom: 6,
                    display: messages.length > 0 ? 'flex' : 'none',
                    flexDirection: 'column',
                    gap: 6,
                }}
            >
                {messages.map((msg, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        <div style={{
                            maxWidth: '85%',
                            padding: '6px 10px',
                            borderRadius: msg.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                            background: msg.role === 'user' ? 'var(--primary)' : 'white',
                            color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                            fontSize: '0.75rem',
                            lineHeight: 1.45,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                        }}>
                            {msg.content}
                        </div>
                        {msg.latency && (
                            <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                🧠 {(msg.latency / 1000).toFixed(1)}s
                            </span>
                        )}
                    </div>
                ))}
                {loading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0' }}>
                        <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{t('settings.thinking')}</span>
                    </div>
                )}
            </div>

            {/* 输入框 */}
            <div style={{ display: 'flex', gap: 6 }}>
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder={t('settings.testChatPlaceholder')}
                    disabled={loading}
                    style={{
                        flex: 1,
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--glass-border)',
                        background: 'white',
                        fontSize: '0.75rem',
                        outline: 'none',
                        fontFamily: 'inherit',
                    }}
                />
                <button
                    onClick={handleSend}
                    disabled={loading || !input.trim()}
                    style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: 'none',
                        background: loading || !input.trim() ? 'rgba(0,0,0,0.05)' : 'var(--primary)',
                        color: loading || !input.trim() ? 'var(--text-muted)' : 'white',
                        cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'all 0.2s',
                    }}
                >
                    <Send size={14} />
                </button>
            </div>
        </div>
    )
}
