import { LogOut, Pin, BrainCircuit } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useState, useEffect, useRef } from "react"
import { useAuth } from "~/hooks/useAuth"
import { useWebSocket } from "~/hooks/useWebSocket"
import { useAgentStatus } from "~/hooks/useAgentStatus"
import { useSettings } from "~/hooks/useSettings"
import { useMessageBus } from "~/hooks/useMessageBus"
import { useWebLLM } from "~/hooks/useWebLLM"
import { DEMO_ENABLED } from "~/utils/demo-flag"

export function Header() {
  const { t } = useTranslation()
  const { agentInfo, logout } = useAuth()
  const { connected, connecting } = useWebSocket()
  const { dropdownStatuses, displayStatus, bizStatus, updateStatus, getStatusColor, isLoading: statusLoading, callStatus, statuses } = useAgentStatus()
  const { settings } = useSettings()
  const { isReady: llmReady, isLoading: llmLoading, settings: llmSettings } = useWebLLM()
  const [apiUrl, setApiUrl] = useState("")
  const [imgError, setImgError] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [pipActive, setPipActive] = useState(false)
  const statusRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chrome.storage.sync.get(["apiUrl"], (res) => {
      if (res.apiUrl) setApiUrl(res.apiUrl)
    })
  }, [])

  useEffect(() => {
    setImgError(false)
  }, [agentInfo?.avatar])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // PiP 状态追踪
  useMessageBus(['pip:activated', 'pip:deactivated'], (msg) => {
    setPipActive(msg.type === 'pip:activated')
  })

  const openPiP = () => {
    chrome.runtime.sendMessage({ type: 'pip:openWindow' }).catch(() => { })
  }

  const statusColor = getStatusColor(displayStatus)
  const connClass = connected ? "connected" : connecting ? "connecting" : "disconnected"
  // 通话中显示 displayStatus 对应的 label (如 "On Call"), 空闲时显示 bizStatus label
  const currentStatusLabel = statuses.find((s: any) => s.id === displayStatus)?.label
    || dropdownStatuses.find((s: any) => s.id === bizStatus)?.label
    || t('agentStatus.available')

  const avatarUrl = agentInfo?.avatar
    ? agentInfo.avatar.startsWith('http') ? agentInfo.avatar : `${apiUrl}${agentInfo.avatar}`
    : null
  const showImg = avatarUrl && !imgError

  return (
    <header className="side-panel-header compact-header">
      <div className="compact-header-inner">
        {/* Left: Avatar + Name + Ext */}
        <div className="compact-header-left">
          <div className="compact-avatar-wrap">
            <div className="compact-avatar">
              {showImg ? (
                <img
                  src={avatarUrl}
                  alt="avatar"
                  style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                  onError={() => setImgError(true)}
                />
              ) : (
                agentInfo?.displayName?.charAt(0)?.toUpperCase() || "A"
              )}
            </div>
            <div className={`compact-conn-dot ${(DEMO_ENABLED && agentInfo?.isDemo) ? 'connected' : connClass}`} title={connected || (DEMO_ENABLED && agentInfo?.isDemo) ? t('header.connected') : connecting ? t('header.connectingStatus') : t('header.disconnected')} />
          </div>
          {(DEMO_ENABLED && agentInfo?.isDemo) ? (
            <span style={{
              background: 'linear-gradient(135deg, #a855f7, #6C4BF5)',
              color: 'white',
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '12px',
              letterSpacing: '0.5px',
              boxShadow: '0 2px 8px rgba(108, 75, 245, 0.3)',
              marginLeft: '4px'
            }}>{t('header.demoMode')}</span>
          ) : (
            <>
              <span className="compact-name">{agentInfo?.displayName || t('common.agent')}</span>
              {agentInfo?.sipNumber && (
                <span className="compact-ext">· {agentInfo.sipNumber}</span>
              )}
            </>
          )}
        </div>

        {/* Right: Status dropdown + Logout */}
        <div className="compact-header-right">
          {!statusLoading && dropdownStatuses.length > 0 && (
            <div className="compact-status-wrap" ref={statusRef}>
              <button
                className="compact-status-trigger"
                onClick={() => setStatusOpen(!statusOpen)}
                title={t('header.setAvailability')}
              >
                <span
                  className="compact-status-dot-inline"
                  style={{
                    backgroundColor: statusColor,
                    boxShadow: `0 0 4px ${statusColor}80`,
                  }}
                />
                <span className="compact-status-label">{currentStatusLabel}</span>
                <svg className={`compact-status-chevron ${statusOpen ? 'open' : ''}`} width="8" height="5" viewBox="0 0 8 5" fill="none">
                  <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {statusOpen && (
                <div className="compact-status-menu">
                  {dropdownStatuses.map((s: any) => {
                    const c = getStatusColor(s.id)
                    const isActive = s.id === bizStatus
                    return (
                      <div
                        key={s.id}
                        className={`compact-status-item ${isActive ? 'active' : ''}`}
                        onClick={() => { updateStatus(s.id); setStatusOpen(false) }}
                      >
                        <span
                          className="compact-status-item-dot"
                          style={{
                            backgroundColor: c,
                            boxShadow: `0 0 4px ${c}60`,
                          }}
                        />
                        <span>{s.label}</span>
                        {isActive && (
                          <svg className="compact-status-check" width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2.5 6l2.5 2.5 4.5-5" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          {settings.enablePIP && (
            <button
              className={`compact-pip-btn ${pipActive ? 'active' : ''}`}
              onClick={openPiP}
              title={pipActive ? t('header.pipActive') : t('header.openPip')}
            >
              <Pin size={13} />
            </button>
          )}
          {llmSettings.enabled && (
            <div
              className={`compact-llm-indicator ${llmReady ? 'ready' : llmLoading ? 'loading' : ''}`}
              title={llmReady ? t('header.localAIActive') : llmLoading ? t('header.localAILoading') : t('header.localAILabel')}
            >
              <BrainCircuit size={13} />
            </div>
          )}
          <button className="compact-logout" onClick={logout} title={t('header.signOut')}>
            <LogOut size={13} />
          </button>
        </div>
      </div>

      <style>{`
        .compact-header {
          padding: 6px 12px !important;
          overflow: visible !important;
          position: relative;
          z-index: 10001;
        }
        .compact-header-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 28px;
        }
        .compact-header-left {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }
        .compact-avatar-wrap {
          position: relative;
          flex-shrink: 0;
        }
        .compact-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--primary), #a855f7);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.75rem;
        }
        .compact-conn-dot {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          border: 1.5px solid white;
          transition: background-color 0.3s;
        }
        .compact-conn-dot.connected { background-color: var(--success); }
        .compact-conn-dot.connecting { background-color: var(--warning); animation: pulse-dot 1.5s infinite; }
        .compact-conn-dot.disconnected { background-color: var(--danger); }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .compact-name {
          font-weight: 600;
          font-size: 0.8rem;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100px;
        }
        .compact-ext {
          font-size: 0.7rem;
          color: var(--text-muted);
          white-space: nowrap;
        }
        .compact-header-right {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .compact-status-wrap {
          position: relative;
          flex-shrink: 0;
          z-index: 10001;
        }
        /* Custom status trigger button */
        .compact-status-trigger {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px 3px 6px;
          border: 1px solid var(--glass-border, #ddd);
          border-radius: 5px;
          font-size: 10px;
          font-weight: 600;
          color: var(--text-primary, #333);
          background: var(--bg-card, #f8f8f8);
          cursor: pointer;
          min-width: 68px;
          max-width: 120px;
          transition: border-color 0.2s;
        }
        .compact-status-trigger:hover {
          border-color: var(--primary, #6C4BF5);
        }
        .compact-status-dot-inline {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
          transition: background-color 0.3s, box-shadow 0.3s;
        }
        .compact-status-label {
          flex: 1;
          text-align: left;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .compact-status-chevron {
          flex-shrink: 0;
          color: var(--text-muted, #999);
          transition: transform 0.2s;
        }
        .compact-status-chevron.open {
          transform: rotate(180deg);
        }
        /* Dropdown menu */
        .compact-status-menu {
          position: absolute;
          top: calc(100% + 4px);
          right: 0;
          min-width: 140px;
          background: #ffffff;
          border: 1px solid var(--glass-border, #e0e0e0);
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.04);
          padding: 4px;
          z-index: 10002;
          animation: statusMenuIn 0.15s ease-out;
        }
        [data-theme="dark"] .compact-status-menu {
          background: #1e1e2e;
          border-color: rgba(255,255,255,0.1);
          box-shadow: 0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05);
        }
        @keyframes statusMenuIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .compact-status-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 5px;
          font-size: 11px;
          font-weight: 500;
          color: var(--text-primary, #333);
          cursor: pointer;
          transition: background 0.15s;
        }
        .compact-status-item:hover {
          background: var(--bg-hover, rgba(108,75,245,0.06));
        }
        .compact-status-item.active {
          background: var(--bg-hover, rgba(108,75,245,0.06));
          font-weight: 600;
        }
        .compact-status-item-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .compact-status-check {
          margin-left: auto;
          flex-shrink: 0;
        }
        .compact-logout {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border-radius: 6px;
          border: 1px solid var(--glass-border);
          background: none;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.2s;
        }
        .compact-logout:hover {
          color: var(--danger);
          border-color: var(--danger);
          background: hsla(0, 75%, 55%, 0.06);
        }
        .compact-pip-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border-radius: 6px;
          border: 1px solid var(--glass-border);
          background: none;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.2s;
        }
        .compact-pip-btn:hover {
          color: var(--primary);
          border-color: var(--primary);
          background: rgba(108, 75, 245, 0.06);
        }
        .compact-pip-btn.active {
          color: white;
          background: var(--primary);
          border-color: var(--primary);
          box-shadow: 0 2px 6px rgba(108, 75, 245, 0.3);
        }
        .compact-llm-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border-radius: 6px;
          color: var(--text-muted);
          transition: all 0.3s;
        }
        .compact-llm-indicator.ready {
          color: #a855f7;
          animation: llm-pulse 2s ease-in-out infinite;
        }
        .compact-llm-indicator.loading {
          color: var(--text-muted);
          animation: llm-spin 1.5s linear infinite;
        }
        @keyframes llm-pulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; filter: drop-shadow(0 0 4px rgba(168, 85, 247, 0.5)); }
        }
        @keyframes llm-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </header>
  )
}
