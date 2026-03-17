// DemoStreamer: Client-side Mock Engine for CXMind Copilot Demo Mode

// Type definitions to mirror what the background worker expects
interface CallEvent {
    call_id: string;
    event_type: string;
    caller_uri: string;
    callee_uri: string;
}

interface TranscriptionSegment {
    text: string;
    timestamp: string;
    speaker: string;
    confidence: number;
    is_final: boolean;
    call_id: string;
}

interface Suggestion {
    suggestion: string;
    confidence: number;
    call_id: string;
}

// Comprehensive demo scenario showcasing deep capabilities
const MAX_DEMO_SCENARIO = {
    transcriptions: [
        { timeMs: 1000, speaker: "Customer", text: "Hi, I'm calling because my recent order arrived completely damaged, and I'm really frustrated." },
        { timeMs: 5000, speaker: "Agent", text: "I'm so sorry to hear that. I can definitely help you get a replacement or a full refund." },
        { timeMs: 7000, speaker: "Customer", text: "Yeah, I'm doing alright, thanks for asking." },
        { timeMs: 9000, speaker: "Customer", text: "I just want a refund. The order number is #892-ALPHA." },
        { timeMs: 13000, speaker: "Agent", text: "Got it. Let me verify your account. For security, can you confirm your billing zip code?" },
        { timeMs: 15000, speaker: "Customer", text: "Hmm, let me think about that for a second..." },
        { timeMs: 18000, speaker: "Customer", text: "Yeah, it's 90210." },
        { timeMs: 22000, speaker: "Agent", text: "Thank you. I've processed the full refund of $129.99 to your original payment method. It will appear in 3-5 days." },
        { timeMs: 25000, speaker: "Customer", text: "Alright, thank you. That fixes it." }
    ],
    // 每句客户发言后紧跟 intent 分类
    suggestions: [
        // #1 actionable
        {
            timeMs: 2500, text: "Negative Sentiment Detected: Customer is frustrated regarding a damaged order. Empathize and immediately offer a replacement or refund.",
            type: 'tip', intent: { category: 'actionable', confidence: 0.94, reasoning: 'Complaint + order issue' },
            source: { title: 'Customer Complaint Handling SOP', score: 0.91 }
        },
        // #2 chitchat
        {
            timeMs: 7500, text: "Small talk detected — no action needed",
            type: 'chitchat', intent: { category: 'chitchat', confidence: 0.89, reasoning: 'Greeting/acknowledgment pattern' }
        },
        // #3 actionable
        {
            timeMs: 9500, text: "Order #892-ALPHA detected. Based on Refund Policy v3.2, customers can request a full refund within 30 days.",
            type: 'tip', intent: { category: 'actionable', confidence: 0.97, reasoning: 'Refund request + order ID' },
            source: { title: 'Refund Policy v3.2', score: 0.95 }
        },
        // #4 unknown
        {
            timeMs: 15500, text: "Ambiguous input — monitoring",
            type: 'unknown', intent: { category: 'unknown', confidence: 0.45, reasoning: 'Ambiguous — pause filler' }
        },
        // #5 actionable
        {
            timeMs: 18500, text: "Zip code verified. You are authorized to execute refund up to $200 without supervisor approval.",
            type: 'tip', intent: { category: 'actionable', confidence: 0.71, reasoning: 'Identity verification response' },
            source: { title: 'Compliance: Refund Auth Levels', score: 0.88 }
        },
        // #6 chitchat
        {
            timeMs: 25500, text: "Closing acknowledgment — call wrapping up",
            type: 'chitchat', intent: { category: 'chitchat', confidence: 0.83, reasoning: 'Closing acknowledgment' }
        }
    ]
};

export class DemoStreamer {
    private isRunning = false;
    private currentTimerIds: any[] = [];
    private broadcastCallback: (msg: any) => void;
    private scenarios: any = MAX_DEMO_SCENARIO;

    // Receives a callback from background.ts to push events to UI
    constructor(broadcastCallback: (msg: any) => void) {
        this.broadcastCallback = broadcastCallback;
        // In this comprehensive demo, we strictly use the rich local MAX_DEMO_SCENARIO
        console.log("[DemoStreamer] 🚀 Rich local scenarios loaded successfully.");
    }

    public startCall(callId: string, caller: string, callee: string) {
        if (this.isRunning) {
            this.stopCall(this.scenarios?.lastCallId || callId);
        }
        this.isRunning = true;
        this.scenarios.lastCallId = callId;

        console.log(`[DemoStreamer] 🎬 Starting Mock Call ${callId} — ringing for 5s`);

        const RING_DURATION = 5000; // 5s 振铃

        // 1. Broadcast call_create with ringing status
        this.broadcastCallback({
            type: "call:event",
            data: {
                event_type: "call_create",
                call_id: callId,
                caller_uri: caller,
                callee_uri: callee,
                status: "ringing"
            }
        });

        // 2. 10s 后 call_answer → 状态切为 active
        const answerTimer = setTimeout(() => {
            this.broadcastCallback({
                type: "call:event",
                data: {
                    event_type: "call_answer",
                    call_id: callId,
                    caller_uri: caller,
                    callee_uri: callee
                }
            });
        }, RING_DURATION);
        this.currentTimerIds.push(answerTimer);

        // 1b. Context Brief — 模拟 AI 合成上下文（振铃结束后 2s）
        const ctxTimer = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:context_brief",
                data: {
                    severity: 'yellow',
                    actionable_opening: `Hi ${caller.replace('sip:', '').split('@')[0]}, I see you contacted us 3 days ago about a billing issue — let me pull that up for you right away.`,
                    bullets: [
                        '🔴 Open ticket #892-ALPHA: damaged order, refund pending',
                        '⚠️ VIP account — LTV $18,500, 7 previous calls',
                        '📉 Customer health score: At Risk (last 30d)',
                        '💡 Recommend: Proactive refund + follow-up email'
                    ],
                    last_health_score: 35,
                    pending_actions: [{ type: 'refund', status: 'pending', amount: '$129.99' }],
                    recent_messages: []
                }
            });
        }, 2000);
        this.currentTimerIds.push(ctxTimer);

        // 3. Schedule transcriptions (after ringing ends)
        this.scenarios.transcriptions.forEach((t: any) => {
            const timer = setTimeout(() => {
                const words = t.text.split(" ");
                let currentWordIndex = 0;
                let currentText = "";

                const interval = setInterval(() => {
                    if (currentWordIndex < words.length) {
                        currentText += (currentWordIndex > 0 ? " " : "") + words[currentWordIndex];
                        currentWordIndex++;

                        this.broadcastCallback({
                            type: "call:transcription",
                            data: {
                                text: currentText,
                                timestamp: new Date().toISOString(),
                                speaker: t.speaker,
                                confidence: 0.85 + (Math.random() * 0.1),
                                is_final: false,
                                call_id: callId
                            }
                        });
                    } else {
                        clearInterval(interval);
                        // Send final confirmation
                        this.broadcastCallback({
                            type: "call:transcription",
                            data: {
                                text: t.text,
                                timestamp: new Date().toISOString(),
                                speaker: t.speaker,
                                confidence: 0.98,
                                is_final: true,
                                call_id: callId
                            }
                        });
                    }
                }, 150); // Speed of typing (ms per word)

                this.currentTimerIds.push(interval);

            }, RING_DURATION + t.timeMs);
            this.currentTimerIds.push(timer);
        });

        // 3. Schedule suggestions (with intent/source fields)
        this.scenarios.suggestions.forEach((s: any) => {
            const timer = setTimeout(() => {
                this.broadcastCallback({
                    type: "omni:suggestion",
                    data: {
                        suggestion: s.text,
                        confidence: 0.85,
                        call_id: callId,
                        type: s.type || 'tip',
                        intent: s.intent,
                        source: s.source,
                    }
                });
            }, RING_DURATION + s.timeMs);
            this.currentTimerIds.push(timer);
        });

        // 3b. Compliance checklist (Voice) — 渐进式打勾
        const voiceCompItems = [
            { id: 'greeting', text: 'Professional Greeting', pattern: '', type: 'regex', scope: 'call' },
            { id: 'identity', text: 'Identity Verified', pattern: '', type: 'regex', scope: 'call' },
            { id: 'recording', text: 'Recording Consent', pattern: '', type: 'regex', scope: 'call' },
            { id: 'hold_time', text: 'Hold Time < 2min', pattern: '', type: 'regex', scope: 'call' },
        ];
        const voiceCheckOrder = ['greeting', 'identity', 'hold_time'];
        // 初始：空 checklist
        const compTimer = setTimeout(() => {
            this.broadcastCallback({
                type: "call:compliance",
                data: { sessionId: callId, checklistId: 'demo-voice-checklist', items: voiceCompItems, completedItems: [] }
            });
        }, 3000);
        this.currentTimerIds.push(compTimer);
        // 逐项打勾
        voiceCheckOrder.forEach((itemId, idx) => {
            const t = setTimeout(() => {
                this.broadcastCallback({
                    type: "call:compliance",
                    data: { sessionId: callId, checklistId: 'demo-voice-checklist', items: voiceCompItems, completedItems: voiceCheckOrder.slice(0, idx + 1) }
                });
            }, 5000 + idx * 5000);
            this.currentTimerIds.push(t);
        });

        // 3c. Action Draft (Voice)
        const actionTimer = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:action_draft",
                data: {
                    actionId: `action-refund-${Date.now()}`,
                    intentSlug: 'process_refund',
                    status: 'suggested',
                    draft: {
                        amount: '$129.99',
                        method: 'Original payment method',
                        order: '#892-ALPHA',
                        reason: 'Damaged order — customer verified',
                    },
                    originalDraft: {
                        amount: '$129.99',
                        method: 'Original payment method',
                        order: '#892-ALPHA',
                        reason: 'Damaged order — customer verified',
                    },
                }
            });
        }, RING_DURATION + 20000);
        this.currentTimerIds.push(actionTimer);

        // 3d. CRM Lookup (Voice)
        const crmTimer = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:crm_lookup",
                data: {
                    sessionId: callId,
                    provider: 'Salesforce',
                    contact: { name: 'Sarah Johnson', email: 'sarah@example.com', phone: '+1-555-0142' },
                    account: { tier: 'VIP', ltv: '$18,500', healthScore: 'At Risk', openTickets: 2 },
                }
            });
        }, 2000); // 振铃期即出现，与 Context Brief 同期
        this.currentTimerIds.push(crmTimer);

        // 3e. SOP 自动选中（接通后 3s）
        const sopTimer = setTimeout(() => {
            this.broadcastCallback({
                type: 'sop:autoSelect',
                data: { sopId: 'demo-sop-refund' }
            });
        }, RING_DURATION + 3000);
        this.currentTimerIds.push(sopTimer);

        // 4. Auto hangup at end
        const maxTime = Math.max(
            ...this.scenarios.transcriptions.map((t: any) => t.timeMs),
            ...this.scenarios.suggestions.map((s: any) => s.timeMs)
        ) + RING_DURATION + 3000;

        const endTimer = setTimeout(() => {
            this.stopCall(callId);

            // Push mock summary
            setTimeout(() => {
                this.broadcastCallback({
                    type: "omni:summary",
                    data: {
                        sessionId: callId,
                        sessionType: 'voice',
                        summary: {
                            intent: "Refund Request",
                            outcome: "Processed $129.99 Refund",
                            next_action: "System auto-generates return shipping label email",
                            entities: JSON.stringify({ "Order Number": "892-ALPHA", "Zip Code": "90210", "Amount": "$129.99" }),
                            sentiment: "Frustrated -> Relieved",
                            raw_summary: "Customer called extremely frustrated about a damaged order. Agent verified identity via zip code and successfully processed a full refund of $129.99 to the original payment method. No further escalation needed.",
                            llm_model: "CXMind-Omni-Pro"
                        }
                    }
                });
            }, 2000);

            // Push mock outcome prediction (arrives after summary)
            setTimeout(() => {
                this.broadcastCallback({
                    type: "omni:outcome",
                    data: {
                        sessionId: callId,
                        outcome: 'success',
                        confidence: 0.92,
                        reasoning: 'Full refund processed, customer satisfied'
                    }
                });
            }, 3500);

        }, maxTime);
        this.currentTimerIds.push(endTimer);
    }

    public stopCall(callId: string) {
        if (!this.isRunning) return;
        console.log(`[DemoStreamer] 🛑 Ending Mock Call ${callId}`);
        this.isRunning = false;

        this.currentTimerIds.forEach(id => {
            clearTimeout(id);
            clearInterval(id);
        });
        this.currentTimerIds = [];

        this.broadcastCallback({
            type: "call:event",
            data: {
                event_type: "call_hangup",
                call_id: callId
            }
        });
    }

    // 持久化 demo 会话到 storage，InboxPanel 挂载时可恢复
    private persistDemoConv(conv: { _id: string; channel: string; metadata: any; subject?: string }) {
        chrome.storage.local.get(['demo_active_convs'], (r) => {
            const existing: any[] = r.demo_active_convs || []
            if (existing.find((c: any) => c._id === conv._id)) return
            chrome.storage.local.set({ demo_active_convs: [...existing, conv] })
        })
    }

    // Simulate incoming omni-channel message
    public triggerOmniMessage(channel: string) {
        console.log(`[DemoStreamer] 💬 Simulating Omni-Channel Message for ${channel}`);
        const mockMsgId = `msg-demo-init`;
        const mockChannelId = `demo-webchat-01`;

        // Add safety clear of existing timers to avoid duplicate spam if clicked repeatedly
        this.currentTimerIds.forEach(id => {
            clearTimeout(id);
            clearInterval(id);
        });
        this.currentTimerIds = [];

        // 1. Ensure conversation is accepted/active in inbox
        const timer1 = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:new_conversation",
                data: {
                    id: mockChannelId,
                    channel: channel,
                    metadata: { visitorName: "Angry VIP Customer", visitorEmail: "sarah.chen@startup.io", visitorId: "demo-visitor-001" }
                }
            });
            this.persistDemoConv({ _id: mockChannelId, channel, metadata: { visitorName: "Angry VIP Customer", visitorEmail: "sarah.chen@startup.io", visitorId: "demo-visitor-001" } });
        }, 100);

        // 1b. Context Brief — 会话场景 AI 上下文（延迟 2s）
        const ctxTimer = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:context_brief",
                data: {
                    brief: {
                        severity: 'red',
                        actionable_opening: 'This VIP customer has threatened cancellation. Handle with empathy and offer the retention voucher immediately.',
                        bullets: [
                            '🔴 Sentiment: Angry — toxicity score 94%',
                            '⚠️ Premium account ($4,200 LTV) — 2 open tickets unresolved',
                            '📧 Last contact 2 days ago: complained about onboarding docs',
                            '💡 Recommend: $50 retention voucher + escalation to CS lead if unresolved'
                        ],
                        last_health_score: 22,
                        pending_actions: [{ type: 'voucher', status: 'suggested', amount: '$50' }],
                        recent_messages: [{ channel: 'email', content_text: 'Your docs are terrible', timestamp: new Date(Date.now() - 2 * 86400000).toISOString() }]
                    }
                }
            });
        }, 2000);
        this.currentTimerIds.push(ctxTimer);

        // 2. Toxic Alert (Barge-in warning)
        const timer2 = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:toxic_alert",
                data: { toxicScore: 0.94, text: "I need to talk to your manager! This is ridiculous, I am going to cancel my subscription right now." }
            });
        }, 1000);

        // 3. Push actual angry message to chat panel
        const timer3 = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:customer_message",
                data: {
                    messageId: mockMsgId,
                    conversationId: mockChannelId,
                    sender: { id: "demo-cust-1", name: "VIP Customer", role: "visitor" },
                    contentType: "text",
                    text: "I need to talk to your manager! This is ridiculous, I am going to cancel my subscription right now.",
                    createdAt: new Date().toISOString(),
                }
            });
        }, 1500);

        // 4a. CRM Loading skeleton — conversation open后立刻出现
        const timer4a = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:crm_lookup",
                data: {
                    conversationId: mockChannelId,
                    provider: "Salesforce",
                    status: "loading"
                }
            });
        }, 800);

        // 4b. CRM 数据到达
        const timer4 = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:crm_lookup",
                data: {
                    conversationId: mockChannelId,
                    provider: "Salesforce",
                    data: { name: "VIP Subscription", healthScore: "Critical", lifetimeValue: "$4,500", recentTickets: 3 }
                }
            });
        }, 3000);

        // 5. Action Draft (Over-the-top execution)
        const timer5 = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:action_draft",
                data: {
                    conversationId: mockChannelId,
                    intentName: "Issue Retention Voucher",
                    draft: { amount_usd: 50, reason_code: "vip_appeasement_risk" }
                }
            });
        }, 3000);

        // 6. Template Recommendation
        const timer6 = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:template_recommendation",
                data: {
                    conversationId: mockChannelId,
                    templateId: "vip-apology",
                    templateName: "Executive Apology + Voucher",
                    reasoning: "Best match for VIP complaint regarding service degradation."
                }
            });
        }, 4000);

        // 7. Supervisor Whisper in Group Chat
        const timer7 = setTimeout(() => {
            this.broadcastCallback({
                type: "chat:message",
                data: {
                    _id: `msg-supervisor-${Date.now()}`,
                    type: "internal",
                    channelId: "p2p:supervisor", // Route directly to a visible internal channel
                    sender: { id: "sup-steve", name: "Supervisor Steve", role: "supervisor" },
                    recipient: { type: "agent", id: "demo-agent" },
                    content: { text: "I see the toxic alert on your active chat. Don't argue with them, immediately approve the $50 voucher draft to de-escalate." },
                    createdAt: new Date().toISOString(),
                    status: "delivered"
                }
            });
        }, 5000);

        this.currentTimerIds.push(timer1, timer2, timer3, timer4a, timer4, timer5, timer6, timer7);
    }

    // ── WhatsApp: 物流查询 — 包裹延迟 ──
    private triggerWhatsAppConversation() {
        const channelId = 'demo-whatsapp-01';
        console.log('[DemoStreamer] 📱 Simulating WhatsApp — Shipping Delay');

        // 1. New conversation notification
        const t1 = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:new_conversation",
                data: {
                    id: channelId,
                    channel: "whatsapp",
                    metadata: { visitorName: "Maria Rodriguez", visitorEmail: "maria.rodriguez@gmail.com", visitorId: "demo-visitor-002" }
                }
            });
            this.persistDemoConv({ _id: channelId, channel: "whatsapp", metadata: { visitorName: "Maria Rodriguez", visitorEmail: "maria.rodriguez@gmail.com", visitorId: "demo-visitor-002" } });
        }, 100);

        // 2. Customer message
        const t2 = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:customer_message",
                data: {
                    messageId: `msg-wa-init-${Date.now()}`,
                    conversationId: channelId,
                    sender: { id: "demo-cust-2", name: "Maria Rodriguez", role: "visitor" },
                    contentType: "text",
                    text: "Hi, I placed order #TRK-5582 three days ago and tracking still says 'Label Created'. Can you tell me when it will actually ship? I need it by Friday.",
                    createdAt: new Date().toISOString(),
                }
            });
        }, 500);

        // 3. AI Suggestion
        const t3 = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:suggestion",
                data: {
                    conversationId: channelId,
                    suggestions: [
                        {
                            id: `sug-wa-1`, text: "📦 Order #TRK-5582 found in warehouse system. Status: Awaiting carrier pickup. Estimated ship date: Tomorrow.", confidence: 0.92,
                            type: 'tip', intent: { category: 'actionable', confidence: 0.93, reasoning: 'Tracking inquiry' }, source: { title: 'Logistics Tracking SOP', score: 0.90 }
                        },
                        {
                            id: `sug-wa-2`, text: "💡 Offer expedited shipping upgrade (free) to meet Friday deadline. This customer has 5 previous orders.", confidence: 0.85,
                            type: 'tip', intent: { category: 'actionable', confidence: 0.88, reasoning: 'Delivery deadline concern' }, source: { title: 'Shipping Upgrades Policy', score: 0.82 }
                        }
                    ]
                }
            });
        }, 1500);

        // 4. CRM Lookup
        const t4a = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:crm_lookup",
                data: { conversationId: channelId, provider: "Shopify", status: "loading" }
            });
        }, 800);
        const t4b = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:crm_lookup",
                data: {
                    conversationId: channelId,
                    provider: "Shopify",
                    data: { name: "Maria Rodriguez", healthScore: "Good", lifetimeValue: "$890", recentTickets: 0 }
                }
            });
        }, 2000);

        // 5. Context Brief
        const t5 = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:context_brief",
                data: {
                    conversationId: channelId,
                    brief: {
                        severity: 'yellow',
                        actionable_opening: 'Repeat buyer inquiring about shipping delay. Warehouse delay — not carrier issue. Proactively offer free upgrade.',
                        bullets: [
                            '📦 Order #TRK-5582: stuck at "Label Created" for 72h (warehouse backlog)',
                            '👤 5 previous orders, zero complaints — loyal customer',
                            '⏰ Needs delivery by Friday — tight window',
                            '💡 Recommend: free expedited upgrade + tracking link'
                        ]
                    }
                }
            });
        }, 2500);

        // 6. Template Recommendation
        const t6 = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:template_recommendation",
                data: {
                    conversationId: channelId,
                    templateId: "shipping-update",
                    templateName: "Shipping Delay Apology + ETA",
                    reasoning: "Best match for delayed shipment with known ETA."
                }
            });
        }, 3000);

        this.currentTimerIds.push(t1, t2, t3, t4a, t4b, t5, t6);
    }

    // ── Email: 账单争议 — 重复扣款 ──
    private triggerEmailConversation() {
        const channelId = 'demo-email-01';
        console.log('[DemoStreamer] 📧 Simulating Email — Billing Dispute');

        // 1. New conversation notification
        const t1 = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:new_conversation",
                data: {
                    id: channelId,
                    channel: "email",
                    metadata: { visitorName: "James Thompson", visitorEmail: "j.thompson@enterprise.co", visitorId: "demo-visitor-003" },
                    subject: "Duplicate charge on Feb invoice — please refund"
                }
            });
            this.persistDemoConv({ _id: channelId, channel: "email", metadata: { visitorName: "James Thompson", visitorEmail: "j.thompson@enterprise.co", visitorId: "demo-visitor-003" }, subject: "Duplicate charge on Feb invoice — please refund" });
        }, 100);

        // 2. Customer email message
        const t2 = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:customer_message",
                data: {
                    messageId: `msg-email-init-${Date.now()}`,
                    conversationId: channelId,
                    sender: { id: "demo-cust-3", name: "James Thompson", role: "visitor" },
                    contentType: "text",
                    text: "Hello,\n\nI noticed that my February invoice (INV-2026-0214) has a duplicate charge of $299 for the same service. This is the second time this has happened. Please process a refund ASAP.\n\nRegards,\nJames Thompson\nEnterprise Solutions Inc.",
                    createdAt: new Date().toISOString(),
                }
            });
        }, 500);

        // 3. AI Suggestion
        const t3 = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:suggestion",
                data: {
                    conversationId: channelId,
                    suggestions: [
                        {
                            id: `sug-em-1`, text: "🧾 Invoice INV-2026-0214 verified: duplicate line item for 'Pro Plan' ($299×2). Root cause: subscription renewal retry.", confidence: 0.95,
                            type: 'tip', intent: { category: 'actionable', confidence: 0.96, reasoning: 'Billing dispute — duplicate charge' }, source: { title: 'Billing Error Playbook', score: 0.94 }
                        },
                        {
                            id: `sug-em-2`, text: "⚠️ This is a repeat billing error (2nd occurrence). Prioritize refund + add billing guard to prevent recurrence.", confidence: 0.88,
                            type: 'alert', intent: { category: 'actionable', confidence: 0.91, reasoning: 'Repeat billing error escalation' }, source: { title: 'Billing Guard Configuration', score: 0.86 }
                        }
                    ]
                }
            });
        }, 1500);

        // 4. CRM Lookup
        const t4a = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:crm_lookup",
                data: { conversationId: channelId, provider: "Stripe", status: "loading" }
            });
        }, 800);
        const t4b = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:crm_lookup",
                data: {
                    conversationId: channelId,
                    provider: "Stripe",
                    data: { name: "Enterprise Solutions Inc.", healthScore: "At Risk", lifetimeValue: "$12,400", recentTickets: 2 }
                }
            });
        }, 2000);

        // 5. Context Brief
        const t5 = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:context_brief",
                data: {
                    conversationId: channelId,
                    brief: {
                        severity: 'red',
                        actionable_opening: 'Repeat billing error for Enterprise client. Refund immediately and escalate root cause to billing engineering.',
                        bullets: [
                            '🔴 Duplicate charge: $299 on INV-2026-0214 (subscription retry bug)',
                            '⚠️ 2nd occurrence — previous refund processed Jan 15',
                            '🏢 Enterprise account ($12.4K LTV) — high churn risk',
                            '💡 Recommend: immediate refund + engineering escalation + account credit'
                        ]
                    }
                }
            });
        }, 2500);

        // 6. Compliance Checklist（billing dispute 需要合规核查）
        const t6 = setTimeout(() => {
            this.broadcastCallback({
                type: "omni:compliance",
                data: {
                    conversationId: channelId,
                    items: [
                        { id: 'comp-1', text: 'Verify account ownership before processing refund', category: 'identity' },
                        { id: 'comp-2', text: 'Confirm duplicate charge amount matches invoice', category: 'financial' },
                        { id: 'comp-3', text: 'Document refund reason code for audit trail', category: 'compliance' },
                        { id: 'comp-4', text: 'Notify billing engineering of recurring issue', category: 'escalation' }
                    ],
                    completedItems: []
                }
            });
        }, 3500);

        this.currentTimerIds.push(t1, t2, t3, t4a, t4b, t5, t6);
    }

    // ── 一键触发三个会话（间隔推送, 模拟真实场景）──
    public triggerAllOmniConversations() {
        console.log('[DemoStreamer] 🚀 Triggering 3 parallel conversations');

        // 安全清理已有 timer
        this.currentTimerIds.forEach(id => { clearTimeout(id); clearInterval(id); });
        this.currentTimerIds = [];

        const conv1 = { _id: 'demo-webchat-01', channel: 'webchat', metadata: { visitorName: 'Angry VIP Customer', visitorEmail: 'sarah.chen@startup.io', visitorId: 'demo-visitor-001' } }
        const conv2 = { _id: 'demo-whatsapp-01', channel: 'whatsapp', metadata: { visitorName: 'Maria Rodriguez', visitorEmail: 'maria.rodriguez@gmail.com', visitorId: 'demo-visitor-002' } }
        const conv3 = { _id: 'demo-email-01', channel: 'email', metadata: { visitorName: 'James Thompson', visitorEmail: 'j.thompson@enterprise.co', visitorId: 'demo-visitor-003' }, subject: 'Duplicate charge on Feb invoice — please refund' }

        // 分批写入 storage，配合事件间隔，让 InboxPanel 逐个看到
        chrome.storage.local.set({ demo_active_convs: [conv1] });
        this.triggerOmniMessage('webchat');

        const t2 = setTimeout(() => {
            chrome.storage.local.set({ demo_active_convs: [conv1, conv2] });
            this.triggerWhatsAppConversation();
        }, 3000);

        const t3 = setTimeout(() => {
            chrome.storage.local.set({ demo_active_convs: [conv1, conv2, conv3] });
            this.triggerEmailConversation();
        }, 6000);

        this.currentTimerIds.push(t2, t3);
    }

    // ── Interactive Follow-ups (called when agent takes action) ──

    // Agent accepted the conversation
    public onOmniAccept() {
        const channelId = 'demo-webchat-01';
        console.log('[DemoStreamer] 🤝 Agent accepted conversation');

        // 坐席先回应客户的愤怒消息
        setTimeout(() => {
            this.broadcastCallback({
                type: 'omni:agent_message',
                data: {
                    messageId: `msg-agent-greet-${Date.now()}`,
                    conversationId: channelId,
                    sender: { id: 'demo-agent', name: 'Demo Agent', role: 'agent' },
                    contentType: 'text',
                    text: "I completely understand your frustration, and I sincerely apologize for the experience. Let me look into this right away and find a solution for you.",
                    createdAt: new Date().toISOString(),
                }
            });
        }, 1000);

        // 补发 copilot signals（triggerOmniMessage 中已发但 InboxPanel 可能错过）
        setTimeout(() => {
            this.broadcastCallback({
                type: "omni:crm_lookup",
                data: {
                    conversationId: channelId,
                    provider: "Salesforce",
                    data: { name: "VIP Subscription", healthScore: "Critical", lifetimeValue: "$4,500", recentTickets: 3 }
                }
            });
        }, 500);

        setTimeout(() => {
            this.broadcastCallback({
                type: "omni:action_draft",
                data: {
                    conversationId: channelId,
                    intentName: "Issue Retention Voucher",
                    draft: { amount_usd: 50, reason_code: "vip_appeasement_risk" }
                }
            });
        }, 2000);

        setTimeout(() => {
            this.broadcastCallback({
                type: "omni:template_recommendation",
                data: {
                    conversationId: channelId,
                    templateId: "vip-apology",
                    templateName: "Executive Apology + Voucher",
                    reasoning: "Best match for VIP complaint regarding service degradation."
                }
            });
        }, 2500);

        // SOP 自动选中
        setTimeout(() => {
            this.broadcastCallback({
                type: 'sop:autoSelect',
                data: { sopId: 'demo-sop-refund' }
            });
        }, 1500);

        // 客户看到坐席回应后才跟进
        setTimeout(() => {
            this.broadcastCallback({
                type: 'omni:customer_message',
                data: {
                    messageId: `msg-followup-${Date.now()}`,
                    conversationId: channelId,
                    sender: { id: 'demo-cust-1', name: 'VIP Customer', role: 'visitor' },
                    contentType: 'text',
                    text: "Fine, but I expect this to be fixed immediately. I've been a loyal customer for 3 years.",
                    createdAt: new Date().toISOString(),
                }
            });
        }, 3500);

        // Compliance Checklist（逐项打勾模拟实时检测）
        const compItems = [
            { id: 'greeting', text: 'Professional Greeting', category: 'communication' },
            { id: 'empathy', text: 'Empathy Acknowledgment', category: 'communication' },
            { id: 'identity', text: 'Account Verified', category: 'identity' },
            { id: 'resolution', text: 'Resolution Offered', category: 'resolution' },
        ];
        // 初始：空 completedItems
        setTimeout(() => {
            this.broadcastCallback({
                type: 'omni:compliance',
                data: { conversationId: channelId, items: compItems, completedItems: [] }
            });
        }, 1500);
        // 逐项打勾
        const checkOrder = ['greeting', 'empathy', 'identity', 'resolution'];
        checkOrder.forEach((itemId, idx) => {
            setTimeout(() => {
                this.broadcastCallback({
                    type: 'omni:compliance',
                    data: { conversationId: channelId, items: compItems, completedItems: checkOrder.slice(0, idx + 1) }
                });
            }, 3000 + idx * 3000);
        });

        // Coach Whisper
        setTimeout(() => {
            this.broadcastCallback({
                type: 'coach:message',
                data: {
                    from: 'Supervisor Steve',
                    text: 'Good de-escalation. Approve the voucher draft ASAP — this account is high-value.',
                    timestamp: new Date().toISOString()
                }
            });
        }, 4000);
    }

    // Agent approved the $50 voucher action draft
    public onOmniApprove() {
        const channelId = 'demo-webchat-01';
        console.log('[DemoStreamer] ✅ Agent approved action draft');

        // 1. 更新原 action 为 confirmed 状态（intentName 保持一致，触发去重替换）
        setTimeout(() => {
            this.broadcastCallback({
                type: 'omni:action_draft',
                data: {
                    conversationId: channelId,
                    intentName: 'Issue Retention Voucher',
                    status: 'confirmed',
                    draft: { amount_usd: 50, reason_code: 'vip_appeasement_risk', voucher_code: 'VIP-RETAIN-7X92', expires: '2026-04-01' }
                }
            });
        }, 500);

        // 2. 坐席通知客户voucher已发放
        setTimeout(() => {
            this.broadcastCallback({
                type: 'omni:agent_message',
                data: {
                    messageId: `msg-agent-voucher-${Date.now()}`,
                    conversationId: channelId,
                    sender: { id: 'demo-agent', name: 'Demo Agent', role: 'agent' },
                    contentType: 'text',
                    text: "Great news! I've issued a $50 voucher to your account (Code: VIP-RETAIN-7X92, valid until April 2026). Is there anything else I can help you with?",
                    createdAt: new Date().toISOString(),
                }
            });
        }, 1500);

        // 3. Customer de-escalates after seeing the voucher notification
        setTimeout(() => {
            this.broadcastCallback({
                type: 'omni:customer_message',
                data: {
                    messageId: `msg-deescalate-${Date.now()}`,
                    conversationId: channelId,
                    sender: { id: 'demo-cust-1', name: 'VIP Customer', role: 'visitor' },
                    contentType: 'text',
                    text: "OK... I appreciate the voucher. I'll stay for now, but please make sure this doesn't happen again.",
                    createdAt: new Date().toISOString(),
                }
            });
        }, 3500);
    }

    // Agent sent a reply message
    public onOmniAgentReply(agentText: string, convId: string = 'demo-webchat-01') {
        // 仅 webchat-01 有预编排的客户后续回应
        if (convId !== 'demo-webchat-01') {
            console.log(`[DemoStreamer] 💬 Agent replied on ${convId}, no scripted follow-up`);
            return;
        }
        const channelId = convId;
        console.log('[DemoStreamer] 💬 Agent replied, triggering customer response');

        // 1. Customer thanks the agent
        setTimeout(() => {
            this.broadcastCallback({
                type: 'omni:customer_message',
                data: {
                    messageId: `msg-thanks-${Date.now()}`,
                    conversationId: channelId,
                    sender: { id: 'demo-cust-1', name: 'VIP Customer', role: 'visitor' },
                    contentType: 'text',
                    text: "Thank you for your help. I'll keep the subscription going for now.",
                    createdAt: new Date().toISOString(),
                }
            });
        }, 2000);

        // 2. Suggest auto-resolve (no summary yet — wait for actual resolve)
        setTimeout(() => {
            this.broadcastCallback({
                type: 'omni:resolve_prompt',
                data: { conversationId: channelId }
            });
        }, 4000);
    }

    // Agent resolved the conversation — trigger AI summary
    public onOmniResolve() {
        const channelId = 'demo-webchat-01';
        console.log('[DemoStreamer] 📝 Conversation resolved, generating AI summary');

        // 1. Loading skeleton
        setTimeout(() => {
            this.broadcastCallback({
                type: 'omni:summary',
                data: {
                    sessionId: channelId,
                    sessionType: 'webchat',
                    status: 'loading'
                }
            });
        }, 300);

        // 2. 数据填充
        setTimeout(() => {
            this.broadcastCallback({
                type: 'omni:summary',
                data: {
                    sessionId: channelId,
                    sessionType: 'webchat',
                    summary: {
                        raw_summary: 'VIP customer threatened cancellation due to service issues. Agent de-escalated by approving a $50 retention voucher. Customer agreed to stay. Sentiment shifted from Angry → Satisfied.',
                        topics: JSON.stringify(['retention', 'voucher', 'VIP', 'de-escalation']),
                        sentiment: 'Angry → Satisfied',
                        outcome: 'Retained',
                        intent: 'Retention / Cancellation Prevention',
                        next_action: 'Follow-up email in 48h to confirm satisfaction',
                    }
                }
            });
        }, 3000);

        // 3. AI outcome prediction
        setTimeout(() => {
            this.broadcastCallback({
                type: 'omni:outcome',
                data: {
                    sessionId: channelId,
                    outcome: 'follow_up',
                    confidence: 0.78,
                    reasoning: 'Customer retained but requires follow-up to confirm satisfaction'
                }
            });
        }, 4500);

        // 4. Reopen 模拟: 12s 后客户再次发消息
        setTimeout(() => {
            console.log('[DemoStreamer] 🔄 Simulating conversation reopen');
            this.broadcastCallback({
                type: 'omni:conversation_reopened',
                data: {
                    conversationId: channelId,
                    reason: 'customer_message',
                    previousStatus: 'resolved',
                    reopenedAt: new Date().toISOString(),
                }
            });

            // 客户追加消息
            setTimeout(() => {
                this.broadcastCallback({
                    type: 'omni:customer_message',
                    data: {
                        messageId: `msg-reopen-${Date.now()}`,
                        conversationId: channelId,
                        sender: { id: 'demo-cust-1', name: 'VIP Customer', role: 'visitor' },
                        contentType: 'text',
                        text: "Actually, I just realized I also have a question about my loyalty points balance. Can you check?",
                        createdAt: new Date().toISOString(),
                    }
                });
            }, 500);

            // AI 建议
            setTimeout(() => {
                this.broadcastCallback({
                    type: 'omni:suggestion',
                    data: {
                        suggestion: 'Customer asking about loyalty points from reopened conversation. Check CRM for current balance.',
                        confidence: 0.88,
                        call_id: channelId,
                        type: 'tip',
                        intent: { category: 'actionable', confidence: 0.91, reasoning: 'Loyalty program inquiry' },
                        source: { title: 'Loyalty Program FAQ', score: 0.85 },
                    }
                });
            }, 2000);
        }, 12000);
    }
}
