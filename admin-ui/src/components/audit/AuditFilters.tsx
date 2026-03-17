import { DatePicker } from '../ui/DatePicker';
import { Select } from '../ui/Select';
import React, { useState } from 'react';
import { Search, Calendar, Filter, X } from 'lucide-react';
import type { AuditLogQuery, AuditCategory } from '../../types/audit';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';

interface AuditFiltersProps {
    onFilterChange: (filters: AuditLogQuery) => void;
    loading?: boolean;
}

const AuditFilters: React.FC<AuditFiltersProps> = ({ onFilterChange, loading = false }) => {
    const { t } = useTranslation();

    const CATEGORIES: { value: AuditCategory; label: string }[] = [
        { value: 'auth', label: t('audit.cat_auth') },
        { value: 'user_management', label: t('audit.cat_user_mgmt') },
        { value: 'client_management', label: t('audit.cat_client_mgmt') },
        { value: 'agent_management', label: t('audit.cat_agent_mgmt') },
        { value: 'call_access', label: t('audit.cat_call_access') },
        { value: 'knowledge_base', label: t('audit.cat_knowledge_base') },
        { value: 'ai_config', label: t('audit.cat_ai_config') },
        { value: 'monitoring', label: t('audit.cat_monitoring') },
        { value: 'mfa', label: t('audit.cat_mfa') },
    ];

    const ACTIONS = [
        { value: 'login', label: t('audit.act_login') },
        { value: 'logout', label: t('audit.act_logout') },
        { value: 'login_failed', label: t('audit.act_login_failed') },
        { value: 'create', label: t('audit.act_create') },
        { value: 'update', label: t('audit.act_update') },
        { value: 'delete', label: t('audit.act_delete') },
        { value: 'view_call', label: t('audit.act_view_call') },
        { value: 'download_pcap', label: t('audit.act_download_pcap') },
        { value: 'start_monitoring', label: t('audit.act_start_monitoring') },
        { value: 'stop_monitoring', label: t('audit.act_stop_monitoring') },
    ];

    const [category, setCategory] = useState<string>('');
    const [action, setAction] = useState<string>('');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [operatorSearch, setOperatorSearch] = useState<string>('');
    const [showFilters, setShowFilters] = useState(false);

    const handleApplyFilters = () => {
        const filters: AuditLogQuery = {};
        if (category) filters.category = category;
        if (action) filters.action = action;
        if (startDate) filters.start_date = startDate;
        if (endDate) filters.end_date = endDate;
        if (operatorSearch) filters.operator_id = operatorSearch;

        onFilterChange(filters);
    };

    const handleClearFilters = () => {
        setCategory('');
        setAction('');
        setStartDate('');
        setEndDate('');
        setOperatorSearch('');
        onFilterChange({});
    };

    const hasActiveFilters = category || action || startDate || endDate || operatorSearch;

    const styles = {
        container: {
            backgroundColor: 'var(--bg-card)',
            borderRadius: '0.5rem',
            padding: '1.5rem',
            border: '1px solid var(--glass-border)',
            marginBottom: '1.5rem'
        },
        header: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem'
        },
        titleGroup: {
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
        },
        title: {
            fontSize: '1.125rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0
        },
        activeBadge: {
            padding: '0.25rem 0.5rem',
            backgroundColor: '#eff6ff',
            color: '#2563eb',
            fontSize: '0.75rem',
            borderRadius: '9999px',
            border: '1px solid #bfdbfe',
            fontWeight: 500
        },
        toggleBtn: {
            color: 'var(--text-muted)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.875rem'
        },
        grid: {
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            marginBottom: '1rem'
        },
        inputGroup: {
            display: 'flex',
            flexDirection: 'column' as const,
            marginBottom: '1rem'
        },
        label: {
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: 'var(--text-secondary)',
            marginBottom: '0.5rem'
        },
        input: {
            width: '100%',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--glass-border)',
            borderRadius: '0.5rem',
            padding: '0.5rem 1rem 0.5rem 2.5rem',
            color: 'var(--text-primary)',
            fontSize: '0.875rem',
            boxSizing: 'border-box' as const
        },
        select: {
            width: '100%',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--glass-border)',
            borderRadius: '0.5rem',
            padding: '0.5rem 1rem',
            color: 'var(--text-primary)',
            fontSize: '0.875rem',
            height: '2.5rem',
            boxSizing: 'border-box' as const
        },
        iconWrapper: {
            position: 'relative' as const
        },
        icon: {
            position: 'absolute' as const,
            left: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
            pointerEvents: 'none' as const
        },
        buttons: {
            display: 'flex',
            gap: '0.75rem',
            marginTop: '1rem'
        },
        applyBtn: {
            flex: 1,
            backgroundColor: '#2563eb',
            color: '#fff',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 500
        },
        clearBtn: {
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: 'transparent',
            color: 'var(--text-secondary)',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--glass-border)',
            cursor: 'pointer'
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.titleGroup}>
                    <Filter size={20} color="#2563eb" />
                    <h3 style={styles.title}>{t('audit.filters')}</h3>
                    {hasActiveFilters && (
                        <span style={styles.activeBadge}>{t('audit.active')}</span>
                    )}
                </div>
                <Button
                    onClick={() => setShowFilters(!showFilters)}
                    style={styles.toggleBtn}
                >
                    {showFilters ? t('audit.hide') : t('audit.show')}
                </Button>
            </div>

            {/* Quick Filter Presets */}
            <div style={{
                display: 'flex',
                gap: '0.5rem',
                flexWrap: 'wrap',
                marginBottom: showFilters ? '1rem' : 0,
            }}>
                {[
                    {
                        label: t('audit.presetFailedLogin', 'Failed Logins (1h)'),
                        filters: () => {
                            const now = new Date();
                            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
                            return {
                                category: 'auth',
                                action: 'login_failed',
                                start_date: oneHourAgo.toISOString().split('T')[0],
                            };
                        },
                        formState: () => {
                            const now = new Date();
                            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
                            setCategory('auth');
                            setAction('login_failed');
                            setStartDate(oneHourAgo.toISOString().split('T')[0]);
                            setEndDate('');
                            setOperatorSearch('');
                        },
                    },
                    {
                        label: t('audit.presetToday', 'Today'),
                        filters: () => ({
                            start_date: new Date().toISOString().split('T')[0],
                        }),
                        formState: () => {
                            setCategory('');
                            setAction('');
                            setStartDate(new Date().toISOString().split('T')[0]);
                            setEndDate('');
                            setOperatorSearch('');
                        },
                    },
                    {
                        label: t('audit.presetDeleteOps', 'Delete Ops'),
                        filters: () => ({ action: 'delete' }),
                        formState: () => {
                            setCategory('');
                            setAction('delete');
                            setStartDate('');
                            setEndDate('');
                            setOperatorSearch('');
                        },
                    },
                    {
                        label: t('audit.presetPermChange', 'Permission Changes'),
                        filters: () => ({
                            category: 'user_management',
                            action: 'update',
                        }),
                        formState: () => {
                            setCategory('user_management');
                            setAction('update');
                            setStartDate('');
                            setEndDate('');
                            setOperatorSearch('');
                        },
                    },
                ].map((preset) => (
                    <Button
                        key={preset.label}
                        onClick={() => {
                            preset.formState();
                            onFilterChange(preset.filters());
                        }}
                        disabled={loading}
                        style={{
                            padding: '0.3rem 0.75rem',
                            borderRadius: '9999px',
                            border: '1px solid var(--glass-border)',
                            backgroundColor: 'rgba(99, 102, 241, 0.08)',
                            color: 'var(--text-secondary)',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.18)';
                            e.currentTarget.style.color = 'var(--primary)';
                            e.currentTarget.style.borderColor = 'var(--primary)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.08)';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                            e.currentTarget.style.borderColor = 'var(--glass-border)';
                        }}
                    >
                        {preset.label}
                    </Button>
                ))}
            </div>

            {showFilters && (
                <div>
                    {/* Category and Action */}
                    <div style={styles.grid}>
                        <div style={styles.inputGroup}>
                            <label style={styles.label}>{t('actions.category')}</label>
                            <Select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                style={styles.select}
                                disabled={loading}
                            >
                                <option value="">{t('audit.allCategories')}</option>
                                {CATEGORIES.map((cat) => (
                                    <option key={cat.value} value={cat.value}>
                                        {cat.label}
                                    </option>
                                ))}
                            </Select>
                        </div>

                        <div style={styles.inputGroup}>
                            <label style={styles.label}>{t('actions.action')}</label>
                            <Select
                                value={action}
                                onChange={(e) => setAction(e.target.value)}
                                style={styles.select}
                                disabled={loading}
                            >
                                <option value="">{t('audit.allActions')}</option>
                                {ACTIONS.map((act) => (
                                    <option key={act.value} value={act.value}>
                                        {act.label}
                                    </option>
                                ))}
                            </Select>
                        </div>
                    </div>

                    {/* Date Range */}
                    <div style={styles.grid}>
                        <div style={styles.inputGroup}>
                            <label style={styles.label}>{t('audit.startDate')}</label>
                            <div style={styles.iconWrapper}>
                                <Calendar size={18} style={styles.icon} />
                                <DatePicker
                                    
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    style={styles.input}
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div style={styles.inputGroup}>
                            <label style={styles.label}>{t('audit.endDate')}</label>
                            <div style={styles.iconWrapper}>
                                <Calendar size={18} style={styles.icon} />
                                <DatePicker
                                    
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    style={styles.input}
                                    disabled={loading}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Operator Search */}
                    <div style={styles.inputGroup}>
                        <label style={styles.label}>{t('audit.operatorSearch')}</label>
                        <div style={styles.iconWrapper}>
                            <Search size={18} style={styles.icon} />
                            <input
                                type="text"
                                value={operatorSearch}
                                onChange={(e) => setOperatorSearch(e.target.value)}
                                placeholder={t('audit.searchOperatorPlaceholder')}
                                style={styles.input}
                                disabled={loading}
                            />
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={styles.buttons}>
                        <Button
                            onClick={handleApplyFilters}
                            disabled={loading}
                            style={{ ...styles.applyBtn, opacity: loading ? 0.5 : 1 }}
                        >
                            {t('audit.applyFilters')}
                        </Button>
                        <Button
                            onClick={handleClearFilters}
                            disabled={loading || !hasActiveFilters}
                            style={{ ...styles.clearBtn, opacity: (!hasActiveFilters || loading) ? 0.5 : 1 }}
                        >
                            <X size={18} />
                            {t('audit.clear')}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AuditFilters;
