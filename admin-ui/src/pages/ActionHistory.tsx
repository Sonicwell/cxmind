
import React from 'react';
import { useTabParam } from '../hooks/useTabParam';
import ActionHistoryTable from '../components/actions/ActionHistoryTable';
import ActionDiscoveryPanel from '../components/actions/ActionDiscoveryPanel';
import ActionConfigPanel from '../components/actions/ActionConfigPanel';
import { History, Lightbulb, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';

const tabKeys = [
    { key: 'history', labelKey: 'actionHistoryPage.auditHistory', icon: History },
    { key: 'discovery', labelKey: 'actionHistoryPage.discovery', icon: Lightbulb },
    { key: 'configuration', labelKey: 'actionHistoryPage.configuration', icon: Settings2 },
] as const;

type TabKey = typeof tabKeys[number]['key'];

const ActionHistory: React.FC = () => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useTabParam<TabKey>('tab', 'history');

    const handleCreateCustom = () => {
        setActiveTab('configuration');
    };

    return (
        <div style={{ padding: '1.5rem' }}>
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 className="page-title" style={{ marginBottom: '0.5rem' }}>{t('actionHistoryPage.title')}</h1>
                <p className="text-muted" style={{ fontSize: '0.95rem' }}>
                    {t('actionHistoryPage.subtitle')}
                </p>
            </div>

            {/* Tab Bar */}
            <div className="glass-card" style={{
                display: 'inline-flex',
                borderRadius: 'var(--radius-sm)',
                padding: '4px',
                marginBottom: '1.5rem',
                gap: '4px',
            }}>
                {tabKeys.map(({ key, labelKey, icon: Icon }) => (
                    <Button
                        key={key}
                        onClick={() => setActiveTab(key)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.55rem 1.2rem',
                            borderRadius: 'var(--radius-sm)',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            fontFamily: 'inherit',
                            transition: 'all 0.2s',
                            background: activeTab === key ? 'var(--primary)' : 'transparent',
                            color: activeTab === key ? '#fff' : 'var(--text-secondary)',
                        }}
                    >
                        <Icon size={16} />
                        {t(labelKey)}
                    </Button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="glass-card" style={{ borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
                {activeTab === 'history' && <ActionHistoryTable />}
                {activeTab === 'discovery' && <ActionDiscoveryPanel onCreateCustom={handleCreateCustom} />}
                {activeTab === 'configuration' && <ActionConfigPanel />}
            </div>
        </div>
    );
};

export default ActionHistory;
