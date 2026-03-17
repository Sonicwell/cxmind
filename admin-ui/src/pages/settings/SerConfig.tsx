import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Save, Loader2 } from 'lucide-react';
import api from '../../services/api';

import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';

interface SERConfig {
    enabled: boolean;
    realtimeEnabled: boolean;
    postCallEnabled: boolean;
    mode?: string; // 向后兼容旧 API 返回
    maxConcurrent: number;
    cpuThreshold: number;
    fusionWeight: number;
    minDuration: number;
    confidenceThreshold: number;
    silenceThreshold: number;
    scheduleEnabled: boolean;
    scheduleStart: string;
    scheduleEnd: string;
}

// 向后兼容: 旧 API 可能只返回 mode 而无 realtimeEnabled/postCallEnabled
function migrateFromLegacyMode(raw: any): Partial<SERConfig> {
    if (raw.realtimeEnabled !== undefined || raw.postCallEnabled !== undefined) return raw;
    const mode = raw.mode || 'post_call';
    return {
        ...raw,
        realtimeEnabled: mode === 'realtime' || mode === 'auto',
        postCallEnabled: mode === 'post_call' || mode === 'auto',
    };
}

export const SerConfig: React.FC = () => {
    const { t } = useTranslation();
    const [serConfig, setSerConfig] = useState<SERConfig>({
        enabled: false,
        realtimeEnabled: false,
        postCallEnabled: true,
        maxConcurrent: 2,
        cpuThreshold: 80,
        fusionWeight: 0.5,
        minDuration: 3,
        confidenceThreshold: 0.6,
        silenceThreshold: 0.03,
        scheduleEnabled: false,
        scheduleStart: '09:00',
        scheduleEnd: '18:00'
    });
    const [savingSer, setSavingSer] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        api.get('/speech-emotion/config')
            .then(res => {
                const raw = res.data?.data || res.data;
                const migrated = migrateFromLegacyMode(raw);
                setSerConfig(prev => ({ ...prev, ...migrated }));
            })
            .catch(err => console.error('Failed to load SER config:', err));
    }, []);

    const handleSaveSer = async () => {
        setSavingSer(true);
        try {
            await api.put('/speech-emotion/config', serConfig);
            setMessage({ type: 'success', text: 'SER configuration saved successfully' });
        } catch (e) {
            setMessage({ type: 'error', text: 'Failed to save SER configuration' });
        } finally {
            setSavingSer(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            {message && (
                <div style={{
                    padding: '1rem',
                    marginBottom: '1rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: message.type === 'success' ? 'hsla(var(--success-hue, 120), 40%, 90%, 1)' : 'hsla(0, 80%, 90%, 1)',
                    color: message.type === 'success' ? 'hsl(var(--success-hue, 120), 50%, 30%)' : 'hsl(0, 70%, 30%)',
                    border: `1px solid ${message.type === 'success' ? 'hsla(var(--success-hue, 120), 50%, 70%, 1)' : 'hsla(0, 70%, 70%, 1)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    {message.text}
                </div>
            )}

            <div style={{ padding: '2rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ padding: '0.5rem', background: 'hsla(var(--primary-hue, 260), 80%, 55%, 0.1)', borderRadius: 'var(--radius-md)' }}>
                            <Activity size={24} color="var(--primary)" />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{t('settingsPage.ser.title', 'Speech Emotion Recognition')}</h2>
                            <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                {t('settingsPage.ser.description', 'Configure the AI model responsible for identifying emotional sentiment from audio during calls.')}
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-base)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-full)', border: '1px solid var(--glass-border)' }}>
                        <Switch
                            checked={serConfig.enabled}
                            onCheckedChange={checked => setSerConfig({ ...serConfig, enabled: checked })}
                        />
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: serConfig.enabled ? 'var(--success)' : 'var(--text-muted)' }}>
                            {serConfig.enabled ? t('settingsPage.ser.enabled', 'Active') : t('settingsPage.ser.disabled', 'Inactive')}
                        </span>
                    </div>
                </div>

                <div style={{ opacity: serConfig.enabled ? 1 : 0.6, pointerEvents: serConfig.enabled ? 'auto' : 'none', transition: 'opacity 0.3s' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '2rem' }}>

                        {/* Column 1 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                    {t('settingsPage.ser.operationMode', 'Analysis Mode')}
                                </label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {/* Realtime Switch */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)',
                                        border: `1px solid ${serConfig.realtimeEnabled ? 'var(--primary)' : 'var(--glass-border)'}`,
                                        background: serConfig.realtimeEnabled ? 'hsla(var(--primary-hue, 260), 80%, 55%, 0.05)' : 'var(--bg-base)',
                                        transition: 'all 0.2s',
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Realtime</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                                {t('settingsPage.ser.realtimeHint', 'Analyzes streaming audio during the call for instant feedback. High CPU usage.')}
                                            </div>
                                        </div>
                                        <Switch
                                            checked={serConfig.realtimeEnabled}
                                            onCheckedChange={checked => setSerConfig({ ...serConfig, realtimeEnabled: checked })}
                                        />
                                    </div>

                                    {/* Post Call Switch */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)',
                                        border: `1px solid ${serConfig.postCallEnabled ? 'var(--primary)' : 'var(--glass-border)'}`,
                                        background: serConfig.postCallEnabled ? 'hsla(var(--primary-hue, 260), 80%, 55%, 0.05)' : 'var(--bg-base)',
                                        transition: 'all 0.2s',
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Post Call</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                                {t('settingsPage.ser.postCallHint', 'Processes the recording after the call concludes. Better accuracy, lower priority.')}
                                            </div>
                                        </div>
                                        <Switch
                                            checked={serConfig.postCallEnabled}
                                            onCheckedChange={checked => setSerConfig({ ...serConfig, postCallEnabled: checked })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                    {t('settingsPage.ser.maxConcurrentJobs', 'Max Concurrent Streams')}
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <input
                                        type="range" min="1" max="10"
                                        value={serConfig.maxConcurrent}
                                        onChange={e => setSerConfig({ ...serConfig, maxConcurrent: parseInt(e.target.value) })}
                                        style={{ flex: 1 }}
                                    />
                                    <div style={{ fontWeight: 600, width: '32px', textAlign: 'center', background: 'var(--bg-base)', padding: '0.2rem 0', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
                                        {serConfig.maxConcurrent}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                    {t('settingsPage.ser.minDuration', 'Minimum Audio Duration (s)')}
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <input
                                        type="number" min="1" max="60"
                                        value={serConfig.minDuration ?? 3}
                                        onChange={e => setSerConfig({ ...serConfig, minDuration: parseInt(e.target.value) })}
                                        className="input"
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--bg-base)' }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Column 2 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                    {t('settingsPage.ser.fusionWeight', 'Acoustic / Lexical Fusion Weight')}
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Text</div>
                                    <input
                                        type="range" min="0" max="1" step="0.1"
                                        value={serConfig.fusionWeight}
                                        onChange={e => setSerConfig({ ...serConfig, fusionWeight: parseFloat(e.target.value) })}
                                        style={{ flex: 1 }}
                                    />
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Voice</div>
                                    <div style={{ fontWeight: 600, width: '32px', textAlign: 'center', background: 'var(--bg-base)', padding: '0.2rem 0', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
                                        {serConfig.fusionWeight}
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                    {t('settingsPage.ser.fusionHint', 'Balances acoustic features (tone, pitch) against lexical analysis (transcribed text meaning).')}
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                    {t('settingsPage.ser.confidence', 'Confidence Acceptance Threshold')}
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <input
                                        type="range" min="0" max="1" step="0.05"
                                        value={serConfig.confidenceThreshold ?? 0.6}
                                        onChange={e => setSerConfig({ ...serConfig, confidenceThreshold: parseFloat(e.target.value) })}
                                        style={{ flex: 1 }}
                                    />
                                    <div style={{ fontWeight: 600, width: '32px', textAlign: 'center', background: 'var(--bg-base)', padding: '0.2rem 0', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
                                        {serConfig.confidenceThreshold ?? 0.6}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                    {t('settingsPage.ser.silenceThreshold', 'VAD Silence Threshold')}
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <input
                                        type="range" min="0.005" max="0.1" step="0.005"
                                        value={serConfig.silenceThreshold ?? 0.03}
                                        onChange={e => setSerConfig({ ...serConfig, silenceThreshold: parseFloat(e.target.value) })}
                                        style={{ flex: 1 }}
                                    />
                                    <div style={{ fontWeight: 600, width: '45px', textAlign: 'center', fontFamily: 'monospace', background: 'var(--bg-base)', padding: '0.2rem 0', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
                                        {(serConfig.silenceThreshold ?? 0.03).toFixed(3)}
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                    {t('settingsPage.ser.silenceHint', 'Lower values split audio chunks more aggressively during brief pauses.')}
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Schedule Section */}
                    <div style={{ marginTop: '2rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ margin: 0, transform: 'scale(0.8)', transformOrigin: 'left center' }}>
                                <Switch
                                    checked={serConfig.scheduleEnabled}
                                    onCheckedChange={checked => setSerConfig({ ...serConfig, scheduleEnabled: checked })}
                                />
                            </div>
                            <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                                {t('settingsPage.ser.scheduleWindow', 'Limit Processing to specific hours')}
                            </span>
                        </div>

                        {serConfig.scheduleEnabled && (
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginLeft: '2.5rem', background: 'var(--bg-base)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', width: 'fit-content' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('settingsPage.ser.start', 'Start Time')}</span>
                                    <input
                                        type="time"
                                        value={serConfig.scheduleStart}
                                        onChange={e => setSerConfig({ ...serConfig, scheduleStart: e.target.value })}
                                        className="input"
                                        style={{ width: '120px', padding: '0.4rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}
                                    />
                                </div>
                                <div style={{ width: '12px', height: '2px', background: 'var(--border-light)', marginTop: '1rem' }}></div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('settingsPage.ser.end', 'End Time')}</span>
                                    <input
                                        type="time"
                                        value={serConfig.scheduleEnd}
                                        onChange={e => setSerConfig({ ...serConfig, scheduleEnd: e.target.value })}
                                        className="input"
                                        style={{ width: '120px', padding: '0.4rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--glass-border)' }}>
                    <Button
                        disabled={savingSer}
                        onClick={handleSaveSer}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.5rem' }}
                    >
                        {savingSer ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        {savingSer ? t('settingsPage.saving', 'Saving...') : t('settingsPage.saveConfig', 'Save Configuration')}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default SerConfig;
