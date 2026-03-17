import { Checkbox } from '../ui/Checkbox';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Layers } from 'lucide-react';
import { useModules } from '../../context/ModuleContext';

export const ModuleManagementPanel: React.FC = () => {
    const { t } = useTranslation();
    const { modules: allModules, toggleModule, loading: modulesLoading } = useModules();

    const coreModules = allModules.filter(m => m.tier === 'core');
    const optionalModules = allModules.filter(m => m.tier === 'optional');

    return (
        <div style={{ marginBottom: '1.5rem', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <Layers size={20} color="var(--primary)" />
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{t('settingsPage.modules.title', 'Module Management')}</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {t('settingsPage.modules.desc', 'Enable or disable optional modules. Core modules are always active.')}
            </p>

            {modulesLoading && (
                <div style={{ padding: '1rem', color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
                    {t('common.loading', 'Loading modules...')}
                </div>
            )}

            {!modulesLoading && allModules.length === 0 && (
                <div style={{ padding: '1rem', color: 'var(--text-tertiary)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                    {t('settingsPage.modules.empty', 'No modules found in the current environment.')}
                </div>
            )}

            {coreModules.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                        {t('setup.coreModules', 'Core Modules')} — {t('setup.alwaysOn', 'Always On')}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {coreModules.map(m => (
                            <span key={m.slug} style={{
                                padding: '0.25rem 0.75rem',
                                borderRadius: '999px',
                                fontSize: '0.8rem',
                                background: 'hsla(150,60%,45%,0.12)',
                                color: 'var(--success)',
                                fontWeight: 500,
                            }}>
                                ✓ {t(`setup.module_${m.slug}`, m.slug)}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {optionalModules.length > 0 && (
                <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                        {t('setup.optionalModules', 'Optional Modules')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
                        {optionalModules.map(m => (
                            <label key={m.slug} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.6rem 0.75rem',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--glass-border)',
                                background: m.enabled ? 'hsla(250,80%,65%,0.06)' : 'transparent',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}>
                                <Checkbox
                                    checked={m.enabled}
                                    onChange={() => toggleModule(m.slug, !m.enabled)}
                                    style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: '0.85rem', fontWeight: 500, color: m.enabled ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                                    {t(`setup.module_${m.slug}`, m.slug)}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
