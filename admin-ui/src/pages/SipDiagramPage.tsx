import React from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SipDialog from '../components/SipDialog';

/**
 * 独立窗口 SIP Diagram 页面 — 通过 window.open 在新窗口中打开
 * 无侧栏布局，全屏展示 SipDialog
 */
const SipDiagramPage: React.FC = () => {
    const { callId } = useParams<{ callId: string }>();
    const { t } = useTranslation();

    if (!callId) {
        return (
            <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                height: '100vh', background: 'var(--bg-base, #0f172a)',
                color: 'var(--text-muted)',
            }}>
                {t('sipDiagramPage.noCallIdProvided', 'No Call ID provided.')}
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            background: 'var(--bg-base, #0f172a)',
            padding: '1rem',
            color: 'var(--text-primary)',
        }}>
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '0.75rem', paddingBottom: '0.5rem',
                borderBottom: '1px solid var(--glass-border, #333)',
            }}>
                <h1 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
                    {t('sipDiagramPage.title', 'SIP Diagram:')} <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', opacity: 0.7 }}>{callId}</span>
                </h1>
            </div>
            <SipDialog callId={callId} />
        </div>
    );
};

export default SipDiagramPage;
