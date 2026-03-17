import { DatePicker } from '../../components/ui/DatePicker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Select } from '../../components/ui/Select';
import React, { useState, useEffect } from 'react';
import { Globe, Download, Save, Plus, MapPin, Clock, Trash } from 'lucide-react';
import api from '../../services/api';
import { useTranslation } from 'react-i18next';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { Input } from '../../components/ui/input';

import { Button } from '../../components/ui/button';

interface ShiftTemplate {
    _id: string;
    name: string;
    startTime: string;
    endTime: string;
    isNextDay: boolean;
    status: 'active' | 'inactive';
}

interface WfmHoliday {
    _id: string;
    countryCode: string;
    date: string;
    name: string;
    type: 'public' | 'custom';
    volumeMultiplier: number;
    updatedBy: string;
}

const WfmSettings: React.FC = () => {
    const { t } = useTranslation();
    const [holidays, setHolidays] = useState<WfmHoliday[]>([]);
    const [countryCode, setCountryCode] = useState('US');
    const [year, setYear] = useState(new Date().getFullYear().toString());
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);

    // Editing State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editMultiplier, setEditMultiplier] = useState<number>(1.0);

    // Custom form State
    const [showCustomForm, setShowCustomForm] = useState(false);
    const [customDate, setCustomDate] = useState('');
    const [customName, setCustomName] = useState('');
    const [customMultiplier, setCustomMultiplier] = useState(1.5);

    // Template State
    const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [showTemplateForm, setShowTemplateForm] = useState(false);
    const [templateForm, setTemplateForm] = useState({ name: '', startTime: '09:00', endTime: '17:00' });
    const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);

    const loadHolidays = async () => {
        setLoading(true);
        try {
            const startDate = `${year}-01-01`;
            const endDate = `${year}-12-31`;
            const isDemo = localStorage.getItem('cxmind:demo-mode') === 'true';
            const demoParam = isDemo ? '&demo=true' : '';
            const res = await api.get(`/platform/wfm/holidays?countryCode=${countryCode}&startDate=${startDate}&endDate=${endDate}${demoParam}`);
            setHolidays(res.data.data);
        } catch (error) {
            console.error('Failed to load holidays:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadTemplates = async () => {
        setLoadingTemplates(true);
        try {
            const res = await api.get('/platform/wfm/templates');
            setTemplates(res.data.data);
        } catch (error) {
            console.error('Failed to load templates:', error);
        } finally {
            setLoadingTemplates(false);
        }
    };

    useEffect(() => {
        loadHolidays();
        loadTemplates();
    }, [countryCode, year]);

    const handleSync = async () => {
        setSyncing(true);
        try {
            const res = await api.post('/platform/wfm/holidays/sync', { year: parseInt(year), countryCode });
            alert(`Sync completed. Imported ${res.data.insertedCount} new holidays.`);
            loadHolidays();
        } catch (error) {
            console.error('Failed to sync holidays:', error);
            alert('Failed to sync holidays. API might be limited or down.');
        } finally {
            setSyncing(false);
        }
    };

    const saveEdit = async (id: string) => {
        try {
            await api.patch(`/platform/wfm/holidays/${id}`, { volumeMultiplier: editMultiplier });
            setEditingId(null);
            loadHolidays();
        } catch (error) {
            console.error('Failed to save multiplier', error);
        }
    };

    const handleCreateCustom = async () => {
        try {
            await api.post('/platform/wfm/holidays/custom', {
                countryCode,
                date: customDate,
                name: customName,
                volumeMultiplier: customMultiplier
            });
            setShowCustomForm(false);
            setCustomDate('');
            setCustomName('');
            loadHolidays();
        } catch (error) {
            console.error('Failed to create custom holiday', error);
            alert('Failed to create custom holiday. Might already exist.');
        }
    };

    const handleCreateTemplate = async () => {
        try {
            await api.post('/platform/wfm/templates', {
                name: templateForm.name,
                startTime: templateForm.startTime,
                endTime: templateForm.endTime,
                isNextDay: templateForm.startTime > templateForm.endTime,
                status: 'active'
            });
            setShowTemplateForm(false);
            setTemplateForm({ name: '', startTime: '09:00', endTime: '17:00' });
            loadTemplates();
        } catch (error) {
            console.error('Failed to create template', error);
            alert('Failed to create template.');
        }
    };

    const handleDeleteTemplate = async (id: string) => {
        try {
            await api.delete(`/platform/wfm/templates/${id}`).catch(() => {
                alert('Template deletion is not supported by current API yet.');
            });
            loadTemplates();
        } catch (ignore) { }
        setDeleteTemplateId(null);
    }

    return (
        <>
            <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
                <div style={{ marginBottom: '32px' }}>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '8px' }}>{t('wfmSettings.title')}</h1>
                    <p className="text-muted">{t('wfmSettings.subtitle')}</p>
                </div>

                {/* Shift Templates Section */}
                <div style={{ marginBottom: '48px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{t('wfm.shiftTemplates', 'Shift Templates')}</h2>
                            <p className="text-muted" style={{ fontSize: '0.875rem' }}>{t('wfm.shiftTemplatesDesc', 'Manage standardized shift schedules to quickly generate rosters.')}</p>
                        </div>
                        <Button onClick={() => setShowTemplateForm(!showTemplateForm)}>
                            <Plus size={16} /> {t('wfm.newTemplate', 'New Template')}
                        </Button>
                    </div>

                    {showTemplateForm && (
                        <div className="glass-card" style={{ padding: '16px', marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'flex-end', border: '1px dashed var(--brand-cyan)' }}>
                            <div style={{ flex: 2 }}>
                                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>{t('wfmSettings.name')}</label>
                                <Input type="text" placeholder="e.g. Early Morning Shift" value={templateForm.name} onChange={(e: any) => setTemplateForm({ ...templateForm, name: e.target.value })} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>{t('call.startTime', 'Start Time')}</label>
                                <Input type="time" value={templateForm.startTime} onChange={(e: any) => setTemplateForm({ ...templateForm, startTime: e.target.value })} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>{t('call.endTime', 'End Time')}</label>
                                <Input type="time" value={templateForm.endTime} onChange={(e: any) => setTemplateForm({ ...templateForm, endTime: e.target.value })} />
                            </div>
                            <div>
                                <Button onClick={handleCreateTemplate} disabled={!templateForm.name}>{t('wfmSettings.add')}</Button>
                            </div>
                        </div>
                    )}

                    {loadingTemplates ? (
                        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>{t('common.loading')}</div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                            {templates.map(template => (
                                <div key={template._id} className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ fontWeight: 600, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Clock size={16} color="var(--brand-cyan)" />
                                            {template.name}
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={() => setDeleteTemplateId(template._id)} title={t('common.delete')}>
                                            <Trash size={16} />
                                        </Button>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.1)', padding: '12px', borderRadius: '8px' }}>
                                        <div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t('call.startTime', 'Start')}</div>
                                            <div style={{ fontWeight: 500 }}>{template.startTime}</div>
                                        </div>
                                        <div style={{ color: 'var(--text-secondary)' }}>→</div>
                                        <div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t('call.endTime', 'End')}</div>
                                            <div style={{ fontWeight: 500 }}>
                                                {template.endTime}
                                                {template.isNextDay && <sup style={{ color: 'var(--brand-cyan)', marginLeft: '4px' }}>+1d</sup>}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>{t('wfmSettings.type', 'Status')}</span>
                                        <span style={{ color: template.status === 'active' ? 'var(--toast-success)' : 'var(--text-secondary)' }}>{template.status}</span>
                                    </div>
                                </div>
                            ))}
                            {templates.length === 0 && (
                                <div style={{ gridColumn: '1 / -1', padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                                    {t('wfm.noTemplates', 'No shift templates configured yet.')}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* WFM Regional Calendar Section */}
                <div style={{ marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>{t('wfmSettings.calendarTitle', 'WFM Regional Calendar')}</h2>
                    <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '16px' }}>{t('wfmSettings.calendarSubtitle', 'Manage public holidays and regional volume multipliers for WFM forecasting.')}</p>
                </div>

                <div className="glass-card" style={{ display: 'flex', gap: '16px', marginBottom: '24px', padding: '16px', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>{t('wfmSettings.region')}</label>
                        <Select
                            value={countryCode}
                            onChange={(e) => setCountryCode(e.target.value)}
                            className="input-field"
                        >
                            <option value="US">🇺🇸 United States</option>
                            <option value="GB">🇬🇧 United Kingdom</option>
                            <option value="JP">🇯🇵 Japan</option>
                            <option value="IN">🇮🇳 India</option>
                            <option value="PH">🇵🇭 Philippines</option>
                            <option value="CN">🇨🇳 China</option>
                        </Select>
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>{t('wfmSettings.year')}</label>
                        <Select
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                            className="input-field"
                        >
                            <option value="2025">2025</option>
                            <option value="2026">2026</option>
                            <option value="2027">2027</option>
                        </Select>
                    </div>
                    <div>
                        <Button onClick={handleSync} disabled={syncing} style={{ padding: '0.65rem 1rem' }}>
                            <Download size={16} /> {syncing ? t('wfmSettings.syncing') : t('wfmSettings.autoImport')}
                        </Button>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '1.25rem' }}>{year} Holidays ({holidays.length})</h3>
                    <Button variant="secondary" onClick={() => setShowCustomForm(!showCustomForm)}>
                        <Plus size={16} /> {t('wfmSettings.customHoliday')}
                    </Button>
                </div>

                {showCustomForm && (
                    <div className="glass-card" style={{ padding: '16px', marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'flex-end', border: '1px dashed var(--brand-cyan)' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>{t('wfm.date')}</label>
                            <DatePicker value={customDate} onChange={(e: any) => setCustomDate(e.target.value)} />
                        </div>
                        <div style={{ flex: 2 }}>
                            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>{t('wfmSettings.eventName')}</label>
                            <Input type="text" placeholder="e.g. Singles Day Eve" value={customName} onChange={(e: any) => setCustomName(e.target.value)} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>{t('wfmSettings.multiplier')}</label>
                            <Input type="number" step="0.1" value={customMultiplier} onChange={(e: any) => setCustomMultiplier(parseFloat(e.target.value))} />
                        </div>
                        <div>
                            <Button onClick={handleCreateCustom}>{t('wfmSettings.add')}</Button>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>{t('common.loading')}</div>
                ) : (
                    <div className="glass-card overflow-hidden">
                        <Table className="data-table">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('wfm.date')}</TableHead>
                                    <TableHead>{t('wfmSettings.name')}</TableHead>
                                    <TableHead>{t('wfmSettings.type')}</TableHead>
                                    <TableHead>{t('wfmSettings.multiplierCol')}</TableHead>
                                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {holidays.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                            {t('wfmSettings.noHolidays')}
                                        </TableCell>
                                    </TableRow>
                                ) : holidays.map(holiday => (
                                    <TableRow key={holiday._id}>
                                        <TableCell>{holiday.date}</TableCell>
                                        <TableCell>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {holiday.type === 'public' ? <Globe size={14} color="var(--brand-cyan)" /> : <MapPin size={14} color="var(--toast-warning)" />}
                                                {holiday.name}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span style={{
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                                fontSize: '0.75rem',
                                                background: holiday.type === 'public' ? 'rgba(0, 240, 255, 0.1)' : 'rgba(250, 173, 20, 0.1)',
                                                color: holiday.type === 'public' ? 'var(--brand-cyan)' : 'var(--toast-warning)'
                                            }}>
                                                {holiday.type}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {editingId === holiday._id ? (
                                                <Input
                                                    type="number"
                                                    step="0.1"
                                                    value={editMultiplier}
                                                    onChange={(e: any) => setEditMultiplier(parseFloat(e.target.value))}
                                                    autoFocus
                                                    style={{ width: '80px', padding: '4px 8px' }}
                                                />
                                            ) : (
                                                <span style={{ fontWeight: 600, color: holiday.volumeMultiplier > 1.2 ? 'var(--toast-error)' : 'inherit' }}>
                                                    x{holiday.volumeMultiplier.toFixed(1)}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {editingId === holiday._id ? (
                                                <Button variant="ghost" size="icon" onClick={() => saveEdit(holiday._id)} style={{ color: 'var(--brand-cyan)' }} title="Save">
                                                    <Save size={16} />
                                                </Button>
                                            ) : (
                                                <Button
                                                    onClick={() => { setEditingId(holiday._id); setEditMultiplier(holiday.volumeMultiplier); }}
                                                    variant="link"
                                                    style={{ fontSize: '0.875rem', textDecoration: 'underline' }}
                                                >
                                                    {t('wfmSettings.editMultiplier')}
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>

            <ConfirmModal
                open={!!deleteTemplateId}
                onClose={() => setDeleteTemplateId(null)}
                onConfirm={() => { if (deleteTemplateId) handleDeleteTemplate(deleteTemplateId); }}
                title={t('common.confirmDelete', 'Delete Template')}
                description={t('common.confirmDeleteDesc', 'Are you sure you want to delete this template?')}
            />
        </>
    );
};

export default WfmSettings;
