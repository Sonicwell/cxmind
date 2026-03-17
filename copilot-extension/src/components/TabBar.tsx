import { Phone, MessageSquare, Home, User, Wrench } from "lucide-react"
import { useModules } from "~/hooks/useModules"
import { useTranslation } from "react-i18next"

export interface ConversationSlot {
  id: string
  status: 'assigned' | 'accepted'
  unread: number
}

interface TabBarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  chatBadge?: 'none' | 'assigned' | 'unread' | 'active'
  queueCount?: number
  approvalCount?: number
  groupChatCount?: number
  activeCallIndicator?: boolean
  hasActiveCall?: boolean
  callStatus?: string
  conversationSlots?: ConversationSlot[]
  chatShaking?: boolean
  onToolkitToggle?: () => void
  toolkitBadge?: number
  toolkitExpanded?: boolean
}

const TABS: Array<{ id: string, icon: any, labelKey: string, requiredModule?: string }> = [
  { id: 'home', icon: Home, labelKey: 'tabs.home' },
  { id: 'current', icon: Phone, labelKey: 'tabs.call' },
  { id: 'chat', icon: MessageSquare, labelKey: 'tabs.chat', requiredModule: 'inbox' },
  { id: 'toolkit', icon: Wrench, labelKey: 'tabs.toolkit' },
  { id: 'me', icon: User, labelKey: 'tabs.me' },
]

// 分段色条颜色映射
const SLOT_COLORS = {
  assigned: '#ef4444',      // 红: 等待接受
  accepted_read: '#8b5cf6', // 紫: 已接受无未读
  accepted_unread: '#f59e0b', // 琥珀: 已接受有未读
} as const

function getSlotColor(slot: ConversationSlot): string {
  if (slot.status === 'assigned') return SLOT_COLORS.assigned
  return slot.unread > 0 ? SLOT_COLORS.accepted_unread : SLOT_COLORS.accepted_read
}

export function TabBar({ activeTab, onTabChange, chatBadge, queueCount, approvalCount, groupChatCount, activeCallIndicator, hasActiveCall, callStatus, conversationSlots = [], chatShaking = false, onToolkitToggle, toolkitBadge, toolkitExpanded }: TabBarProps) {
  const { isModuleEnabled } = useModules()
  const { t } = useTranslation()
  const visibleTabs = TABS.filter(tab => !tab.requiredModule || isModuleEnabled(tab.requiredModule))

  return (
    <div className="tab-bar-v2">
      {visibleTabs.map(({ id, icon: Icon, labelKey }) => {
        const isActive = activeTab === id
        const showActiveCall = id === 'current' && activeCallIndicator
        const showApprovalBadge = id === 'me' && (approvalCount ?? 0) > 0

        // Chat Tab: 使用分段条替代旧 badge
        const isChatTab = id === 'chat'
        const hasSlots = isChatTab && conversationSlots.length > 0
        // 旧 badge 仅在无 slots 时 fallback (group chat badge)
        const showGroupBadge = isChatTab && !hasSlots && (groupChatCount ?? 0) > 0

        // Chat icon 晃动: 仅由外部 chatShaking 控制
        const shouldShake = (isChatTab && chatShaking) || showActiveCall

        const handleClick = () => {
          if (id === 'toolkit') {
            onToolkitToggle?.()
            return
          }
          if (id === 'current' && !hasActiveCall) {
            onTabChange('me:history')
          } else {
            onTabChange(id)
          }
        }

        // Toolkit badge & expanded state
        const showToolkitBadge = id === 'toolkit' && (toolkitBadge ?? 0) > 0
        const isToolkitExpanded = id === 'toolkit' && toolkitExpanded

        return (
          <button
            key={id}
            className={`tab-v2-item ${isActive ? 'active' : ''} ${isToolkitExpanded ? 'toolkit-expanded' : ''}`}
            onClick={handleClick}
            title={id === 'current' && !hasActiveCall ? t('tabs.viewHistory') : t(labelKey)}
          >
            <div className={`tab-v2-icon-wrap ${shouldShake ? 'icon-alert-shake' : ''}`}>
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />

              {/* Active Call dot */}
              {showActiveCall && (
                <span className="tab-v2-badge-dot" style={{ background: callStatus === 'ringing' ? '#f59e0b' : '#22c55e' }} />
              )}

              {/* Approval count for Me tab */}
              {showApprovalBadge && (
                <span className="tab-v2-badge-num">{approvalCount}</span>
              )}

              {/* Group chat unread badge (fallback when no slots) */}
              {showGroupBadge && (
                <span className="tab-v2-badge-num" style={{ background: 'var(--primary)' }}>{groupChatCount}</span>
              )}

              {/* Toolkit pending badge */}
              {showToolkitBadge && (
                <span className="tab-v2-badge-num" style={{ background: 'var(--primary)' }}>{toolkitBadge}</span>
              )}
            </div>

            {/* Segmented Status Bar 替代原 indicator */}
            {isChatTab && hasSlots ? (
              <div className="tab-v2-seg-bar">
                {conversationSlots.map((slot) => (
                  <div
                    key={slot.id}
                    className="tab-v2-seg"
                    style={{ background: getSlotColor(slot) }}
                  />
                ))}
              </div>
            ) : (
              <div className={`tab-v2-indicator ${isActive ? 'active' : ''}`} />
            )}
          </button>
        )
      })}

      <style>{`
        .tab-bar-v2 {
          display: flex;
          border-bottom: 1px solid var(--glass-border);
          background: var(--glass-bg);
          padding: 0;
        }
        .tab-v2-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 8px 0 4px;
          cursor: pointer;
          background: none;
          border: none;
          color: var(--text-muted);
          transition: color var(--transition-fast);
          position: relative;
          font-family: inherit;
        }
        .tab-v2-item:hover {
          color: var(--text-primary);
        }
        .tab-v2-item.active {
          color: var(--primary);
        }
        .tab-v2-icon-wrap {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .tab-v2-badge-dot {
          position: absolute;
          top: -3px;
          right: -5px;
          width: 9px;
          height: 9px;
          border-radius: 50%;
          border: 1.5px solid white;
        }
        .tab-v2-badge-num {
          position: absolute;
          top: -6px;
          right: -10px;
          min-width: 16px;
          height: 16px;
          border-radius: 8px;
          background: var(--danger);
          color: white;
          font-size: 10px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
          border: 1.5px solid white;
        }
        @keyframes alert-shake {
          0% { transform: rotate(0deg); }
          15% { transform: rotate(12deg); }
          30% { transform: rotate(-12deg); }
          45% { transform: rotate(6deg); }
          60% { transform: rotate(-6deg); }
          75% { transform: rotate(3deg); }
          100% { transform: rotate(0deg); }
        }
        .icon-alert-shake {
          animation: alert-shake 0.6s ease-in-out;
          transform-origin: center;
        }

        /* Segmented Status Bar */
        .tab-v2-seg-bar {
          display: flex;
          gap: 1.5px;
          margin-top: 4px;
          width: 60%;
          min-width: 20px;
          max-width: 60px;
          height: 3px;
        }
        .tab-v2-seg {
          flex: 1;
          border-radius: 1.5px;
          transition: background 0.3s ease;
        }

        /* Original indicator (other tabs) */
        .tab-v2-indicator {
          width: 16px;
          height: 2px;
          border-radius: 1px;
          margin-top: 4px;
          background: transparent;
          transition: all var(--transition-fast);
        }
        .tab-v2-indicator.active {
          background: var(--primary);
          width: 20px;
        }

        /* Toolkit 展开时高亮 */
        .tab-v2-item.toolkit-expanded {
          color: var(--primary);
        }
        .tab-v2-item.toolkit-expanded .tab-v2-icon-wrap {
          background: rgba(108, 75, 245, 0.12);
          border-radius: 8px;
          padding: 3px;
          transform: rotate(-15deg);
          transition: all 0.25s ease;
        }
      `}</style>
    </div>
  )
}
