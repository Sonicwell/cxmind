import { Input } from "../../components/ui/input";
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Checkbox } from '../../components/ui/Checkbox';
import { Select } from '../../components/ui/Select';
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { Save, Plus, Trash2, Zap, CheckCircle, Loader2, Radio, Shield, Info, Cpu, ArrowRightLeft, Edit3, Volume2, Pencil, AlertTriangle, MessageSquare, Clock, Send } from 'lucide-react';
import { ConfirmModal } from '../../components/ui/ConfirmModal';

import { Button } from '../../components/ui/button';

type ASRProviderType = 'dashscope' | 'funasr' | 'deepgram' | 'openai' | 'azure' | 'tencent' | 'google' | 'mock';
type LLMProviderType = 'openai' | 'dashscope' | 'anthropic' | 'openrouter' | 'mock';
type LLMServiceType = 'suggestion' | 'quality' | 'summary' | 'sentiment' | 'outcome' | 'action_draft' | 'embedding' | 'assistant' | 'checklist' | 'bot' | 'sop' | 'terminology';

type LLMVendorType = 'llm' | 'vector' | 'all';

interface LLMVendorConfig {
    id: string;
    provider: LLMProviderType;
    vendorType?: LLMVendorType;
    name: string;
    apiKey?: string;
    baseUrl?: string;
    model: string;
    embeddingModel?: string;
    maxTokens?: number;
    temperature?: number;
    isBuiltIn?: boolean;
    lastTestedAt?: string;
    lastTestResult?: 'success' | 'failed';
    lastTestLatencyMs?: number;
    lastTestError?: string;
    lastTestReply?: string;
    createdAt: string;
    updatedAt: string;
}

const vendorTypeOptions: { value: LLMVendorType; label: string; desc: string }[] = [
    { value: 'all', label: 'All (LLM + Vector)', desc: '同时提供对话和向量化服务' },
    { value: 'llm', label: 'LLM Only', desc: '仅提供对话/补全服务' },
    { value: 'vector', label: 'Vector Only', desc: '仅提供 Embedding 向量化服务' },
];

interface LLMServiceMappingEntry {
    primaryVendorId: string;
    secondaryVendorId: string;
}

interface ASRVendorConfig {
    id: string;
    provider: ASRProviderType;
    name: string;
    url?: string;
    apiKey?: string;
    model?: string;
    connectionPoolSize?: number;
    customParams?: string;
    lastTestedAt?: string;
    lastTestResult?: 'success' | 'failed';
    lastTestLatencyMs?: number;
    lastTestError?: string;
    isBuiltIn?: boolean;
    createdAt: string;
    updatedAt: string;
}

const providerOptions: { value: ASRProviderType; label: string; needsUrl: boolean; needsKey: boolean; urlPlaceholder?: string; urlHelpText?: string; keyPlaceholder?: string; keyHelpText?: string }[] = [
    { value: 'dashscope', label: 'DashScope (Alibaba)', needsUrl: true, needsKey: true },
    { value: 'funasr', label: 'FunASR', needsUrl: true, needsKey: false },
    { value: 'deepgram', label: 'Deepgram', needsUrl: false, needsKey: true },
    { value: 'azure', label: 'Azure Speech (Realtime)', needsUrl: true, needsKey: true, urlPlaceholder: 'eastus', urlHelpText: 'Enter your Azure Region (e.g. eastus, westus2)' },
    { value: 'tencent', label: 'Tencent Cloud ASR', needsUrl: true, needsKey: true, urlPlaceholder: '1250000000', urlHelpText: 'AppID', keyPlaceholder: 'SecretId,SecretKey', keyHelpText: 'Format: SecretId,SecretKey' },
    { value: 'google', label: 'Google Cloud Speech', needsUrl: false, needsKey: true },
    { value: 'openai', label: 'OpenAI Whisper', needsUrl: false, needsKey: true },
    { value: 'mock', label: 'Mock (Testing)', needsUrl: false, needsKey: false },
];

// 各 vendor 的推荐默认参数
const ASR_DEFAULT_PARAMS: Record<ASRProviderType, string> = {
    dashscope: '',
    funasr: '',
    openai: '',
    deepgram: '',
    azure: '',
    tencent: '',
    google: '',
    mock: '',
};

const llmProviderOptions: { value: LLMProviderType; label: string; needsUrl: boolean; needsKey: boolean; defaultModel: string }[] = [
    { value: 'openai', label: 'OpenAI', needsUrl: false, needsKey: true, defaultModel: 'gpt-4o-mini' },
    { value: 'dashscope', label: 'DashScope (Qwen)', needsUrl: false, needsKey: true, defaultModel: 'qwen-plus' },
    { value: 'anthropic', label: 'Anthropic Claude', needsUrl: false, needsKey: true, defaultModel: 'claude-3-5-haiku-latest' },
    { value: 'openrouter', label: 'OpenRouter', needsUrl: false, needsKey: true, defaultModel: 'openai/gpt-4o-mini' },
    { value: 'mock', label: 'Mock (Testing)', needsUrl: false, needsKey: false, defaultModel: 'mock-llm-v1' },
];

const LLM_SERVICE_LABELS: Record<LLMServiceType, string> = {
    suggestion: '实时建议 (Suggestion)',
    quality: '质检评分 (QI)',
    summary: '通话摘要 (Summary)',
    sentiment: '情感分析 (Sentiment)',
    outcome: '结果预测 (Outcome)',
    action_draft: '行动草稿 (Action Draft)',
    embedding: 'RAG 向量化 (Embedding)',
    assistant: 'Agent 助手 (Assistant)',
    checklist: '规则生成 (Checklist)',
    bot: 'Omnichannel Bot (Chat)',
    sop: 'SOP 生成 (SOP)',
    terminology: '术语挖掘 (Terminology)',
};








const getStatusBadge = (vendor: ASRVendorConfig, t: any) => {
    if (!vendor.lastTestResult) return <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, background: 'rgba(0,0,0,0.05)', color: 'var(--text-muted)' }}>{t('aiVendors.status.pendingTest', 'Pending Test')}</span>;
    if (vendor.lastTestResult === 'success') return <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, background: 'hsla(150, 60%, 50%, 0.12)', color: 'hsl(150, 60%, 35%)', border: '1px solid hsla(150, 60%, 50%, 0.3)' }}><CheckCircle size={10} style={{ marginRight: 2, verticalAlign: 'middle' }} />{t('aiVendors.status.connected', 'Connected')}</span>;
    return <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, background: 'hsla(0, 80%, 50%, 0.12)', color: 'hsl(0, 70%, 45%)', border: '1px solid hsla(0, 80%, 50%, 0.3)' }}><Info size={10} style={{ marginRight: 2, verticalAlign: 'middle' }} />{t('aiVendors.status.failed', 'Failed')}</span>;
};

const AiVendors: React.FC = () => {
    const { t } = useTranslation();
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // ASR Vendor state
    const [vendors, setVendors] = useState<ASRVendorConfig[]>([]);
    const [activeIds, setActiveIds] = useState<string[]>([]);
    const [vendorStatuses, setVendorStatuses] = useState<Record<string, string>>({});
    const [showAddForm, setShowAddForm] = useState(false);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [testingNewVendor, setTestingNewVendor] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; error?: string; latencyMs?: number } | null>(null);
    const [activatingId, setActivatingId] = useState<string | null>(null);
    const [vendorsLoading, setVendorsLoading] = useState(true);
    const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
    const [newVendor, setNewVendor] = useState({
        provider: 'dashscope' as ASRProviderType,
        name: '', url: '', apiKey: '', model: '', connectionPoolSize: 5, customParams: '',
    });
    const [vendorToDelete, setVendorToDelete] = useState<string | null>(null);
    const [vendorTestResult, setVendorTestResult] = useState<{ vendorId: string; success: boolean; text: string } | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [jsonError, setJsonError] = useState<string | null>(null);

    // LLM Vendor state
    const [llmVendors, setLlmVendors] = useState<LLMVendorConfig[]>([]);
    const [llmPrimaryId, setLlmPrimaryId] = useState('');
    const [llmSecondaryId, setLlmSecondaryId] = useState('');
    const [llmServiceMapping, setLlmServiceMapping] = useState<Record<string, LLMServiceMappingEntry>>({});
    const [llmLoading, setLlmLoading] = useState(true);
    const [showLlmAddForm, setShowLlmAddForm] = useState(false);
    const [testingLlmId, setTestingLlmId] = useState<string | null>(null);
    const [testingNewLlm, setTestingNewLlm] = useState(false);
    const [llmTestResult, setLlmTestResult] = useState<{ success: boolean; error?: string; latencyMs?: number } | null>(null);
    const [showLlmMapping, setShowLlmMapping] = useState(false);
    const [savingLlmMapping, setSavingLlmMapping] = useState(false);
    const [newLlm, setNewLlm] = useState({
        provider: 'openai' as LLMProviderType,
        vendorType: 'all' as LLMVendorType,
        name: '', apiKey: '', baseUrl: '', model: 'gpt-4o-mini', embeddingModel: '', maxTokens: 500, temperature: 0.7,
    });
    const [llmVendorToDelete, setLlmVendorToDelete] = useState<string | null>(null);
    const [llmVendorTestResult, setLlmVendorTestResult] = useState<{ vendorId: string; success: boolean; text: string } | null>(null);

    // LLM Chat Tester state
    const [chatTestVendorId, setChatTestVendorId] = useState<string | null>(null);
    const [chatPrompt, setChatPrompt] = useState('');
    const [chatSystemPrompt, setChatSystemPrompt] = useState('');
    const [chatResult, setChatResult] = useState<{ success: boolean; content?: string; error?: string; latencyMs?: number; usage?: any } | null>(null);
    const [chatLoading, setChatLoading] = useState(false);

    // Post-Call ASR state
    const [postCallConfig, setPostCallConfig] = useState({
        enabled: false, vendorId: '', model: '', maxConcurrent: 3, scheduleEnabled: false, scheduleStart: '22:00', scheduleEnd: '06:00', domainPrompt: '',
    });
    const [postCallStatus, setPostCallStatus] = useState<any>(null);
    const [savingPostCall, setSavingPostCall] = useState(false);

    useEffect(() => {
        fetchVendors();
        fetchLlmVendors();
        fetchPostCallASR();
    }, []);

    const fetchVendors = useCallback(async () => {
        setVendorsLoading(true);
        try {
            const response = await api.get('/platform/asr-vendors');
            if (response.data.success) {
                setVendors(response.data.data.vendors);
                setActiveIds(response.data.data.activeIds);
                if (response.data.data.statuses) {
                    setVendorStatuses(response.data.data.statuses);
                }
            }
        } catch (error) {
            console.error('Failed to fetch ASR vendors', error);
        } finally {
            setVendorsLoading(false);
        }
    }, []);

    const fetchLlmVendors = useCallback(async () => {
        setLlmLoading(true);
        try {
            const response = await api.get('/platform/llm-vendors');
            if (response.data.success) {
                setLlmVendors(response.data.data.vendors);
                setLlmPrimaryId(response.data.data.primaryId);
                setLlmSecondaryId(response.data.data.secondaryId);
                setLlmServiceMapping(response.data.data.serviceMapping || {});
            }
        } catch (error) {
            console.error('Failed to fetch LLM vendors', error);
        } finally {
            setLlmLoading(false);
        }
    }, []);

    const fetchPostCallASR = async () => {
        try {
            const [configRes, statusRes] = await Promise.all([
                api.get('/platform/post-call-asr/config'),
                api.get('/platform/post-call-asr/status'),
            ]);
            if (configRes.data && configRes.data.data) setPostCallConfig(configRes.data.data);
            if (statusRes.data && statusRes.data.data) setPostCallStatus(statusRes.data.data);
        } catch (error) {
            console.error('Failed to fetch post-call ASR config', error);
        }
    };

    const handleSaveVendor = async () => {
        try {
            const payload: any = { ...newVendor };
            payload.minPoolSize = payload.connectionPoolSize;
            delete payload.connectionPoolSize;
            if (editingVendorId && !payload.apiKey) delete payload.apiKey;

            if (editingVendorId) {
                await api.patch(`/platform/asr-vendors/${editingVendorId}`, payload);
                setMessage({ type: 'success', text: t('aiVendors.toast.asrUpdated', 'ASR vendor updated successfully') });
            } else {
                await api.post('/platform/asr-vendors', payload);
                setMessage({ type: 'success', text: t('aiVendors.toast.asrAdded', 'ASR vendor added successfully') });
            }
            setShowAddForm(false);
            setEditingVendorId(null);
            setNewVendor({ provider: 'dashscope', name: '', url: '', apiKey: '', model: '', connectionPoolSize: 5, customParams: ASR_DEFAULT_PARAMS['dashscope'] });
            setShowAdvanced(true);
            setJsonError(null);
            fetchVendors();
            setTimeout(() => setMessage(null), 3000);
        } catch (error: any) {
            setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to save vendor' });
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleEditVendorClick = (vendor: ASRVendorConfig) => {
        setEditingVendorId(vendor.id);
        const savedPoolSize = (vendor as any).minPoolSize || vendor.connectionPoolSize || 5;
        setNewVendor({
            provider: vendor.provider,
            name: vendor.name,
            url: vendor.url || '',
            apiKey: '',
            model: vendor.model || '',
            connectionPoolSize: savedPoolSize,
            customParams: vendor.customParams || '',
        });
        setShowAddForm(true);
        setShowAdvanced(!!vendor.customParams);
        setJsonError(null);
        setTestResult(null);
    };

    const handleTestNewVendor = async () => {
        setTestingNewVendor(true); setTestResult(null);
        try {
            const response = await api.post('/platform/asr-vendors/test-config', newVendor);
            setTestResult(response.data.data);
        } catch (error: any) {
            setTestResult({ success: false, error: error.response?.data?.error || t('aiVendors.toast.testFailed', 'Connection test failed') });
        } finally {
            setTestingNewVendor(false);
        }
    };

    const handleTestVendor = async (vendorId: string) => {
        setTestingId(vendorId); setVendorTestResult(null);
        try {
            const response = await api.post(`/platform/asr-vendors/${vendorId}/test`);
            const result = response.data.data;
            if (result.success) setVendorTestResult({ vendorId, success: true, text: t('aiVendors.test.connected', { latency: result.latencyMs, defaultValue: '✅ Connected ({{latency}}ms)' }) });
            else setVendorTestResult({ vendorId, success: false, text: `❌ ${result.error}` });
            api.get('/platform/asr-vendors').then(r => {
                if (r.data?.success) { setVendors(r.data.data.vendors); setActiveIds(r.data.data.activeIds); }
            }).catch(() => { });
        } catch (error: any) {
            setVendorTestResult({ vendorId, success: false, text: `❌ ${error.response?.data?.error || t('aiVendors.toast.testFallback', 'Test failed')}` });
        } finally {
            setTestingId(null); setTimeout(() => setVendorTestResult(null), 10000);
        }
    };

    const handleActivateVendor = async (vendorId: string) => {
        setActivatingId(vendorId);
        try {
            await api.post(`/platform/asr-vendors/${vendorId}/activate`);
            setMessage({ type: 'success', text: t('aiVendors.toast.asrActivated', 'ASR vendor activated. Ingestion Engine is reloading.') });
            fetchVendors();
        } catch (error: any) {
            setMessage({ type: 'error', text: error.response?.data?.error || t('aiVendors.toast.activationFailed', 'Activation failed') });
        } finally {
            setActivatingId(null); setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleDeleteVendor = async () => {
        if (!vendorToDelete) return;
        try {
            await api.delete(`/platform/asr-vendors/${vendorToDelete}`);
            setMessage({ type: 'success', text: t('aiVendors.toast.vendorDeleted', 'Vendor deleted') }); fetchVendors();
        } catch (error: any) {
            setMessage({ type: 'error', text: error.response?.data?.error || t('aiVendors.toast.deleteFailed', 'Delete failed') });
        } finally {
            setVendorToDelete(null); setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleAddLlm = async () => {
        try {
            if ((newLlm as any).id) {
                await api.put(`/platform/llm-vendors/${(newLlm as any).id}`, newLlm);
            } else {
                await api.post('/platform/llm-vendors', newLlm);
            }
            setShowLlmAddForm(false);
            setNewLlm({ provider: 'openai', vendorType: 'all', name: '', apiKey: '', baseUrl: '', model: 'gpt-4o-mini', embeddingModel: '', maxTokens: 500, temperature: 0.7 });
            setLlmTestResult(null);
            setMessage({ type: 'success', text: t('aiVendors.toast.llmSaved', 'LLM vendor saved successfully') });
            fetchLlmVendors(); setTimeout(() => setMessage(null), 3000);
        } catch (error: any) {
            setMessage({ type: 'error', text: error.response?.data?.error || t('aiVendors.toast.llmSaveFailed', 'Failed to save LLM vendor') }); setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleTestNewLlm = async () => {
        setTestingNewLlm(true); setLlmTestResult(null);
        try {
            const response = await api.post('/platform/llm-vendors/test-config', newLlm);
            setLlmTestResult(response.data.data);
        } catch (error: any) {
            setLlmTestResult({ success: false, error: error.response?.data?.error || t('aiVendors.toast.testFailed', 'Connection test failed') });
        } finally { setTestingNewLlm(false); }
    };

    const handleTestLlm = async (vendorId: string) => {
        setTestingLlmId(vendorId); setLlmVendorTestResult(null);
        try {
            const response = await api.post(`/platform/llm-vendors/${vendorId}/test`);
            const result = response.data.data;
            if (result.success) {
                setLlmVendorTestResult({ vendorId, success: true, text: t('aiVendors.toast.llmTestPassed', { latency: result.latencyMs, defaultValue: 'LLM test passed ({{latency}}ms)' }) + (result.replyText ? ` — "${result.replyText}"` : '') });
            } else {
                setLlmVendorTestResult({ vendorId, success: false, text: `❌ ${result.error || t('aiVendors.toast.testFallback', 'Test failed')}` });
            }
            setMessage({ type: result.success ? 'success' : 'error', text: result.success ? t('aiVendors.toast.llmTestPassed', { latency: result.latencyMs, defaultValue: 'LLM test passed ({{latency}}ms)' }) : t('aiVendors.toast.llmTestFailed', { error: result.error, defaultValue: 'LLM test failed: {{error}}' }) });
        } catch (error: any) {
            const errMsg = error.response?.data?.error || t('aiVendors.toast.testFallback', 'Test failed');
            setLlmVendorTestResult({ vendorId, success: false, text: `❌ ${errMsg}` });
            setMessage({ type: 'error', text: errMsg });
        } finally {
            setTestingLlmId(null); setTimeout(() => setMessage(null), 3000);
            setTimeout(() => setLlmVendorTestResult(null), 10000);
        }
    };

    const handleChatTest = async () => {
        if (!chatTestVendorId || !chatPrompt.trim()) return;
        setChatLoading(true); setChatResult(null);
        try {
            const response = await api.post(`/platform/llm-vendors/${chatTestVendorId}/chat-test`, {
                prompt: chatPrompt,
                systemPrompt: chatSystemPrompt
            });
            setChatResult(response.data.data);
        } catch (error: any) {
            setChatResult({ success: false, error: error.response?.data?.error || t('aiVendors.toast.testFallback', 'Test failed') });
        } finally {
            setChatLoading(false);
        }
    };

    const handleDeleteLlm = async () => {
        if (!llmVendorToDelete) return;
        try {
            await api.delete(`/platform/llm-vendors/${llmVendorToDelete}`);
            setMessage({ type: 'success', text: t('aiVendors.toast.llmDeleted', 'LLM vendor deleted') }); fetchLlmVendors();
        } catch (error: any) {
            setMessage({ type: 'error', text: error.response?.data?.error || t('aiVendors.toast.deleteFailed', 'Delete failed') });
        } finally {
            setLlmVendorToDelete(null); setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleSetLlmRole = async (vendorId: string, role: 'primary' | 'secondary') => {
        try {
            await api.post(`/platform/llm-vendors/${vendorId}/set-${role}`);
            setMessage({ type: 'success', text: t('aiVendors.toast.llmRoleUpdated', { role, defaultValue: `LLM ${role} vendor updated` }) }); fetchLlmVendors();
        } catch (error: any) {
            setMessage({ type: 'error', text: error.response?.data?.error || t('aiVendors.toast.setRoleFailed', 'Failed to set role') });
        } finally {
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleSaveLlmMapping = async () => {
        setSavingLlmMapping(true);
        try {
            await api.put('/platform/llm-service-mapping', llmServiceMapping);
            setMessage({ type: 'success', text: t('aiVendors.toast.mappingSaved', 'LLM service mapping saved') });
        } catch (error: any) {
            setMessage({ type: 'error', text: error.response?.data?.error || t('aiVendors.toast.mappingSaveFailed', 'Failed to save mapping') });
        } finally {
            setSavingLlmMapping(false); setTimeout(() => setMessage(null), 3000);
        }
    };

    const selectedProvider = providerOptions.find(p => p.value === newVendor.provider);

    return (
        <div className="settings-page max-w-5xl mx-auto p-6 space-y-8">
            <div className="mb-6">
                <h1 className="text-2xl font-bold mb-2">{t('aiVendors.title', 'AI Vendors')}</h1>
                <p className="text-gray-500">{t('aiVendors.subtitle', 'Configure LLMs, Speech Recognition engines, and Vector Database providers.')}</p>
            </div>

            {message && (
                <div style={{
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)',
                    background: message.type === 'success' ? 'hsla(150, 60%, 50%, 0.1)' : 'hsla(0, 60%, 50%, 0.1)',
                    border: `1px solid ${message.type === 'success' ? 'hsla(150, 60%, 50%, 0.3)' : 'hsla(0, 60%, 50%, 0.3)'}`,
                    color: message.type === 'success' ? 'hsl(150, 60%, 35%)' : 'hsl(0, 60%, 40%)',
                    marginBottom: '1rem',
                }}>
                    {message.text}
                </div>
            )}

            {/* ASR Vendors Section */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Radio size={24} color="var(--primary)" />
                        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{t('settingsPage.asr.title')}</h2>
                    </div>
                    <Button
                        onClick={() => {
                            setEditingVendorId(null);
                            setNewVendor({ provider: 'dashscope', name: '', url: '', apiKey: '', model: '', connectionPoolSize: 5, customParams: ASR_DEFAULT_PARAMS['dashscope'] });
                            setShowAdvanced(true);
                            setJsonError(null);
                            setShowAddForm(!showAddForm);
                        }}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                    >
                        <Plus size={16} />
                        {t('settingsPage.asr.addVendor')}
                    </Button>
                </div>

                {/* Add Vendor Form */}
                {showAddForm && (
                    <div style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--primary)', background: 'hsla(210, 100%, 97%, 1)', marginBottom: '1.25rem' }}>
                        <h4 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>{editingVendorId ? t('settingsPage.asr.editTitle') : t('settingsPage.asr.newTitle')}</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('settingsPage.asr.provider')}</label>
                                <Select value={newVendor.provider} onChange={e => {
                                    const prov = e.target.value as ASRProviderType;
                                    setNewVendor({ ...newVendor, provider: prov, customParams: ASR_DEFAULT_PARAMS[prov] || '' });
                                    setShowAdvanced(!!ASR_DEFAULT_PARAMS[prov]);
                                    setJsonError(null);
                                }} style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                                    {providerOptions.map(p => <option key={p.value} value={p.value}>{t(`aiVendors.provider.${p.value}`, { defaultValue: p.label })}</option>)}
                                </Select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('settingsPage.asr.name')}</label>
                                <Input value={newVendor.name} onChange={e => setNewVendor({ ...newVendor, name: e.target.value })} placeholder="e.g. Production DashScope" style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', boxSizing: 'border-box', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
                            </div>
                            {selectedProvider?.needsUrl && (
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{selectedProvider?.urlHelpText || t('settingsPage.asr.wsUrl')}</label>
                                    <Input value={newVendor.url} onChange={e => setNewVendor({ ...newVendor, url: e.target.value })} placeholder={selectedProvider?.urlPlaceholder || "wss://dashscope.aliyuncs.com/api-ws/v1/inference"} autoComplete="off" style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', boxSizing: 'border-box', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
                                </div>
                            )}
                            {selectedProvider?.needsKey && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{selectedProvider?.keyHelpText || t('settingsPage.asr.apiKey')}</label>
                                    <Input type="password" value={newVendor.apiKey} onChange={e => setNewVendor({ ...newVendor, apiKey: e.target.value })} placeholder={editingVendorId ? t('settingsPage.asr.apiKeyEditHint') : (selectedProvider?.keyPlaceholder || "sk-...")} autoComplete="new-password" style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', boxSizing: 'border-box', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
                                </div>
                            )}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('settingsPage.asr.model')}</label>
                                <Input value={newVendor.model} onChange={e => setNewVendor({ ...newVendor, model: e.target.value })} placeholder="paraformer-realtime-v2" style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', boxSizing: 'border-box', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
                            </div>
                            {(newVendor.provider === 'dashscope' || newVendor.provider === 'funasr') && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('settingsPage.asr.poolSize')}</label>
                                    <Input type="number" value={newVendor.connectionPoolSize} onChange={e => setNewVendor({ ...newVendor, connectionPoolSize: parseInt(e.target.value) || 5 })} min={1} max={200} style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', boxSizing: 'border-box', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
                                </div>
                            )}
                        </div>
                        {/* Advanced Parameters (collapsible) */}
                        <div style={{ marginTop: '0.75rem' }}>
                            <button
                                type="button"
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                                <span style={{ transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
                                高级参数 (Advanced)
                            </button>
                            {showAdvanced && (
                                <div style={{ marginTop: '0.5rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('aiVendors.customJsonParams', '自定义 JSON 参数')}</label>
                                    <textarea
                                        value={newVendor.customParams}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setNewVendor({ ...newVendor, customParams: val });
                                            if (val.trim()) {
                                                try { JSON.parse(val); setJsonError(null); } catch { setJsonError('JSON 格式无效'); }
                                            } else {
                                                setJsonError(null);
                                            }
                                        }}
                                        placeholder={'// 仅在此填写需要覆盖的参数 (Override)\n// paraformer 示例:\n// {\n//   "vad": { "silence_duration_ms": 1000 }\n// }\n//\n// fun-asr 示例:\n// {\n//   "max_sentence_silence": 1200\n// }'}
                                        rows={12}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: `1px solid ${jsonError ? 'var(--danger)' : 'var(--glass-border)'}`, fontSize: '0.85rem', fontFamily: 'monospace', boxSizing: 'border-box', background: 'var(--bg-card)', color: 'var(--text-primary)', resize: 'vertical', minHeight: '200px' }}
                                    />
                                    {jsonError && <div style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.25rem' }}>{jsonError}</div>}
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{t('aiVendors.customJsonParamsHint', '覆盖 ASR StartTaskFrame 默认参数，错误的 JSON 会被忽略')}</div>
                                </div>
                            )}
                        </div>
                        {testResult && (
                            <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', background: testResult.success ? 'hsla(150, 60%, 50%, 0.1)' : 'hsla(0, 60%, 50%, 0.1)', border: `1px solid ${testResult.success ? 'hsla(150, 60%, 50%, 0.3)' : 'hsla(0, 60%, 50%, 0.3)'}`, color: testResult.success ? 'hsl(150, 60%, 30%)' : 'hsl(0, 60%, 40%)', fontSize: '0.85rem' }}>
                                {testResult.success ? t('aiVendors.test.connectionPassed', { latency: testResult.latencyMs, defaultValue: 'Connection test passed ({{latency}}ms)' }) : t('aiVendors.test.testFailedReason', { error: testResult.error, defaultValue: 'Test failed: {{error}}' })}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                            <Button variant="secondary" onClick={() => { setShowAddForm(false); setEditingVendorId(null); }} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>{t('settingsPage.asr.cancel')}</Button>
                            <Button onClick={handleTestNewVendor} disabled={testingNewVendor || !newVendor.name} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', background: 'transparent', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)' }}>
                                {testingNewVendor ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} {t('settingsPage.asr.test')}
                            </Button>
                            <Button onClick={handleSaveVendor} disabled={!newVendor.name} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                {editingVendorId ? <Save size={14} /> : <Plus size={14} />} {editingVendorId ? t('settingsPage.asr.save') : t('settingsPage.asr.add')}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Vendors List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {vendorsLoading ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}><Loader2 size={24} className="animate-spin mx-auto mb-2" /><div>{t('settingsPage.asr.loadingVendors')}</div></div>
                    ) : vendors.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>{t('settingsPage.asr.noVendors')}</div>
                    ) : vendors.map(vendor => {
                        const isActive = activeIds.includes(vendor.id);
                        return (
                            <div key={vendor.id} style={{ padding: '1.25rem', borderRadius: 'var(--radius-md)', border: isActive ? '2px solid hsl(150, 60%, 35%)' : '1px solid var(--glass-border)', background: isActive ? 'hsla(150, 80%, 40%, 0.04)' : 'transparent', transition: 'all 0.2s ease' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontWeight: 600, fontSize: '1rem' }}>{vendor.name}</span>
                                                {getStatusBadge(vendor, t)}
                                                {vendorStatuses[vendor.provider] === 'unavailable' && <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, background: 'hsla(30, 100%, 50%, 0.12)', color: 'hsl(30, 80%, 40%)', border: '1px solid hsla(30, 100%, 50%, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><AlertTriangle size={10} />{t('aiVendors.status.unavailable', 'Unavailable')}</span>}
                                                {vendor.isBuiltIn && <span style={{ padding: '1px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, background: 'hsla(270, 60%, 50%, 0.12)', color: 'hsl(270, 50%, 45%)', border: '1px solid hsla(270, 50%, 45%, 0.3)' }}><Shield size={10} style={{ marginRight: 2, verticalAlign: 'middle' }} />{t('settingsPage.asr.builtIn')}</span>}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                                {vendor.provider.toUpperCase()} {vendor.url && ` · ${vendor.url.replace(/^wss?:\/\//, '').split('/')[0]}`} {vendor.apiKey && ' · Key: ' + vendor.apiKey}
                                            </div>
                                            {vendorTestResult && vendorTestResult.vendorId === vendor.id && (
                                                <div style={{ fontSize: '0.8rem', fontWeight: 600, marginTop: '0.5rem', padding: '6px 12px', borderRadius: '6px', background: vendorTestResult.success ? 'hsla(150, 80%, 40%, 0.1)' : 'hsla(0, 80%, 50%, 0.08)', color: vendorTestResult.success ? 'hsl(150, 60%, 35%)' : 'var(--danger)', border: `1px solid ${vendorTestResult.success ? 'hsla(150, 60%, 35%, 0.3)' : 'hsla(0, 60%, 50%, 0.3)'}` }}>
                                                    {vendorTestResult.text}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <Button onClick={() => handleTestVendor(vendor.id)} disabled={testingId === vendor.id} title={t('settingsPage.asr.testConnectivity')} style={{ padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'transparent', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            {testingId === vendor.id ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} {t('settingsPage.asr.test')}
                                        </Button>
                                        {!isActive && (
                                            <Button onClick={() => handleActivateVendor(vendor.id)} disabled={activatingId === vendor.id} title={t('settingsPage.asr.setActiveTitle')} style={{ padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid hsl(150, 60%, 35%)', background: 'hsla(150, 80%, 40%, 0.1)', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: 'hsl(150, 60%, 30%)' }}>
                                                {activatingId === vendor.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} {t('settingsPage.asr.activate')}
                                            </Button>
                                        )}
                                        {!vendor.isBuiltIn && <Button onClick={() => handleEditVendorClick(vendor)} style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}><Pencil size={14} /></Button>}
                                        {!vendor.isBuiltIn && !isActive && <Button onClick={() => setVendorToDelete(vendor.id)} style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'transparent', display: 'flex', alignItems: 'center', color: 'var(--danger)' }}><Trash2 size={14} /></Button>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* LLM Vendors Section */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Cpu size={24} color="var(--primary)" />
                        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{t('settingsPage.llm.title')}</h2>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Button className={`btn ${showLlmMapping ? 'btn-primary' : 'btn-outline'}`} onClick={() => setShowLlmMapping(!showLlmMapping)} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <ArrowRightLeft size={14} /> {t('settingsPage.llm.serviceMapping')}
                        </Button>
                        <Button onClick={() => { setShowLlmAddForm(!showLlmAddForm); if (!showLlmAddForm) { setNewLlm({ provider: 'openai', vendorType: 'all', name: '', apiKey: '', baseUrl: '', model: 'gpt-4o-mini', embeddingModel: '', maxTokens: 500, temperature: 0.7 }); setLlmTestResult(null); } }} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Plus size={14} /> {showLlmAddForm ? t('settingsPage.llm.cancelAdd') : t('settingsPage.llm.addLlmVendor')}
                        </Button>
                    </div>
                </div>

                {showLlmAddForm && (
                    <div style={{ marginBottom: '1.5rem', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--primary)', background: 'hsla(210, 100%, 97%, 1)' }}>
                        <h4 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>{t('settingsPage.llm.newTitle')}</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('settingsPage.llm.provider')}</label>
                                <Select value={newLlm.provider} onChange={e => { const prov = e.target.value as LLMProviderType; const opt = llmProviderOptions.find(o => o.value === prov); setNewLlm({ ...newLlm, provider: prov, model: opt?.defaultModel || '' }); setLlmTestResult(null); }} className="input" style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--glass-border)', width: '100%', background: 'var(--bg-card)' }}>
                                    {llmProviderOptions.map(o => <option key={o.value} value={o.value}>{t(`aiVendors.llmProvider.${o.value}`, { defaultValue: o.label })}</option>)}
                                </Select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('aiVendors.vendorTypeLabel', 'Vendor Type')}</label>
                                <Select value={newLlm.vendorType} onChange={e => setNewLlm({ ...newLlm, vendorType: e.target.value as LLMVendorType })} className="input" style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--glass-border)', width: '100%', background: 'var(--bg-card)' }}>
                                    {vendorTypeOptions.map(o => <option key={o.value} value={o.value}>{t(`aiVendors.llmProvider.${o.value}`, { defaultValue: o.label })}</option>)}
                                </Select>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{vendorTypeOptions.find(o => o.value === newLlm.vendorType)?.desc}</span>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('settingsPage.llm.name')}</label>
                                <Input value={newLlm.name} onChange={e => setNewLlm({ ...newLlm, name: e.target.value })} placeholder="My OpenAI Vendor" autoComplete="off" className="input" style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--bg-card)' }} />
                            </div>
                            {llmProviderOptions.find(o => o.value === newLlm.provider)?.needsKey && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('settingsPage.llm.apiKey')}</label>
                                    <Input type="password" value={newLlm.apiKey} onChange={e => setNewLlm({ ...newLlm, apiKey: e.target.value })} placeholder="sk-..." autoComplete="new-password" className="input" style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--bg-card)' }} />
                                </div>
                            )}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('settingsPage.llm.model')}</label>
                                <Input value={newLlm.model} onChange={e => setNewLlm({ ...newLlm, model: e.target.value })} autoComplete="off" className="input" style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--bg-card)' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('settingsPage.llm.baseUrl')}</label>
                                <Input value={newLlm.baseUrl} onChange={e => setNewLlm({ ...newLlm, baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" autoComplete="off" className="input" style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--bg-card)' }} />
                            </div>
                        </div>
                        {llmTestResult && (
                            <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '6px', background: llmTestResult.success ? 'hsla(150,60%,50%,0.1)' : 'hsla(0,60%,50%,0.1)', color: llmTestResult.success ? 'var(--success)' : 'var(--danger)', fontSize: '0.85rem' }}>
                                {llmTestResult.success ? `✅ Connected (${llmTestResult.latencyMs}ms)` : `❌ Failed: ${llmTestResult.error}`}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                            <Button className="-outline" onClick={handleTestNewLlm} disabled={testingNewLlm} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}>
                                {testingNewLlm ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} Test Connection
                            </Button>
                            <Button onClick={handleAddLlm} disabled={!newLlm.name || !newLlm.model} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}>
                                <Plus size={14} /> {(newLlm as any).id ? t('aiVendors.btn.saveChanges', 'Save Changes') : t('aiVendors.btn.addVendor', 'Add Vendor')}
                            </Button>
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {llmLoading ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}><Loader2 size={18} className="animate-spin mx-auto mb-2" /> {t('settingsPage.llm.loadingLlm')}</div>
                    ) : llmVendors.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>{t('settingsPage.llm.noVendors')}</div>
                    ) : llmVendors.map(v => {
                        const isPrimary = v.id === llmPrimaryId;
                        const isSecondary = v.id === llmSecondaryId;
                        return (
                            <div key={v.id} style={{ padding: '1rem 1.25rem', borderRadius: 'var(--radius-md)', border: `1px solid ${isPrimary ? 'hsla(150,60%,35%,0.3)' : 'var(--glass-border)'}`, background: isPrimary ? 'hsla(150,60%,40%,0.04)' : 'transparent', transition: 'all 0.2s' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{v.name}</span>
                                            {isPrimary && <span style={{ padding: '1px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, background: 'hsla(150,80%,40%,0.15)', color: 'hsl(150,60%,35%)', border: '1px solid hsla(150,60%,35%,0.3)' }}>{t('settingsPage.llm.primary')}</span>}
                                            {isSecondary && <span style={{ padding: '1px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, background: 'hsla(210,80%,50%,0.12)', color: 'hsl(210,60%,45%)', border: '1px solid hsla(210,60%,45%,0.3)' }}>{t('settingsPage.llm.secondary')}</span>}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {llmProviderOptions.find(o => o.value === v.provider)?.label || v.provider} · {v.model}
                                            {v.vendorType && v.vendorType !== 'all' && <span style={{ marginLeft: '0.5rem', padding: '1px 6px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 600, background: v.vendorType === 'vector' ? 'hsla(280,60%,50%,0.12)' : 'hsla(40,80%,50%,0.12)', color: v.vendorType === 'vector' ? 'hsl(280,50%,45%)' : 'hsl(40,60%,35%)' }}>{v.vendorType.toUpperCase()}</span>}
                                        </div>
                                        {llmVendorTestResult && llmVendorTestResult.vendorId === v.id && (
                                            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginTop: '0.5rem', padding: '6px 12px', borderRadius: '6px', background: llmVendorTestResult.success ? 'hsla(150, 80%, 40%, 0.1)' : 'hsla(0, 80%, 50%, 0.08)', color: llmVendorTestResult.success ? 'hsl(150, 60%, 35%)' : 'var(--danger)', border: `1px solid ${llmVendorTestResult.success ? 'hsla(150, 60%, 35%, 0.3)' : 'hsla(0, 60%, 50%, 0.3)'}` }}>
                                                {llmVendorTestResult.text}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                        {!isPrimary && !v.isBuiltIn && <Button size="sm" className="-sm -outline" onClick={() => handleSetLlmRole(v.id, 'primary')} style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>{t('settingsPage.llm.primary')}</Button>}
                                        {!isSecondary && v.id !== llmPrimaryId && <Button size="sm" className="-sm -outline" onClick={() => handleSetLlmRole(v.id, 'secondary')} style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>{t('settingsPage.llm.secondary')}</Button>}
                                        {!v.isBuiltIn && <Button size="sm" className="-sm -outline" onClick={() => { setNewLlm({ ...v, apiKey: '', vendorType: (v.vendorType || 'all') as LLMVendorType, baseUrl: v.baseUrl || '', embeddingModel: v.embeddingModel || '', maxTokens: v.maxTokens || 500, temperature: v.temperature || 0.7 } as any); setShowLlmAddForm(true); setLlmTestResult(null); }} style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Edit3 size={12} /> {t('aiVendors.btn.edit', 'Edit')}</Button>}
                                        <Button size="sm" className="-sm -outline" onClick={() => handleTestLlm(v.id)} disabled={testingLlmId === v.id} style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            {testingLlmId === v.id ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />} {t('settingsPage.asr.test')}
                                        </Button>
                                        <Button size="sm" className="-sm -outline" onClick={() => { setChatTestVendorId(v.id); setChatPrompt(''); setChatSystemPrompt(''); setChatResult(null); }} style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <MessageSquare size={12} /> {t('aiVendors.btn.chat', 'Chat')}
                                        </Button>
                                        {!v.isBuiltIn && <Button size="sm" className="-sm -outline" onClick={() => setLlmVendorToDelete(v.id)} style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', color: 'var(--danger)' }}><Trash2 size={12} /></Button>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {showLlmMapping && llmVendors.length > 0 && (
                    <div style={{ marginTop: '1.25rem', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.02)' }}>
                        <h4 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>{t('settingsPage.llm.mappingTitle')}</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem 1rem', fontSize: '0.85rem' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{t('settingsPage.llm.mappingService')}</div>
                            <div style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{t('settingsPage.llm.mappingPrimary')}</div>
                            <div style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{t('settingsPage.llm.mappingSecondary')}</div>
                            {(Object.keys(LLM_SERVICE_LABELS) as LLMServiceType[]).map(svc => {
                                const entry = llmServiceMapping[svc] || { primaryVendorId: '', secondaryVendorId: '' };
                                return (
                                    <React.Fragment key={svc}>
                                        <div style={{ display: 'flex', alignItems: 'center' }}>{t(`aiVendors.llmService.${svc}`, { defaultValue: LLM_SERVICE_LABELS[svc] })}</div>
                                        <Select value={entry.primaryVendorId || ''} onChange={e => setLlmServiceMapping({ ...llmServiceMapping, [svc]: { ...entry, primaryVendorId: e.target.value } })} style={{ padding: '0.35rem', borderRadius: '4px', border: '1px solid var(--glass-border)', background: 'var(--bg-card)' }}>
                                            <option value="">{t('settingsPage.llm.defaultPrimary')}</option>
                                            {llmVendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                        </Select>
                                        <Select value={entry.secondaryVendorId || ''} onChange={e => setLlmServiceMapping({ ...llmServiceMapping, [svc]: { ...entry, secondaryVendorId: e.target.value } })} style={{ padding: '0.35rem', borderRadius: '4px', border: '1px solid var(--glass-border)', background: 'var(--bg-card)' }}>
                                            <option value="">{t('settingsPage.llm.defaultSecondary')}</option>
                                            {llmVendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                        </Select>
                                    </React.Fragment>
                                );
                            })}
                        </div>
                        <Button onClick={handleSaveLlmMapping} disabled={savingLlmMapping} style={{ marginTop: '1rem', padding: '0.5rem 1.25rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            {savingLlmMapping ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Mapping
                        </Button>
                    </div>
                )}
            </div>

            {/* Post-Call ASR Section */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    <Volume2 size={24} color="var(--primary)" />
                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{t('settingsPage.postCall.title')}</h2>
                    {postCallStatus && (
                        <span className="ml-auto" style={{ padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, background: postCallStatus.queue?.processing > 0 ? 'hsla(210, 80%, 50%, 0.12)' : 'rgba(0,0,0,0.05)', color: postCallStatus.queue?.processing > 0 ? 'hsl(210, 60%, 45%)' : 'var(--text-muted)' }}>
                            {postCallStatus.queue?.processing > 0 ? t('settingsPage.postCall.processing', { processing: postCallStatus.queue.processing, pending: postCallStatus.queue.pending }) : t('settingsPage.postCall.idle')}
                        </span>
                    )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: `1px solid ${postCallConfig.enabled ? 'hsl(150, 60%, 35%)' : 'var(--glass-border)'}`, background: postCallConfig.enabled ? 'hsla(150, 80%, 40%, 0.04)' : 'transparent', transition: 'all 0.2s ease' }}>
                    <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                            <Checkbox checked={postCallConfig.enabled} onChange={e => setPostCallConfig({ ...postCallConfig, enabled: e.target.checked })} style={{ width: '18px', height: '18px', accentColor: 'hsl(150, 60%, 35%)' }} />
                            <span style={{ fontWeight: 600, fontSize: '1rem' }}>{t('settingsPage.postCall.enable')}</span>
                        </label>
                    </div>
                    {postCallConfig.enabled && (
                        <>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('settingsPage.postCall.asrVendor')}</label>
                                <Select value={postCallConfig.vendorId} onChange={e => setPostCallConfig({ ...postCallConfig, vendorId: e.target.value, model: '' })} style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', background: 'var(--bg-card)' }}>
                                    <option value="">{t('settingsPage.postCall.followActive')}</option>
                                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.provider})</option>)}
                                </Select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('settingsPage.postCall.maxConcurrent')}</label>
                                <Input type="number" min={1} max={20} value={postCallConfig.maxConcurrent} onChange={e => setPostCallConfig({ ...postCallConfig, maxConcurrent: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) })} style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', background: 'var(--bg-card)' }} />
                            </div>
                            {vendors.find(v => v.id === postCallConfig.vendorId)?.provider === 'tencent' && (
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('settingsPage.postCall.engineModel', 'Engine Model')}</label>
                                    <Select value={postCallConfig.model || ''} onChange={e => setPostCallConfig({ ...postCallConfig, model: e.target.value })} style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', background: 'var(--bg-card)' }}>
                                        <option value="">{t('settingsPage.postCall.engineAuto', 'Auto (based on sample rate)')}</option>
                                        <option value="8k_zh_large">8k_zh_large (中文电话大模型 + 20方言)</option>
                                        <option value="8k_zh">8k_zh (中文电话通用)</option>
                                        <option value="8k_en">8k_en (英文电话)</option>
                                        <option value="16k_zh">16k_zh (中文通用)</option>
                                        <option value="16k_zh_large">16k_zh_large (中文大模型)</option>
                                        <option value="16k_zh_en">16k_zh_en (中英粤+方言大模型)</option>
                                        <option value="16k_en">16k_en (英文通用)</option>
                                        <option value="16k_multi_lang">16k_multi_lang (15语种)</option>
                                    </Select>
                                </div>
                            )}
                            <div style={{ gridColumn: '1 / -1', marginTop: '1rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '1rem' }}>
                                    <Checkbox checked={postCallConfig.scheduleEnabled} onChange={e => setPostCallConfig({ ...postCallConfig, scheduleEnabled: e.target.checked })} style={{ width: '16px', height: '16px' }} />
                                    <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{t('settingsPage.postCall.scheduleWindow')}</span>
                                </label>
                                {postCallConfig.scheduleEnabled && (
                                    <div style={{ display: 'flex', gap: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.03)', borderRadius: 'var(--radius-sm)' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('settingsPage.postCall.startTime')}</label>
                                            <Input type="time" value={postCallConfig.scheduleStart} onChange={e => setPostCallConfig({ ...postCallConfig, scheduleStart: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--glass-border)', background: 'var(--bg-card)' }} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{t('settingsPage.postCall.endTime')}</label>
                                            <Input type="time" value={postCallConfig.scheduleEnd} onChange={e => setPostCallConfig({ ...postCallConfig, scheduleEnd: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--glass-border)', background: 'var(--bg-card)' }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                    <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                        <Button onClick={async () => {
                            setSavingPostCall(true);
                            try {
                                await api.post('/platform/post-call-asr/config', postCallConfig);
                                setMessage({ type: 'success', text: t('aiVendors.toast.postCallSaved', 'Post-Call ASR configuration saved') });
                            } catch (error) {
                                setMessage({ type: 'error', text: t('aiVendors.toast.postCallFailed', 'Failed to save configuration') });
                            } finally {
                                setSavingPostCall(false); setTimeout(() => setMessage(null), 3000);
                            }
                        }} disabled={savingPostCall} style={{ minWidth: '150px', display: 'flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'center' }}>
                            <Save size={16} /> {savingPostCall ? t('settingsPage.saving') : t('settingsPage.postCall.savePostCall')}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Modals placeholders */}
            {vendorToDelete && (
                <ConfirmModal open={!!vendorToDelete} onClose={() => setVendorToDelete(null)} title={t('settingsPage.asr.deleteVendor')} confirmText={t('settingsPage.asr.delete')} onConfirm={handleDeleteVendor} isDanger description={t('settingsPage.asr.deleteConfirm')} />
            )}
            {llmVendorToDelete && (
                <ConfirmModal open={!!llmVendorToDelete} onClose={() => setLlmVendorToDelete(null)} title={t('settingsPage.llm.deleteVendor')} confirmText={t('settingsPage.asr.delete')} onConfirm={handleDeleteLlm} isDanger description={t('settingsPage.asr.deleteConfirm')} />
            )}

            {chatTestVendorId && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
                    <div style={{ background: 'var(--bg-card)', width: '90%', maxWidth: '600px', borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'fadeIn 0.2s ease-out' }}>
                        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-subtle)' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <MessageSquare size={18} color="hsl(210, 80%, 55%)" />
                                {t('aiVendors.chatTest.title', 'LLM Chat Test')} 
                                <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>({llmVendors.find(v => v.id === chatTestVendorId)?.name})</span>
                            </h3>
                            <button onClick={() => setChatTestVendorId(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
                        </div>
                        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>System Prompt (Optional)</label>
                                <textarea placeholder="You are a helpful assistant..." value={chatSystemPrompt} onChange={e => setChatSystemPrompt(e.target.value)} rows={2} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.9rem', resize: 'vertical' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>Message <span style={{ color: 'var(--danger)' }}>*</span></label>
                                <textarea placeholder="Type a message to test the model..." value={chatPrompt} onChange={e => setChatPrompt(e.target.value)} rows={4} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.9rem', resize: 'vertical' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                <Button onClick={handleChatTest} disabled={chatLoading || !chatPrompt.trim()} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {chatLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                    {chatLoading ? 'Thinking...' : 'Send'}
                                </Button>
                            </div>
                            {chatResult && (
                                <div style={{ marginTop: '0.5rem', padding: '1rem', borderRadius: 'var(--radius-md)', border: `1px solid ${chatResult.success ? 'hsla(150, 60%, 35%, 0.3)' : 'hsla(0, 60%, 50%, 0.3)'}`, background: chatResult.success ? 'hsla(150, 60%, 40%, 0.04)' : 'hsla(0, 80%, 50%, 0.04)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px dashed var(--glass-border)', paddingBottom: '0.5rem' }}>
                                        <span style={{ fontWeight: 600, color: chatResult.success ? 'hsl(150, 60%, 35%)' : 'var(--danger)' }}>
                                            {chatResult.success ? '✅ Success' : '❌ Error'}
                                        </span>
                                        {chatResult.latencyMs && (
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Clock size={12} /> {chatResult.latencyMs}ms
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.95rem', whiteSpace: 'pre-wrap', color: 'var(--text-primary)', maxHeight: '200px', overflowY: 'auto' }}>
                                        {chatResult.content || chatResult.error || 'No content returned'}
                                    </div>
                                     {chatResult.usage && (
                                         <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--glass-border)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                             Tokens: {chatResult.usage.total_tokens} (In: {chatResult.usage.prompt_tokens}, Out: {chatResult.usage.completion_tokens})
                                         </div>
                                     )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AiVendors;
