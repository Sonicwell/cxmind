
import React from 'react'
import { CollapsibleWidget } from '~/components/CollapsibleWidget'
import { ComplianceList } from '~/components/ComplianceList'
import { type ChecklistItem } from '~/types'
import { Zap } from 'lucide-react'

// ─── Compound component：统一宽屏侧边栏 slot 布局 ───

interface SidebarProps {
    children: React.ReactNode
}

export function CopilotSidebar({ children }: SidebarProps) {
    return (
        <div className="chat-widgets-sidebar" style={{
            display: 'flex', flexDirection: 'column', gap: 8,
            overflowY: 'auto', position: 'relative',
        }}>
            {children}
        </div>
    )
}

// ─── Slot: Context Brief ───
function Brief({ children }: { children: React.ReactNode }) {
    return <div className="copilot-slot-brief">{children}</div>
}

// ─── Slot: CRM ───
interface CrmSlotProps {
    data: { provider?: string; contact?: any; account?: any } | null
}
function Crm({ data }: CrmSlotProps) {
    if (!data) return null
    const healthColor = (data.account?.healthScore === 'Critical' || data.account?.healthScore === 'At Risk')
        ? 'var(--danger)' : 'var(--success)'
    return (
        <CollapsibleWidget
            title={`CRM: ${data.provider || 'CRM'}`}
            icon={<span>🔍</span>}
            collapsedHint={`${data.contact?.name || ''} · ${data.account?.healthScore || ''}`}
            badge={data.account?.healthScore}
        >
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.75rem' }}>
                {data.contact?.name && <span>Name: <b>{data.contact.name}</b></span>}
                {data.account?.healthScore && <span>Health: <b style={{ color: healthColor }}>{data.account.healthScore}</b></span>}
                {data.account?.ltv && <span>LTV: <b style={{ color: 'var(--success)' }}>{data.account.ltv}</b></span>}
                {data.account?.lifetimeValue && <span>LTV: <b style={{ color: 'var(--success)' }}>{data.account.lifetimeValue}</b></span>}
                {data.account?.openTickets != null && <span>Tickets: <b>{data.account.openTickets}</b></span>}
                {data.account?.recentTickets != null && <span>Tickets: <b>{data.account.recentTickets}</b></span>}
            </div>
        </CollapsibleWidget>
    )
}

// ─── Slot: Actions ───
// 消费方自行放入 <ActionList> 或 inline <ActionDraftCard>
function Actions({ children }: { children: React.ReactNode }) {
    return <div className="copilot-slot-actions">{children}</div>
}

// ─── Slot: Suggestions ───
function Suggestions({ children }: { children: React.ReactNode }) {
    return <div className="copilot-slot-suggestions">{children}</div>
}

// ─── Slot: Template (chat only) ───
function Template({ children }: { children: React.ReactNode }) {
    return <div className="copilot-slot-template">{children}</div>
}

// ─── Slot: Summary (SummaryCard) ───
function Summary({ children }: { children: React.ReactNode }) {
    return <div className="copilot-slot-summary">{children}</div>
}

// ─── Slot: Coach Whisper ───
interface CoachSlotProps {
    from?: string
    text?: string
}
function Coach({ from, text }: CoachSlotProps) {
    if (!text) return null
    return (
        <div style={{
            padding: 8, borderRadius: 2,
            background: 'rgba(59, 130, 246, 0.06)',
            border: '1px solid rgba(59, 130, 246, 0.15)',
            fontSize: '0.72rem',
        }}>
            <div style={{ fontWeight: 600, color: '#3b82f6', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                🎧 Coach Whisper
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>From: {from || 'Supervisor'}</div>
            <div style={{ lineHeight: 1.4, fontStyle: 'italic', marginTop: 2 }}>"{text}"</div>
        </div>
    )
}

// ─── Slot: Compliance (sticky bottom) ───
interface ComplianceSlotProps {
    items: ChecklistItem[]
    completed: string[]
}
function Compliance({ items, completed }: ComplianceSlotProps) {
    if (items.length === 0) return null
    return (
        <div style={{ position: 'sticky', bottom: 0, zIndex: 2, background: 'var(--bg-card, white)' }}>
            <ComplianceList items={items} completedItems={completed} />
        </div>
    )
}

// ─── Slot: Empty state skeleton ───
function EmptyState({ label }: { label?: string }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', fontSize: '0.75rem',
            color: 'var(--text-muted, #9ca3af)', opacity: 0.7,
        }}>
            <Zap size={14} />
            <span>{label || 'Listening for signals…'}</span>
        </div>
    )
}

// ─── 挂载 compound components ───
CopilotSidebar.Brief = Brief
CopilotSidebar.Crm = Crm
CopilotSidebar.Actions = Actions
CopilotSidebar.Suggestions = Suggestions
CopilotSidebar.Template = Template
CopilotSidebar.Summary = Summary
CopilotSidebar.Coach = Coach
CopilotSidebar.Compliance = Compliance
CopilotSidebar.EmptyState = EmptyState
