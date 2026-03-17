import React from 'react';
import { BarChart3 } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import { useDashboardQuality } from '../../dashboard/DashboardContext';
import { PIE_COLORS } from '../../dashboard/helpers';
import ChartContainer from './ChartContainer';
import { useTranslation } from 'react-i18next';

const MosDistributionWidget: React.FC = () => {
    const { t } = useTranslation();
    const { mosDist } = useDashboardQuality();

    const pieData = mosDist ? [
        { name: t('mos.excellent', 'Excellent (≥4.0)'), value: Number(mosDist.excellent) || 0 },
        { name: t('mos.good', 'Good (3.0-4.0)'), value: Number(mosDist.good) || 0 },
        { name: t('mos.fair', 'Fair (2.0-3.0)'), value: Number(mosDist.fair) || 0 },
        { name: t('mos.poor', 'Poor (<2.0)'), value: Number(mosDist.poor) || 0 },
    ] : [];
    const total = mosDist?.total || 0;

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="widget-title">
                <BarChart3 size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                {t('mos.title', 'MOS Distribution')}
            </h3>
            {total > 0 ? (
                <div className="cq-mos-dist" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <ChartContainer>
                        <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                                {pieData.map((_, idx) => (<Cell key={idx} fill={PIE_COLORS[idx]} />))}
                            </Pie>
                            <Tooltip contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                        </PieChart>
                    </ChartContainer>
                    <div className="cq-mos-legend">
                        {pieData.map((item, idx) => (
                            <div key={idx} className="cq-mos-legend-item">
                                <span className="cq-mos-legend-dot" style={{ background: PIE_COLORS[idx] }} />
                                <span>{item.name}</span>
                                <span className="cq-mos-legend-value">{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (<div className="cq-empty">{t('mos.noData', 'No MOS data')}</div>)}
        </div>
    );
};

export default MosDistributionWidget;
