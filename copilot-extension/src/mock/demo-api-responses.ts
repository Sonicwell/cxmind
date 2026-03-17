// Demo API Mock Responses
// 从 useApi.ts 中抽离的所有 demo-mode-token 路径匹配和返回数据

type PathMatcher = (path: string, options?: RequestInit) => any | undefined

// 所有路由匹配器，按优先级排列 (先匹配的先命中)
const matchers: PathMatcher[] = [
    // ── Contacts ──
    (path) => {
        if (!path.includes('/api/contact-lookup')) return
        if (path.includes('email=') || path.includes('visitorId=') || path.includes('contactId=')) {
            return {
                name: 'Sarah Chen', phone: '', email: 'sarah.chen@startup.io',
                company: 'NovaTech Startup', location: 'Austin, TX', tier: 'premium',
                sentiment: 'negative', totalCalls: 3,
                lastContact: new Date(Date.now() - 2 * 86400000).toISOString(),
                openTickets: 2, ltv: 4200,
                tags: ['SaaS', 'Early-Adopter', 'Churn-Risk'],
                notes: 'Trialing enterprise plan. Complained about onboarding docs last week.',
            }
        }
        return {
            name: 'James Wilson', phone: '+1(800)555-DEMO', email: 'j.wilson@acme.io',
            company: 'Acme Corp', location: 'Los Angeles, CA', tier: 'vip',
            sentiment: 'neutral', totalCalls: 7,
            lastContact: new Date(Date.now() - 3 * 86400000).toISOString(),
            openTickets: 1, ltv: 18500,
            tags: ['Enterprise', 'Retention-Risk'],
            notes: 'Key account — recurring billing issue since Q4 migration. Handle with care.',
        }
    },

    // ── KB Search ──
    (path) => {
        if (!path.includes('/api/knowledge/search')) return
        return {
            results: [
                { id: 'kb-1', title: 'Refund Policy v3.2', content: 'Customers can request a full refund within 30 days of purchase for damaged, defective, or incorrect items. Refunds are processed to the original payment method within 3-5 business days. For orders over $200, supervisor approval is required.', score: 0.92, category: 'policy' },
                { id: 'kb-2', title: 'Shipping & Delivery FAQ', content: 'Standard delivery takes 5-7 business days. Expedited shipping (2-3 days) is available for an additional $9.99. Free expedited shipping may be offered as a retention incentive for VIP customers at agent discretion.', score: 0.78, category: 'faq' },
            ]
        }
    },

    // ── Actions ──
    (path) => { if (path.includes('/api/platform/actions/active')) return [] },

    // ── Agent Stats ──
    (path) => {
        if (!path.includes('/api/agent-stats')) return
        return {
            callCount: 12, avgDuration: 245, avgCSAT: 4.8, compliance: 95,
            chatsResolved: 5, totalCalls: 12,
            statusDurations: { "available": 3600, "busy": 1200 },
            yesterday: { callCount: 10, avgDuration: 260, quickResolves: 3 },
            teamAvg: { avgCalls: 14, avgDuration: 220 }
        }
    },

    // ── Queue Count ──
    (path) => { if (path.includes('/api/conversations/queue-count')) return { data: { queued: 0 } } },

    // ── Inbox conversations ──
    (path) => {
        if (!path.includes('/api/conversations/inbox')) return
        return {
            data: [
                { _id: "demo-webchat-01", status: "assigned", channel: "webchat", messageCount: 1, unreadCount: 1, createdAt: new Date().toISOString(), metadata: { visitorName: "Angry VIP Customer", visitorEmail: "sarah.chen@startup.io", visitorId: "demo-visitor-001" } }
            ]
        }
    },

    // ── Conversation details (webchat / whatsapp / email) ──
    (path) => {
        if (path.includes('/api/conversations/demo-webchat-01') && !path.includes('reply') && !path.includes('accept')) {
            return {
                data: {
                    conversation: { _id: "demo-webchat-01", status: "assigned", channel: "webchat", metadata: { visitorName: "Angry VIP Customer", visitorEmail: "sarah.chen@startup.io", visitorId: "demo-visitor-001" }, messageCount: 1 },
                    messages: [
                        { message_id: "msg-demo-init", sender_name: "VIP Customer", sender_role: "visitor", content_text: "I need to talk to your manager! This is ridiculous, I am going to cancel my subscription right now.", created_at: new Date().toISOString(), sequence: 1 }
                    ]
                }
            }
        }
    },
    (path) => {
        if (path.includes('/api/conversations/demo-whatsapp-01') && !path.includes('reply') && !path.includes('accept')) {
            return {
                data: {
                    conversation: { _id: "demo-whatsapp-01", status: "assigned", channel: "whatsapp", metadata: { visitorName: "Maria Rodriguez", visitorEmail: "maria.rodriguez@gmail.com", visitorId: "demo-visitor-002" }, messageCount: 1 },
                    messages: [
                        { message_id: "msg-wa-init", sender_name: "Maria Rodriguez", sender_role: "visitor", content_text: "Hi, I placed order #TRK-5582 three days ago and tracking still says 'Label Created'. Can you tell me when it will actually ship? I need it by Friday.", created_at: new Date().toISOString(), sequence: 1 }
                    ]
                }
            }
        }
    },
    (path) => {
        if (path.includes('/api/conversations/demo-email-01') && !path.includes('reply') && !path.includes('accept')) {
            return {
                data: {
                    conversation: { _id: "demo-email-01", status: "assigned", channel: "email", metadata: { visitorName: "James Thompson", visitorEmail: "j.thompson@enterprise.co", visitorId: "demo-visitor-003" }, messageCount: 1 },
                    messages: [
                        { message_id: "msg-email-init", sender_name: "James Thompson", sender_role: "visitor", content_text: "Hello,\n\nI noticed that my February invoice (INV-2026-0214) has a duplicate charge of $299 for the same service. This is the second time this has happened. Please process a refund ASAP.\n\nRegards,\nJames Thompson\nEnterprise Solutions Inc.", created_at: new Date().toISOString(), sequence: 1 }
                    ]
                }
            }
        }
    },

    // ── SOP Blueprints ──
    (path) => {
        if (!path.includes('/api/sops/demo-sop-refund')) return
        return {
            data: {
                _id: 'demo-sop-refund', name: 'Refund Handling SOP',
                description: 'Standard refund processing workflow',
                category: 'Customer Service', status: 'PUBLISHED', startNodeId: 'n1',
                nodes: [
                    { id: 'n1', type: 'custom', position: { x: 0, y: 0 }, data: { type: 'VOICE_PROMPT', label: 'Verify Identity', description: 'Greet the customer and verify their identity. Ask for their name, account number, or order ID to locate their record.' } },
                    { id: 'n2', type: 'custom', position: { x: 0, y: 120 }, data: { type: 'VOICE_PROMPT', label: 'Acknowledge & Empathize', description: 'I completely understand your frustration, and I sincerely apologize for the inconvenience. Let me look into this right away and get it resolved for you.' } },
                    { id: 'n3', type: 'custom', position: { x: 0, y: 240 }, data: { type: 'API_CALL', label: 'Lookup Order', description: 'Pull up order details and verify the refund eligibility in CRM system.', apiEndpoint: '/api/orders/{orderId}' } },
                    { id: 'n4', type: 'custom', position: { x: 0, y: 360 }, data: { type: 'CONDITION', label: 'Refund Eligible?', description: 'Check if the order is within refund policy window (30 days) and item condition meets criteria.', conditionType: 'INTENT', conditionValue: 'refund_eligible' } },
                    { id: 'n5a', type: 'custom', position: { x: -120, y: 480 }, data: { type: 'TEMPLATE_SUGGESTION', label: 'Process Refund', description: 'Initiate the refund of $129.99 to the original payment method. Processing time: 3-5 business days.', templateId: 'tpl-refund-confirm', templateName: 'Refund Confirmation Email' } },
                    { id: 'n5b', type: 'custom', position: { x: 120, y: 480 }, data: { type: 'HUMAN_HANDOFF', label: 'Escalate to Supervisor', description: 'Order is outside refund window or exception required. Transfer to supervisor for manual approval.' } },
                    { id: 'n6', type: 'custom', position: { x: 0, y: 600 }, data: { type: 'VOICE_PROMPT', label: 'Confirm & Close', description: 'Your refund has been processed. You should see it reflected in your account within 3-5 business days. Is there anything else I can help you with today?' } },
                ],
                edges: [
                    { id: 'e1', source: 'n1', target: 'n2', data: { label: 'Identity Verified' } },
                    { id: 'e2', source: 'n2', target: 'n3', data: { label: 'Continue' } },
                    { id: 'e3', source: 'n3', target: 'n4', data: { label: 'Order Found' } },
                    { id: 'e4a', source: 'n4', target: 'n5a', data: { label: 'Yes — Eligible', conditionType: 'INTENT', conditionValue: 'Eligible' } },
                    { id: 'e4b', source: 'n4', target: 'n5b', data: { label: 'No — Escalate', conditionType: 'INTENT', conditionValue: 'Not Eligible' } },
                    { id: 'e5', source: 'n5a', target: 'n6', data: { label: 'Refund Processed' } },
                ],
            }
        }
    },
    (path) => {
        if (path.includes('/api/sops') && !path.includes('/api/sops/')) {
            return {
                data: [{
                    _id: 'demo-sop-refund', name: 'Refund Handling SOP',
                    description: 'Standard refund processing workflow for customer complaints',
                    category: 'Customer Service', status: 'PUBLISHED', nodes: [], edges: [],
                }]
            }
        }
    },

    // ── Activity History ──
    (path) => {
        if (!path.includes('/api/agent/activity-history')) return
        const now = new Date()
        const todayBase = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const ts = (dayOffset: number, h: number, m: number) => {
            const d = new Date(todayBase.getTime() - dayOffset * 86400000)
            d.setHours(h, m, 0, 0)
            return d.toISOString()
        }
        const demoItems = [
            { type: 'call', id: 'demo-call-001', startTime: ts(0, 10, 5), endTime: ts(0, 10, 9), displayName: 'sip:8001@pbx.local', channel: 'voice', duration: 245, direction: 'inbound', status: 'answered', outcome: 'success', messageCount: 0, summaryPreview: 'Customer requested full refund for damaged order #892-ALPHA. Agent verified identity and processed $129.99 refund.' },
            { type: 'chat', id: 'demo-chat-001', startTime: ts(0, 14, 22), endTime: ts(0, 14, 38), displayName: 'VIP Customer', channel: 'webchat', duration: 0, direction: '', status: 'resolved', outcome: 'resolved', messageCount: 8, summaryPreview: 'VIP customer threatened cancellation. Agent issued $50 retention voucher. Sentiment: Angry → Satisfied.' },
            { type: 'call', id: 'demo-call-002', startTime: ts(1, 9, 15), endTime: ts(1, 9, 22), displayName: 'sip:9201@pbx.local', channel: 'voice', duration: 420, direction: 'outbound', status: 'answered', outcome: 'follow_up', messageCount: 0, summaryPreview: 'Follow-up call regarding shipping delay. Escalated to tier-2 logistics team. Callback scheduled for Monday.' },
            { type: 'call', id: 'demo-call-003', startTime: ts(1, 11, 45), endTime: ts(1, 11, 45), displayName: 'sip:7733@pbx.local', channel: 'voice', duration: 0, direction: 'inbound', status: 'missed', outcome: '', messageCount: 0, summaryPreview: '' },
            { type: 'chat', id: 'demo-chat-002', startTime: ts(1, 15, 10), endTime: ts(1, 15, 45), displayName: 'Tech Support Request', channel: 'webchat', duration: 0, direction: '', status: 'resolved', outcome: 'success', messageCount: 12, summaryPreview: 'Customer needed help resetting 2FA. Agent guided through steps. Issue resolved in first contact.' },
            { type: 'call', id: 'demo-call-004', startTime: ts(3, 16, 30), endTime: ts(3, 16, 39), displayName: 'sip:6612@pbx.local', channel: 'voice', duration: 553, direction: 'inbound', status: 'answered', outcome: 'success', messageCount: 0, summaryPreview: 'Billing dispute for Jan invoice. Waived late fee $25 after reviewing account history. Customer satisfied.' },
        ]
        const params = new URLSearchParams(path.split('?')[1] || '')
        const typeFilter = params.get('type') || 'all'
        const filtered = typeFilter === 'all' ? demoItems : demoItems.filter((i: any) => i.type === typeFilter)
        return { data: filtered, stats: { totalCalls: 4, totalChats: 2, missedToday: 0 }, total: filtered.length }
    },

    // ── Call Detail ──
    ...buildCallDetailMatchers(),

    // ── Chat Detail (History) ──
    ...buildChatDetailMatchers(),

    // ── WFM ──
    (path) => { if (path.includes('/api/agent-wfm/my-shifts')) return { shifts: [{ startTime: "09:00", endTime: "18:00" }] } },
]

// ── Call detail helpers ──
function buildCallDetailMatchers(): PathMatcher[] {
    return [
        (path) => {
            if (!path.includes('/api/agent/calls/demo-call-001')) return
            const base = new Date(); base.setHours(10, 5, 0, 0)
            const t = (s: number) => new Date(base.getTime() + s * 1000).toISOString()
            return {
                callId: 'demo-call-001', startTime: t(0), endTime: t(245),
                caller: 'sip:8001@pbx.local', callee: 'sip:1001@pbx.local',
                status: 'answered', duration: 245, direction: 'inbound',
                summary: 'Customer called frustrated about a damaged order #892-ALPHA. Agent verified identity via zip code and processed a full refund of $129.99. No escalation needed.',
                outcome: { call_id: 'demo-call-001', outcome: 'success', source: 'ai', created_at: t(260) },
                quality: { mos: 4.3, jitter: 8.2, packetLoss: 0.12 },
                transcriptions: [
                    { timestamp: t(5), speaker: 'sip:8001@pbx.local', text: "Hi, I'm calling because my recent order arrived completely damaged, I'm really frustrated.", confidence: 0.97 },
                    { timestamp: t(15), speaker: 'sip:1001@pbx.local', text: "I'm so sorry to hear that. I can definitely help you get a replacement or a full refund.", confidence: 0.98 },
                    { timestamp: t(28), speaker: 'sip:8001@pbx.local', text: "I just want a refund. The order number is #892-ALPHA.", confidence: 0.96 },
                    { timestamp: t(40), speaker: 'sip:1001@pbx.local', text: "Got it. Let me verify your account. Can you confirm your billing zip code?", confidence: 0.99 },
                    { timestamp: t(55), speaker: 'sip:8001@pbx.local', text: "Yeah, it's 90210.", confidence: 0.98 },
                    { timestamp: t(70), speaker: 'sip:1001@pbx.local', text: "Thank you. I've processed the full refund of $129.99. It will appear in 3-5 business days.", confidence: 0.99 },
                    { timestamp: t(90), speaker: 'sip:8001@pbx.local', text: "Alright, thank you. That fixes it.", confidence: 0.97 },
                ],
                agentActions: [
                    { timestamp: t(10), type: 'crm_lookup', label: 'CRM Lookup', detail: 'Order #892-ALPHA — $129.99, Status: Damaged in Transit' },
                    { timestamp: t(62), type: 'note', label: 'Identity Verified', detail: 'Zip code 90210 matched billing address' },
                    { timestamp: t(75), type: 'refund', label: 'Refund Processed', detail: '$129.99 → Original card ending 4821 (3-5 business days)' },
                    { timestamp: t(240), type: 'tag', label: 'Call Tagged', detail: 'Outcome: Success · Category: Refund' },
                ]
            }
        },
        (path) => {
            if (!path.includes('/api/agent/calls/demo-call-002')) return
            const base = new Date(); base.setDate(base.getDate() - 1); base.setHours(9, 15, 0, 0)
            const t = (s: number) => new Date(base.getTime() + s * 1000).toISOString()
            return {
                callId: 'demo-call-002', startTime: t(0), endTime: t(420),
                caller: 'sip:1001@pbx.local', callee: 'sip:9201@pbx.local',
                status: 'answered', duration: 420, direction: 'outbound',
                summary: 'Proactive follow-up for shipping delay on order #1205-BETA. Customer accepted explanation. Logistics callback scheduled for Monday.',
                outcome: { call_id: 'demo-call-002', outcome: 'follow_up', source: 'manual', created_at: t(430) },
                quality: { mos: 4.1, jitter: 12.4, packetLoss: 0.08 },
                transcriptions: [
                    { timestamp: t(5), speaker: 'sip:1001@pbx.local', text: "Hi, I'm calling to follow up on your order #1205-BETA. There's been a weather disruption at the Memphis hub.", confidence: 0.98 },
                    { timestamp: t(22), speaker: 'sip:9201@pbx.local', text: "Yes, I've been waiting 3 days already, this is unacceptable.", confidence: 0.95 },
                    { timestamp: t(38), speaker: 'sip:1001@pbx.local', text: "I completely understand. Your package is now en route and expected Monday.", confidence: 0.97 },
                    { timestamp: t(60), speaker: 'sip:9201@pbx.local', text: "Fine, but if it doesn't arrive Monday I'll cancel the order.", confidence: 0.96 },
                    { timestamp: t(75), speaker: 'sip:1001@pbx.local', text: "Absolutely. I'll flag your account and our logistics team will call you Monday if there's any issue.", confidence: 0.99 },
                ],
                agentActions: [
                    { timestamp: t(8), type: 'crm_lookup', label: 'Order Lookup', detail: 'Order #1205-BETA — Weather delay at Memphis hub' },
                    { timestamp: t(80), type: 'note', label: 'Note Added', detail: 'Promised Monday delivery; schedule logistics callback if delayed' },
                    { timestamp: t(85), type: 'transfer', label: 'Escalation Flagged', detail: 'Priority ticket → Logistics Tier-2' },
                    { timestamp: t(415), type: 'tag', label: 'Call Tagged', detail: 'Outcome: Follow Up · Callback: Monday' },
                ]
            }
        },
        (path) => {
            if (!path.includes('/api/agent/calls/demo-call-003')) return
            const base = new Date(); base.setDate(base.getDate() - 1); base.setHours(11, 45, 0, 0)
            return {
                callId: 'demo-call-003', startTime: base.toISOString(), endTime: base.toISOString(),
                caller: 'sip:7733@pbx.local', callee: 'sip:1001@pbx.local',
                status: 'missed', duration: 0, direction: 'inbound',
                summary: null, outcome: null,
                quality: { mos: 0, jitter: 0, packetLoss: 0 },
                transcriptions: [], agentActions: []
            }
        },
        (path) => {
            if (!path.includes('/api/agent/calls/demo-call-004')) return
            const base = new Date(); base.setDate(base.getDate() - 3); base.setHours(16, 30, 0, 0)
            const t = (s: number) => new Date(base.getTime() + s * 1000).toISOString()
            return {
                callId: 'demo-call-004', startTime: t(0), endTime: t(553),
                caller: 'sip:6612@pbx.local', callee: 'sip:1001@pbx.local',
                status: 'answered', duration: 553, direction: 'inbound',
                summary: 'Billing dispute regarding January invoice. Customer claimed late fee was incorrect. Agent reviewed 6-month history and waived $25 as a goodwill gesture.',
                outcome: { call_id: 'demo-call-004', outcome: 'success', source: 'manual', created_at: t(560) },
                quality: { mos: 4.5, jitter: 6.1, packetLoss: 0.04 },
                transcriptions: [
                    { timestamp: t(5), speaker: 'sip:6612@pbx.local', text: "I got a late fee on my January invoice but I paid on time. This is wrong.", confidence: 0.96 },
                    { timestamp: t(18), speaker: 'sip:1001@pbx.local', text: "Let me pull up your account and check the payment records.", confidence: 0.99 },
                    { timestamp: t(55), speaker: 'sip:1001@pbx.local', text: "I can see the payment initiated on the 30th cleared on the 1st due to bank processing. I'll waive the late fee as a one-time gesture.", confidence: 0.98 },
                    { timestamp: t(75), speaker: 'sip:6612@pbx.local', text: "Thank you, I appreciate that. It really wasn't my fault.", confidence: 0.97 },
                    { timestamp: t(85), speaker: 'sip:1001@pbx.local', text: "Agreed. I've added a note so this doesn't happen again. Anything else I can help with?", confidence: 0.99 },
                ],
                agentActions: [
                    { timestamp: t(20), type: 'crm_lookup', label: 'Billing Review', detail: '6-month payment history checked — no prior late fees' },
                    { timestamp: t(57), type: 'refund', label: 'Late Fee Waived', detail: '$25.00 removed — Goodwill gesture applied' },
                    { timestamp: t(90), type: 'note', label: 'Account Note Added', detail: 'Flag: Bank processing delay — do not auto-charge late fee again' },
                    { timestamp: t(548), type: 'tag', label: 'Call Tagged', detail: 'Outcome: Success · Category: Billing Dispute' },
                ]
            }
        },
    ]
}

// ── Chat detail helpers ──
function buildChatDetailMatchers(): PathMatcher[] {
    return [
        (path) => {
            if (!path.includes('/api/conversations/demo-chat-001') || path.includes('reply') || path.includes('accept')) return
            const base = new Date(); base.setHours(14, 22, 0, 0)
            const t = (m: number) => new Date(base.getTime() + m * 60000).toISOString()
            return {
                data: {
                    conversation: { _id: 'demo-chat-001', status: 'resolved', channel: 'webchat', messageCount: 8, resolvedAt: t(16), metadata: { visitorName: 'VIP Customer' } },
                    messages: [
                        { message_id: 'm1', sender_name: 'VIP Customer', sender_role: 'visitor', content_text: "I need to talk to your manager! This is ridiculous, I'm going to cancel my subscription right now.", created_at: t(0) },
                        { message_id: 'm2', sender_name: 'Demo Agent', sender_role: 'agent', content_text: "I completely understand your frustration, and I sincerely apologize. Let me look into this right away.", created_at: t(1) },
                        { message_id: 'm3', sender_name: 'VIP Customer', sender_role: 'visitor', content_text: "Fine, but I expect this fixed immediately. I've been a loyal customer for 3 years.", created_at: t(3) },
                        { message_id: 'm4', sender_name: 'Supervisor Steve', sender_role: 'agent', content_text: "[Internal] I see the toxic alert. Don't argue — approve the $50 voucher draft to de-escalate.", created_at: t(5) },
                        { message_id: 'm5', sender_name: 'Demo Agent', sender_role: 'agent', content_text: "Great news! I've issued a $50 voucher (Code: VIP-RETAIN-7X92, valid until April 2026).", created_at: t(8) },
                        { message_id: 'm6', sender_name: 'VIP Customer', sender_role: 'visitor', content_text: "OK... I appreciate the voucher. I'll stay for now, but please make sure this doesn't happen again.", created_at: t(10) },
                        { message_id: 'm7', sender_name: 'Demo Agent', sender_role: 'agent', content_text: "Absolutely. I've flagged this with our team — you'll have priority support going forward.", created_at: t(12) },
                        { message_id: 'm8', sender_name: 'VIP Customer', sender_role: 'visitor', content_text: "Thank you. I'll keep the subscription going for now.", created_at: t(14) },
                    ],
                    agentActions: [
                        { timestamp: t(0.5), type: 'accept', label: 'Conversation Accepted', detail: 'Assigned from queue — VIP tier customer' },
                        { timestamp: t(2), type: 'crm_lookup', label: 'CRM Lookup', detail: 'VIP Subscription · LTV $4,500 · Health: Critical · 3 recent tickets' },
                        { timestamp: t(7), type: 'voucher', label: '$50 Retention Voucher Issued', detail: 'Code: VIP-RETAIN-7X92 · Expires: 2026-04-01' },
                        { timestamp: t(15.5), type: 'resolve', label: 'Conversation Resolved', detail: 'Resolution: Retained · Sentiment: Angry → Satisfied' },
                    ]
                }
            }
        },
        (path) => {
            if (!path.includes('/api/conversations/demo-chat-002') || path.includes('reply') || path.includes('accept')) return
            const base = new Date(); base.setDate(base.getDate() - 1); base.setHours(15, 10, 0, 0)
            const t = (m: number) => new Date(base.getTime() + m * 60000).toISOString()
            return {
                data: {
                    conversation: { _id: 'demo-chat-002', status: 'resolved', channel: 'webchat', messageCount: 12, resolvedAt: t(35), metadata: { visitorName: 'Tech Support Request' } },
                    messages: [
                        { message_id: 'c1', sender_name: 'Alex M.', sender_role: 'visitor', content_text: "Hi, I can't log in. It's asking for a 2FA code but I lost my phone.", created_at: t(0) },
                        { message_id: 'c2', sender_name: 'Demo Agent', sender_role: 'agent', content_text: "Hi Alex! No worries, I can help you regain access. First I'll need to verify your identity.", created_at: t(1) },
                        { message_id: 'c3', sender_name: 'Alex M.', sender_role: 'visitor', content_text: "Sure, what do you need?", created_at: t(2) },
                        { message_id: 'c4', sender_name: 'Demo Agent', sender_role: 'agent', content_text: "Could you confirm your registered email and the last 4 digits of your billing card?", created_at: t(3) },
                        { message_id: 'c5', sender_name: 'Alex M.', sender_role: 'visitor', content_text: "Email is alex@example.com and card ends in 5512.", created_at: t(5) },
                        { message_id: 'c6', sender_name: 'Demo Agent', sender_role: 'agent', content_text: "Identity confirmed! I've sent a backup 2FA code to your registered email. Please check and enter it.", created_at: t(10) },
                        { message_id: 'c7', sender_name: 'Alex M.', sender_role: 'visitor', content_text: "Got it! Entered the code and I'm in. Thank you!", created_at: t(18) },
                        { message_id: 'c8', sender_name: 'Demo Agent', sender_role: 'agent', content_text: "Great! I'd also recommend setting up backup 2FA methods. Want me to guide you through it?", created_at: t(19) },
                        { message_id: 'c9', sender_name: 'Alex M.', sender_role: 'visitor', content_text: "Yes please!", created_at: t(20) },
                        { message_id: 'c10', sender_name: 'Demo Agent', sender_role: 'agent', content_text: "Go to Settings → Security → Backup methods. Add a backup email or recovery codes there.", created_at: t(22) },
                        { message_id: 'c11', sender_name: 'Alex M.', sender_role: 'visitor', content_text: "All done. This is really helpful, thanks!", created_at: t(30) },
                        { message_id: 'c12', sender_name: 'Demo Agent', sender_role: 'agent', content_text: "You're welcome! Is there anything else I can help you with today?", created_at: t(31) },
                    ],
                    agentActions: [
                        { timestamp: t(0.5), type: 'accept', label: 'Conversation Accepted', detail: 'Category: Account Access · Priority: Normal' },
                        { timestamp: t(8), type: 'crm_lookup', label: 'Identity Verified', detail: 'Email + billing card matched — account: alex@example.com' },
                        { timestamp: t(9), type: 'note', label: 'Backup 2FA Sent', detail: 'Temporary bypass code emailed to registered address' },
                        { timestamp: t(34), type: 'resolve', label: 'Conversation Resolved', detail: 'FCR: Yes · Resolution: 2FA access restored' },
                    ]
                }
            }
        },
    ]
}

/**
 * Demo mock 路由分发器 — 匹配 path 返回 mock 数据
 * 未匹配时返回 undefined
 */
export function resolveDemoMock(path: string, options?: RequestInit): any | undefined {
    for (const matcher of matchers) {
        const result = matcher(path, options)
        if (result !== undefined) return result
    }
    // 所有 POST 静默返回空对象
    if (options?.method === 'POST') return {}
    // 默认兜底
    return { data: [] }
}
