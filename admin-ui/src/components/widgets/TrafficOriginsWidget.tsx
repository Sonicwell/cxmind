import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { useDashboardCore } from '../../dashboard/DashboardContext';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

const TrafficOriginsWidget: React.FC = () => {
    const { t } = useTranslation();
    const { stats, geoCountSet } = useDashboardCore();

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="widget-title">
                <Globe size={14} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
                {t('trafficOrigins.title', 'Traffic Origins')}
            </h3>
            <div style={{ flex: 1, minHeight: 0 }}>
                {stats?.system?.geoStats && stats.system.geoStats.length > 0 ? (
                    <div className="geo-map-container" style={{ height: '100%' }}>
                        <ComposableMap
                            projectionConfig={{ scale: 160, center: [10, 20] }}
                            width={900}
                            height={400}
                            style={{ width: '100%', height: 'auto', maxHeight: 'calc(100% - 30px)' }}
                        >
                            <Geographies geography={GEO_URL}>
                                {({ geographies }) =>
                                    geographies.map((geo) => {
                                        const id = geo.id || geo.properties?.['ISO_A3_EH'];
                                        const isHighlighted = geoCountSet.has(id);
                                        return (
                                            <Geography
                                                key={geo.rsmKey}
                                                geography={geo}
                                                fill={isHighlighted ? 'var(--primary)' : 'rgba(255,255,255,0.06)'}
                                                stroke="var(--glass-border)"
                                                strokeWidth={0.5}
                                                style={{
                                                    default: { outline: 'none' },
                                                    hover: { fill: isHighlighted ? '#818cf8' : 'rgba(255,255,255,0.1)', outline: 'none' },
                                                    pressed: { outline: 'none' },
                                                }}
                                            />
                                        );
                                    })
                                }
                            </Geographies>
                        </ComposableMap>
                        <div className="geo-legend">
                            {stats.system.geoStats.map((g, i) => (
                                <span key={i} className="geo-legend-item">{g.country}: <b>{g.count}</b></span>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="dash-empty-msg">{t('common.noData', 'No data')}</div>
                )}
            </div>
        </div>
    );
};

export default TrafficOriginsWidget;
