import { Checkbox } from '../components/ui/Checkbox';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import React, { useEffect, useState } from 'react';
import { Settings, RefreshCw, ToggleLeft, ToggleRight, Plus, X, Trash2, Zap } from 'lucide-react';
import auditService from '../services/auditService';
import { MotionButton } from '../components/ui/MotionButton';
import { useDemoMode } from '../hooks/useDemoMode';
import { getMockAuditRules } from '../services/mock-data';
import '../styles/audit-dashboard.css';
import '../styles/alerts.css';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';

interface AuditRule {
    id: string;
    name: string;
    description: string;
    category: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    enabled: boolean;
    isDefault?: boolean;
    conditionType?: string;
    conditionConfig?: Record<string, any>;
    notificationConfig?: {
        email?: string;
        webhookUrl?: string;
    } | null;
}

const SEVERITY_CLASSES: Record<string, string> = {
    critical: 'red',
    high: 'amber',
    medium: 'amber',
    low: 'blue',
};

/* ────────── Condition Templates ────────── */
interface ConditionTemplate {
    id: string;
    label: string;
    description: string;
    category: string;
    severity: AuditRule['severity'];
    fields: {
        key: string;
        label: string;
        type: 'number' | 'text' | 'select';
        default: any;
        options?: { value: string; label: string }[];
        suffix?: string;
    }[];
}

const CONDITION_TEMPLATES: ConditionTemplate[] = [
    {
        id: 'failed_login',
        label: 'Consecutive Failed Logins',
        description: 'Detect when the same user/IP has multiple failed login attempts within a time window.',
        category: 'auth',
        severity: 'high',
        fields: [
            { key: 'threshold', label: 'Failed attempts threshold', type: 'number', default: 5, suffix: 'times' },
            { key: 'timeWindowMinutes', label: 'Time window', type: 'number', default: 5, suffix: 'minutes' },
            {
                key: 'matchBy', label: 'Match by', type: 'select', default: 'user_or_ip', options: [
                    { value: 'user_or_ip', label: 'User or IP' },
                    { value: 'user', label: 'User only' },
                    { value: 'ip', label: 'IP only' },
                ]
            },
        ],
    },
    {
        id: 'after_hours_access',
        label: 'After-hours Sensitive Access',
        description: 'Alert when sensitive resources are accessed outside defined business hours.',
        category: 'call_access',
        severity: 'medium',
        fields: [
            { key: 'startHour', label: 'Business start hour', type: 'number', default: 9, suffix: ':00' },
            { key: 'endHour', label: 'Business end hour', type: 'number', default: 18, suffix: ':00' },
        ],
    },
    {
        id: 'bulk_operation',
        label: 'Bulk Operation Detection',
        description: 'Detect when a single user performs too many operations (e.g. delete, update) in a short time.',
        category: 'all',
        severity: 'high',
        fields: [
            { key: 'actionType', label: 'Action keyword', type: 'text', default: 'delete' },
            { key: 'threshold', label: 'Operation count threshold', type: 'number', default: 10, suffix: 'times' },
            { key: 'timeWindowMinutes', label: 'Time window', type: 'number', default: 1, suffix: 'minutes' },
        ],
    },
    {
        id: 'privilege_escalation',
        label: 'Privilege Escalation',
        description: 'Alert when a user\'s role is changed to admin or platform_admin.',
        category: 'user_management',
        severity: 'critical',
        fields: [
            { key: 'targetRoles', label: 'Watch for roles', type: 'text', default: 'admin, platform_admin' },
        ],
    },
    {
        id: 'unusual_activity',
        label: 'Unusual Activity Volume',
        description: 'Flag users with an unusually high number of actions in a short time period.',
        category: 'all',
        severity: 'medium',
        fields: [
            { key: 'threshold', label: 'Action count threshold', type: 'number', default: 50, suffix: 'times' },
            { key: 'timeWindowMinutes', label: 'Time window', type: 'number', default: 5, suffix: 'minutes' },
        ],
    },
    {
        id: 'custom',
        label: 'Custom Rule (metadata only)',
        description: 'Create a rule with a name and description for tracking purposes. The detection logic must be configured server-side.',
        category: 'all',
        severity: 'medium',
        fields: [],
    },
];

const CATEGORIES = ['auth', 'call_access', 'user_management', 'compliance', 'security', 'quality', 'all'];
const SEVERITIES: AuditRule['severity'][] = ['low', 'medium', 'high', 'critical'];

const AuditRules: React.FC = () => {
    const { t } = useTranslation();
    const { demoMode } = useDemoMode();
    const [loading, setLoading] = useState(true);
    const [rules, setRules] = useState<AuditRule[]>([]);
    const [toggling, setToggling] = useState<string | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);

    // Form state
    const [selectedTemplate, setSelectedTemplate] = useState<string>('failed_login');
    const [formName, setFormName] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formCategory, setFormCategory] = useState('auth');
    const [formSeverity, setFormSeverity] = useState<AuditRule['severity']>('high');
    const [formEnabled, setFormEnabled] = useState(true);
    const [conditionConfig, setConditionConfig] = useState<Record<string, any>>({});

    // When template changes, auto-fill defaults
    const handleTemplateChange = (templateId: string) => {
        const tpl = CONDITION_TEMPLATES.find(t => t.id === templateId);
        if (!tpl) return;
        setSelectedTemplate(templateId);
        setFormCategory(tpl.category);
        setFormSeverity(tpl.severity);
        setFormDescription(tpl.description);
        // Set default config values
        const defaults: Record<string, any> = {};
        tpl.fields.forEach(f => { defaults[f.key] = f.default; });
        setConditionConfig(defaults);
    };

    // 首次渲染form时设默认值
    useEffect(() => {
        if (showCreateForm) {
            handleTemplateChange('failed_login');
        }
    }, [showCreateForm]);

    const fetchRules = async () => {
        try {
            setLoading(true);
            if (demoMode) {
                const data = await getMockAuditRules();
                setRules(data as AuditRule[]);
            } else {
                const data = await auditService.getRules();
                setRules(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Failed to fetch rules:', error);
            setRules([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRules();
    }, []);

    const handleToggleRule = async (ruleId: string, currentStatus: boolean) => {
        try {
            setToggling(ruleId);
            await auditService.toggleRule(ruleId, !currentStatus);
            setRules(rules.map(r => r.id === ruleId ? { ...r, enabled: !currentStatus } : r));
        } catch (error) {
            console.error('Failed to toggle rule:', error);
            fetchRules();
        } finally {
            setToggling(null);
        }
    };

    const handleCreateRule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formName.trim() || !formDescription.trim()) return;
        try {
            setCreating(true);
            await auditService.createRule({
                name: formName,
                description: formDescription,
                category: formCategory,
                severity: formSeverity,
                enabled: formEnabled,
                conditionType: selectedTemplate,
                conditionConfig,
            });
            setShowCreateForm(false);
            setFormName('');
            await fetchRules();
        } catch (error) {
            console.error('Failed to create rule:', error);
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteRule = async (ruleId: string) => {
        try {
            setDeleting(ruleId);
            await auditService.deleteRule(ruleId);
            setRules(rules.filter(r => r.id !== ruleId));
        } catch (error) {
            console.error('Failed to delete rule:', error);
            fetchRules();
        } finally {
            setDeleting(null);
        }
    };

    const currentTemplate = CONDITION_TEMPLATES.find(t => t.id === selectedTemplate);

    if (loading) {
        return (
            <div className="audit-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RefreshCw size={40} className="animate-spin" style={{ color: 'var(--primary)' }} />
            </div>
        );
    }

    return (
        <div className="audit-page">
            {/* Header */}
            <div className="audit-page-header">
                <div className="title-group">
                    <Settings size={28} style={{ color: 'var(--primary)' }} />
                    <div>
                        <h1>{t('audit.rulesTitle')}</h1>
                        <p>{t('audit.rulesSubtitle')}</p>
                    </div>
                </div>
                <MotionButton
                    variant="primary"
                    onClick={() => setShowCreateForm(!showCreateForm)}
                    className="flex items-center gap-sm"
                >
                    {showCreateForm ? <X size={18} /> : <Plus size={18} />}
                    {showCreateForm ? t('common.cancel', 'Cancel') : t('audit.createRule', 'Create Rule')}
                </MotionButton>
            </div>

            {/* ══════════ Create Rule Form ══════════ */}
            {showCreateForm && (
                <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                    <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Zap size={18} style={{ color: 'var(--primary)' }} />
                        {t('audit.newRule', 'New Audit Rule')}
                    </h3>

                    {/* ── Step 1: Choose Template ── */}
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            ① {t('audit.chooseTemplate', 'Choose a condition template')}
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                            {CONDITION_TEMPLATES.map(tpl => (
                                <Button
                                    key={tpl.id}
                                    type="button"
                                    onClick={() => handleTemplateChange(tpl.id)}
                                    style={{
                                        padding: '0.65rem 0.85rem',
                                        borderRadius: 'var(--radius-sm)',
                                        border: selectedTemplate === tpl.id
                                            ? '2px solid var(--primary)'
                                            : '1px solid hsla(var(--primary-hue), 20%, 50%, 0.2)',
                                        background: selectedTemplate === tpl.id
                                            ? 'hsla(var(--primary-hue), 60%, 50%, 0.1)'
                                            : 'hsla(0, 0%, 0%, 0.15)',
                                        color: selectedTemplate === tpl.id ? 'var(--primary)' : 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        fontSize: '0.8rem',
                                        fontWeight: selectedTemplate === tpl.id ? 600 : 500,
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    {tpl.label}
                                </Button>
                            ))}
                        </div>
                        {currentTemplate && (
                            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                {currentTemplate.description}
                            </p>
                        )}
                    </div>

                    <form onSubmit={handleCreateRule}>
                        {/* ── Step 2: Configure condition parameters ── */}
                        {currentTemplate && currentTemplate.fields.length > 0 && (
                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    ② {t('audit.configureCondition', 'Configure condition parameters')}
                                </label>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(${Math.min(currentTemplate.fields.length, 3)}, 1fr)`,
                                    gap: '1rem',
                                    background: 'hsla(var(--primary-hue), 30%, 50%, 0.05)',
                                    border: '1px solid hsla(var(--primary-hue), 20%, 50%, 0.15)',
                                    borderRadius: 'var(--radius-sm)',
                                    padding: '1rem',
                                }}>
                                    {currentTemplate.fields.map(field => (
                                        <div className="al-field" key={field.key}>
                                            <label>{field.label}</label>
                                            {field.type === 'select' ? (
                                                <Select
                                                    value={conditionConfig[field.key] ?? field.default}
                                                    onChange={(e) => setConditionConfig({ ...conditionConfig, [field.key]: e.target.value })}
                                                >
                                                    {field.options?.map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </Select>
                                            ) : field.type === 'number' ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        value={conditionConfig[field.key] ?? field.default}
                                                        onChange={(e) => setConditionConfig({ ...conditionConfig, [field.key]: parseInt(e.target.value) || 0 })}
                                                        style={{ flex: 1 }}
                                                    />
                                                    {field.suffix && (
                                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{field.suffix}</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <input
                                                    type="text"
                                                    value={conditionConfig[field.key] ?? field.default}
                                                    onChange={(e) => setConditionConfig({ ...conditionConfig, [field.key]: e.target.value })}
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Step 3: Rule metadata ── */}
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {currentTemplate && currentTemplate.fields.length > 0 ? '③' : '②'} {t('audit.ruleMetadata', 'Rule name & metadata')}
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                            <div className="al-field">
                                <label>{t('audit.ruleName', 'Rule Name')} *</label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    placeholder={t('audit.ruleNamePlaceholder', 'e.g. Failed Login Alert')}
                                    required
                                />
                            </div>
                            <div className="al-field">
                                <label>{t('audit.ruleCategory', 'Category')}</label>
                                <Select
                                    value={formCategory}
                                    onChange={(e) => setFormCategory(e.target.value)}
                                >
                                    {CATEGORIES.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </Select>
                            </div>
                            <div className="al-field">
                                <label>{t('audit.ruleSeverity', 'Severity')}</label>
                                <Select
                                    value={formSeverity}
                                    onChange={(e) => setFormSeverity(e.target.value as AuditRule['severity'])}
                                >
                                    {SEVERITIES.map(s => (
                                        <option key={s} value={s}>{s.toUpperCase()}</option>
                                    ))}
                                </Select>
                            </div>
                        </div>
                        <div className="al-field" style={{ marginBottom: '1rem' }}>
                            <label>{t('audit.ruleDescription', 'Description')} *</label>
                            <Textarea
                                value={formDescription}
                                onChange={(e) => setFormDescription(e.target.value)}
                                placeholder={t('audit.ruleDescPlaceholder', 'Describe what this rule detects and its purpose...')}
                                required
                                rows={2}
                                style={{
                                    background: 'hsla(0, 0%, 0%, 0.2)',
                                    border: '1px solid hsla(var(--primary-hue), 20%, 50%, 0.2)',
                                    padding: '0.6rem 0.8rem',
                                    borderRadius: 'var(--radius-sm)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.95rem',
                                    outline: 'none',
                                    width: '100%',
                                    resize: 'vertical',
                                    fontFamily: 'inherit',
                                    boxSizing: 'border-box',
                                    transition: 'border-color 0.2s',
                                }}
                                onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                                onBlur={(e) => e.target.style.borderColor = 'hsla(var(--primary-hue), 20%, 50%, 0.2)'}
                            />
                        </div>

                        {/* Footer */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                <Checkbox
                                    checked={formEnabled}
                                    onChange={(e) => setFormEnabled(e.target.checked)}
                                    style={{ accentColor: 'var(--primary)' }}
                                />
                                {t('audit.enableOnCreate', 'Enable immediately after creation')}
                            </label>
                            <MotionButton
                                variant="primary"
                                type="submit"
                                disabled={creating || !formName.trim() || !formDescription.trim()}
                                className="flex items-center gap-sm"
                            >
                                {creating ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
                                {t('audit.createRule', 'Create Rule')}
                            </MotionButton>
                        </div>
                    </form>
                </div>
            )}

            {/* ══════════ Rules List ══════════ */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {rules.map((rule) => (
                    <div key={rule.id} className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                                    {rule.name}
                                </h3>
                                <span className={`stat-icon ${SEVERITY_CLASSES[rule.severity] || 'blue'}`}
                                    style={{ padding: '0.1rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', width: 'auto', height: 'auto' }}>
                                    {rule.severity}
                                </span>
                                <span style={{
                                    padding: '0.1rem 0.5rem',
                                    background: 'rgba(99, 102, 241, 0.1)',
                                    color: 'var(--text-secondary)',
                                    borderRadius: '4px',
                                    fontSize: '0.7rem',
                                    fontWeight: 500,
                                }}>
                                    {rule.category}
                                </span>
                                {rule.conditionType && rule.conditionType !== 'custom' && (
                                    <span style={{
                                        padding: '0.1rem 0.5rem',
                                        background: 'hsla(var(--primary-hue), 60%, 50%, 0.12)',
                                        color: 'var(--primary)',
                                        borderRadius: '4px',
                                        fontSize: '0.65rem',
                                        fontWeight: 600,
                                    }}>
                                        ⚡ {rule.conditionType}
                                    </span>
                                )}
                                {rule.isDefault && (
                                    <span style={{
                                        padding: '0.1rem 0.5rem',
                                        background: 'rgba(139, 92, 246, 0.12)',
                                        color: '#8b5cf6',
                                        borderRadius: '4px',
                                        fontSize: '0.65rem',
                                        fontWeight: 600,
                                        letterSpacing: '0.03em',
                                    }}>
                                        🔒 System
                                    </span>
                                )}
                            </div>
                            <p style={{ color: 'var(--text-muted)', margin: '0 0 0.5rem', fontSize: '0.85rem' }}>
                                {rule.description}
                            </p>
                            {/* Show condition config if present */}
                            {rule.conditionConfig && Object.keys(rule.conditionConfig).length > 0 && (
                                <div style={{
                                    display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem',
                                }}>
                                    {Object.entries(rule.conditionConfig).map(([k, v]) => (
                                        <span key={k} style={{
                                            padding: '0.15rem 0.5rem',
                                            background: 'hsla(var(--primary-hue), 20%, 50%, 0.08)',
                                            border: '1px solid hsla(var(--primary-hue), 20%, 50%, 0.12)',
                                            borderRadius: '4px',
                                            fontSize: '0.7rem',
                                            color: 'var(--text-secondary)',
                                            fontFamily: "'SF Mono', 'Fira Code', monospace",
                                        }}>
                                            {k}: {String(v)}
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div style={{
                                background: 'var(--glass-bg)',
                                border: '1px solid var(--glass-border)',
                                borderRadius: 'var(--radius-xs, 6px)',
                                padding: '0.5rem 0.75rem',
                                fontSize: '0.75rem',
                                fontFamily: "'SF Mono', 'Fira Code', monospace",
                                color: 'var(--text-muted)',
                            }}>
                                {t('audit.ruleId')}: {rule.id}
                            </div>
                        </div>

                        <div style={{ marginLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
                            <MotionButton
                                variant={rule.enabled ? 'primary' : 'secondary'}
                                onClick={() => handleToggleRule(rule.id, rule.enabled)}
                                disabled={toggling === rule.id}
                                className="flex items-center gap-sm"
                                style={{ minWidth: 110 }}
                            >
                                {toggling === rule.id ? (
                                    <RefreshCw size={18} className="animate-spin" />
                                ) : rule.enabled ? (
                                    <>
                                        <ToggleRight size={18} />
                                        {t('audit.enabled')}
                                    </>
                                ) : (
                                    <>
                                        <ToggleLeft size={18} />
                                        {t('audit.disabled')}
                                    </>
                                )}
                            </MotionButton>
                            <MotionButton
                                variant="secondary"
                                onClick={() => handleDeleteRule(rule.id)}
                                disabled={deleting === rule.id || rule.isDefault}
                                className="flex items-center gap-sm"
                                style={{ minWidth: 110, color: rule.isDefault ? 'var(--text-muted)' : 'var(--danger, #ef4444)' }}
                                title={rule.isDefault ? t('audit.cannotDeleteDefault', 'System rules cannot be deleted, only disabled') : undefined}
                            >
                                {deleting === rule.id ? (
                                    <RefreshCw size={16} className="animate-spin" />
                                ) : (
                                    <>
                                        <Trash2 size={16} />
                                        {t('common.delete', 'Delete')}
                                    </>
                                )}
                            </MotionButton>
                        </div>
                    </div>
                ))}
            </div>

            {rules.length === 0 && (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    {t('audit.noRules')}
                </div>
            )}
        </div>
    );
};

export default AuditRules;
