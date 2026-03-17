import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { useDashboardQuality } from '../../dashboard/DashboardContext';
import { mosGradeClass } from '../../dashboard/helpers';

const RegionalQualityWidget: React.FC = () => {
    const { t } = useTranslation();
    const { geoMedia } = useDashboardQuality();

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="widget-title">
                <Globe size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                {t('dashboard.regionalQualityTitle', 'Regional Quality')}
            </h3>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {geoMedia.length > 0 ? (
                    <div className="cq-geo-grid">
                        {geoMedia.slice(0, 8).map((geo, i) => (
                            <div key={i} className="cq-geo-card">
                                <div className="country-name">{geo.country || t('dashboard.unknown', 'Unknown')}</div>
                                <div className="geo-metric"><span>{t('dashboard.avgMos', 'Avg MOS')}</span><span className={`mos-badge ${mosGradeClass(geo.avg_mos || 0)}`}>{(geo.avg_mos || 0).toFixed(2)}</span></div>
                                <div className="geo-metric"><span>{t('dashboard.loss', 'Loss')}</span><span>{((geo.avg_loss || 0) * 100).toFixed(1)}%</span></div>
                                <div className="geo-metric"><span>{t('dashboard.rtt', 'RTT')}</span><span>{(geo.avg_rtt || 0).toFixed(0)}ms</span></div>
                                <div className="geo-metric"><span>{t('dashboard.reports', 'Reports')}</span><span>{geo.report_count || geo.call_count || 0}</span></div>
                            </div>
                        ))}
                    </div>
                ) : (<div className="cq-empty">{t('dashboard.noRegionalData', 'No regional data')}</div>)}
            </div>
        </div>
    );
};

export default RegionalQualityWidget;
