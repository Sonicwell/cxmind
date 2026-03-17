import React from 'react';
import { Activity, Users, AlertTriangle, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import WidgetInfoTooltip from '../ui/WidgetInfoTooltip';

interface AuditStatsCardsProps {
    totalEvents: number;
    todayEvents: number;
    activeUsers: number;
    failedLogins: number;
    loading?: boolean;
}

const AuditStatsCards: React.FC<AuditStatsCardsProps> = ({
    totalEvents,
    todayEvents,
    activeUsers,
    failedLogins,
    loading = false,
}) => {
    const { t } = useTranslation();
    if (loading) {
        return (
            <div className="audit-stats-grid">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="glass-panel audit-stat-card" style={{ height: 100 }}>
                        <div>
                            <div className="audit-skeleton" style={{ width: 80, height: 12, marginBottom: 12 }} />
                            <div className="audit-skeleton" style={{ width: 56, height: 28 }} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    const cards = [
        { title: t('audit.totalEvents'), value: totalEvents, icon: <Activity size={20} />, color: 'blue' as const, infoKey: 'auditTotalEvents' },
        { title: t('audit.todaysActivity'), value: todayEvents, icon: <CheckCircle size={20} />, color: 'green' as const, infoKey: 'auditTodayActivity' },
        { title: t('audit.activeUsers'), value: activeUsers, icon: <Users size={20} />, color: 'blue' as const, infoKey: 'auditActiveUsers' },
        { title: t('audit.failedLogins'), value: failedLogins, icon: <AlertTriangle size={20} />, color: 'red' as const, infoKey: 'auditFailedLogins' },
    ];

    return (
        <div className="audit-stats-grid">
            {cards.map((card) => (
                <div key={card.title} className="glass-panel audit-stat-card" style={{ position: 'relative' }}>
                    <WidgetInfoTooltip info={{
                        descriptionKey: `widgetInfo.${card.infoKey}.desc`,
                        sourceKey: `widgetInfo.${card.infoKey}.source`,
                        calculationKey: `widgetInfo.${card.infoKey}.calc`,
                    }} />
                    <div className="stat-info">
                        <p>{card.title}</p>
                        <p className="stat-value">{card.value.toLocaleString()}</p>
                    </div>
                    <div className={`stat-icon ${card.color}`}>
                        {card.icon}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default AuditStatsCards;
