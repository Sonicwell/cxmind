import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboardQuality } from '../../dashboard/DashboardContext';
import { mosGradeClass } from '../../dashboard/helpers';

const CodecPerformanceWidget: React.FC = () => {
    const { t } = useTranslation();
    const { codecData } = useDashboardQuality();

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="widget-title">{t('dashboard.codecPerfTitle', 'Codec Performance')}</h3>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {codecData.length > 0 ? (
                    <Table className="cq-codec-table">
                        <TableHeader><TableRow><TableHead>{t('common.codecs', 'Codec')}</TableHead><TableHead>{t('dashboard.toolbar.calls', 'Calls')}</TableHead><TableHead>{t('dashboard.avgMos', 'Avg MOS')}</TableHead><TableHead>{t('dashboard.avgLoss', 'Avg Loss')}</TableHead><TableHead>{t('dashboard.avgRtt', 'Avg RTT')}</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {codecData.map((c, i) => (
                                <TableRow key={i}>
                                    <TableCell style={{ fontWeight: 600 }}>{c.codec || t('dashboard.unknown', 'Unknown')}</TableCell>
                                    <TableCell>{c.call_count}</TableCell>
                                    <TableCell><span className={`mos-badge ${mosGradeClass(c.avg_mos)}`}>{(c.avg_mos || 0).toFixed(2)}</span></TableCell>
                                    <TableCell>{((c.avg_loss || 0) * 100).toFixed(2)}%</TableCell>
                                    <TableCell>{(c.avg_rtt || 0).toFixed(0)}ms</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (<div className="cq-empty">{t('dashboard.noCodecData', 'No codec data')}</div>)}
            </div>
        </div>
    );
};

export default CodecPerformanceWidget;
