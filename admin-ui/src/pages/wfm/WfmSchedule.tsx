import { Checkbox } from '../../components/ui/Checkbox';
import { DatePicker } from '../../components/ui/DatePicker';
import { Select } from '../../components/ui/Select';
import React, { useState, useEffect, useRef } from 'react';
import {
    format,
    addDays,
    startOfWeek,
    addWeeks,
    subWeeks
} from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, Sparkles, Globe, Flame, Activity } from 'lucide-react';
import classes from './WfmSchedule.module.css';
import { GlassModal } from '../../components/ui/GlassModal';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { Input } from '../../components/ui/input';
import api from '../../services/api';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui/button';

interface ForecastPoint {
    time: string;
    predictedVolume: number;
    requiredAgents: number;
}

interface Shift {
    _id: string;
    agentId: any;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    type?: string;
}

interface ShiftTemplate {
    _id: string;
    name: string;
    startTime: string;
    endTime: string;
    isNextDay: boolean;
    status: 'active' | 'inactive';
}

interface RowData {
    agentList: { name: string, sipExtension: string, burnoutScore: number, adherenceStreak: number, shifts: Shift[], avatarUrl: string, trend: number[] }[];
    isWeek: boolean;
    startHour: number;
    endHour: number;
    spanHours: number;
    currentDate: Date;
    showBurnout: boolean;
    handleEditShift?: (shift: any, agentName: string, agentExt: string) => void;
}

const AgentRow = ({ index, data }: { index: number, data: RowData }) => {
    const { t } = useTranslation();
    const { agentList, isWeek, startHour, endHour, spanHours, currentDate, showBurnout, handleEditShift } = data;
    const agentData = agentList[index];
    const idx = index;
    const isBurnedOut = showBurnout && agentData.burnoutScore > 80;

    return (
        <div key={idx}>
            <div className={classes.agentRow} style={{ backgroundColor: isBurnedOut ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                <div className={classes.agentNameCol}>
                    <div
                        className={classes.agentAvatar}
                        style={{
                            ...(isBurnedOut ? { border: '2px solid #ef4444', boxShadow: '0 0 10px rgba(239,68,68,0.5)', color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)' } : { backgroundColor: 'var(--bg-tertiary)' }),
                            backgroundImage: `url(${agentData.avatarUrl})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            color: 'transparent',
                            overflow: 'hidden'
                        }}
                    >
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isBurnedOut ? '#ef4444' : 'inherit' }}>
                                {agentData.name}
                            </span>
                            {agentData.adherenceStreak >= 3 && (
                                <span title={`${agentData.adherenceStreak} Day Perfect Adherence Streak`} style={{ color: '#f97316', display: 'flex' }}>
                                    <Flame size={14} fill="#f97316" />
                                </span>
                            )}
                            {localStorage.getItem('cxmind:demo-mode') === 'true' && (
                                <div className={classes.statusDotWrapper}>
                                    <div
                                        style={{
                                            width: '6px',
                                            height: '6px',
                                            borderRadius: '50%',
                                            backgroundColor: idx % 4 === 0 ? '#ef4444' : '#10b981',
                                            boxShadow: idx % 4 === 0 ? '0 0 6px rgba(239,68,68,0.6)' : 'none',
                                            flexShrink: 0
                                        }}
                                    />
                                    <div className={classes.richHoverCard}>
                                        <div className={classes.ttHeader}>{t('wfm.liveTelemetry')}</div>
                                        <div className={classes.ttBody}>
                                            <div>{t('wfm.status')} <span>{idx % 4 === 0 ? t('wfm.offline') : t('wfm.onCall')}</span></div>
                                            <div>{t('wfm.timeInState')} <span>14m 22s</span></div>
                                            <div>{t('wfm.adherenceLabel')} <span>{98 - (idx % 10)}%</span></div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', marginTop: '2px', gap: '6px', paddingRight: '8px' }}>
                            {agentData.sipExtension && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>EXT:{agentData.sipExtension}</span>
                            )}
                            <svg width="40" height="12" viewBox="0 0 60 15" style={{ marginLeft: 'auto', opacity: 0.8 }}>
                                <polyline
                                    points={agentData.trend.map((val, i) => `${i * 10},${15 - (val - 70) / 2}`).join(' ')}
                                    fill="none"
                                    stroke={agentData.trend[6] >= agentData.trend[5] ? '#10b981' : '#ef4444'}
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </div>
                    </div>
                </div>
                <div className={classes.shiftsColContainer}>
                    {/* Grid lines */}
                    <div className={classes.hoursGridBg}>
                        {Array.from({ length: spanHours }).map((_, i) => <div key={`bg-${i}`} className={classes.hourBgTick}></div>)}
                    </div>

                    {/* Unstaffed Blocks (Day View only for precision) */}
                    {!isWeek && (
                        (() => {
                            // 算空闲区间
                            const dayShifts = agentData.shifts.filter(s => s.date === format(currentDate, 'yyyy-MM-dd'));

                            // Sort by start time
                            const intervals = dayShifts.map(s => {
                                const [sh, sm] = s.startTime.split(':').map(Number);
                                const [eh, em] = s.endTime.split(':').map(Number);
                                return {
                                    start: sh + (sm || 0) / 60,
                                    end: eh + (em || 0) / 60
                                };
                            }).sort((a, b) => a.start - b.start);

                            const emptyBlocks: { start: number, end: number }[] = [];
                            let current = startHour;

                            for (const interval of intervals) {
                                if (interval.start > current) {
                                    emptyBlocks.push({ start: current, end: Math.min(interval.start, endHour) });
                                }
                                current = Math.max(current, interval.end);
                            }
                            if (current < endHour) {
                                emptyBlocks.push({ start: current, end: endHour });
                            }

                            return emptyBlocks.map((block, i) => (
                                <div
                                    key={`empty-${i}`}
                                    className={classes.emptyBlock}
                                    style={{
                                        left: `${((block.start - startHour) / spanHours) * 100}%`,
                                        width: `${((block.end - block.start) / spanHours) * 100}%`
                                    }}
                                />
                            ));
                        })()
                    )}

                    {/* Live Time Playhead */}
                    {localStorage.getItem('cxmind:demo-mode') === 'true' && (
                        <div
                            style={{
                                position: 'absolute',
                                left: `${isWeek ? 4 * (100 / 7) + 5 : 40}%`, // Mock current time position
                                top: 0,
                                bottom: 0,
                                width: '2px',
                                backgroundColor: '#3b82f6', // blue-500
                                zIndex: 20,
                                pointerEvents: 'none'
                            }}
                        >
                            {/* Pulse dot at the top, only render on first row logically or let it bleed */}
                            <div style={{
                                position: 'absolute',
                                top: '-4px',
                                left: '-3px',
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: '#60a5fa',
                                boxShadow: '0 0 10px rgba(96, 165, 250, 0.8)'
                            }} />
                        </div>
                    )}

                    {/* Shift Blocks */}
                    {agentData.shifts
                        .filter(shift => isWeek || shift.date === format(currentDate, 'yyyy-MM-dd'))
                        .map(shift => {
                            if (isWeek) {
                                const shiftDate = new Date(shift.date);
                                let dayOfWeek = shiftDate.getDay();
                                const colIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

                                const leftPercent = (colIndex / 7) * 100;
                                const widthPercent = (1 / 7) * 100;
                                const isPast = localStorage.getItem('cxmind:demo-mode') === 'true' && colIndex < 4;
                                const isHistorical = shift.date < format(new Date(), 'yyyy-MM-dd');

                                return (
                                    <div
                                        key={shift._id}
                                        className={`${classes.shiftCardWeek} ${classes[`status-${shift.status}`]} ${isPast ? classes.pastShift : ''}`}
                                        style={{
                                            left: `${leftPercent + 0.2}%`,
                                            width: `${widthPercent - 0.4}%`,
                                            cursor: isHistorical ? 'default' : 'pointer',
                                            opacity: isHistorical ? 0.6 : undefined
                                        }}
                                        title={`${shift.startTime} - ${shift.endTime} (${shift.status})${isHistorical ? ' (Read-only)' : ''}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (!isHistorical && handleEditShift) handleEditShift(shift, agentData.name, agentData.sipExtension);
                                        }}
                                    >
                                        <span className={classes.shiftTimeTextWeek}>{shift.startTime} - {shift.endTime}</span>
                                    </div>
                                );
                            } else {
                                const hStart = parseInt(shift.startTime.split(':')[0] || '0');
                                const mStart = parseInt(shift.startTime.split(':')[1] || '0');
                                const hEnd = parseInt(shift.endTime.split(':')[0] || '0');
                                const mEnd = parseInt(shift.endTime.split(':')[1] || '0');

                                const startDecimal = Math.max(startHour, hStart + (mStart / 60));
                                let endDecimal = hEnd + (mEnd / 60);
                                if (endDecimal <= startDecimal) endDecimal += 24;
                                endDecimal = Math.min(endHour, endDecimal);

                                if (startDecimal >= endHour || endDecimal <= startHour) return null;

                                const leftPercent = ((startDecimal - startHour) / spanHours) * 100;
                                const widthPercent = ((endDecimal - startDecimal) / spanHours) * 100;
                                const isPast = localStorage.getItem('cxmind:demo-mode') === 'true' && endDecimal <= startHour + spanHours * 0.4;
                                const isHistorical = shift.date < format(new Date(), 'yyyy-MM-dd');

                                return (
                                    <div
                                        key={shift._id}
                                        className={`${classes.shiftBlock} ${classes[`status-${shift.status}`]} ${isPast ? classes.pastShift : ''}`}
                                        style={{
                                            left: `${leftPercent + 0.2}%`,
                                            width: `${widthPercent - 0.4}%`,
                                            cursor: isHistorical ? 'default' : 'pointer',
                                            opacity: isHistorical ? 0.6 : undefined
                                        }}
                                        title={`${shift.startTime} - ${shift.endTime} (${shift.status})${isHistorical ? ' (Read-only)' : ''}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (!isHistorical && handleEditShift) handleEditShift(shift, agentData.name, agentData.sipExtension);
                                        }}
                                    >
                                        <div className={classes.shiftTimeText}>
                                            {shift.startTime} - {shift.endTime}
                                        </div>
                                    </div>
                                );
                            }
                        })}
                </div>
            </div>
        </div>
    );
};

const WfmSchedule: React.FC = () => {
    const { t } = useTranslation();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
    const [hideInactive, setHideInactive] = useState(false);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [forecast, setForecast] = useState<ForecastPoint[]>([]);
    const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
    const [loading, setLoading] = useState(false);

    // AI & What-If States
    const [surgeMultiplier, setSurgeMultiplier] = useState(0);
    const [showBurnout, setShowBurnout] = useState(false);

    // AI Onboarding & Region State
    const [countryCode, setCountryCode] = useState('US');
    const [aiGenerating, setAiGenerating] = useState(false);
    const [benchmark, setBenchmark] = useState<'b2b' | 'ecommerce' | '24_7'>('ecommerce');
    const [volume, setVolume] = useState<number>(500);
    const [fillModalData, setFillModalData] = useState<{ timeStr: string, variance: number } | null>(null);
    const [showAddShift, setShowAddShift] = useState(false);
    const [shiftToDelete, setShiftToDelete] = useState<string | null>(null);

    // Agent Picker states
    const [availableAgents, setAvailableAgents] = useState<any[]>([]);
    const [agentSearch, setAgentSearch] = useState('');
    const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
    const [shiftDirty, setShiftDirty] = useState(false);
    const [showShiftDiscard, setShowShiftDiscard] = useState(false);
    const agentDropdownRef = useRef<HTMLDivElement>(null);
    const [newShiftForm, setNewShiftForm] = useState({ _id: '', agentId: '', agentDisplayName: '', agentSipNumber: '', date: format(currentDate, 'yyyy-MM-dd'), startTime: '09:00', endTime: '17:00' });

    // Scroll Sync Refs
    const heatmapScrollRef = useRef<HTMLDivElement>(null);
    const rosterScrollRef = useRef<HTMLDivElement>(null);

    const handleHeatmapScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (rosterScrollRef.current) {
            rosterScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }
    };

    const handleRosterScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (heatmapScrollRef.current) {
            heatmapScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }
    };

    const handleEditShift = (shift: any, agentName: string, agentExt: string) => {
        let agentIdStr = '';
        if (shift.agentId) {
            agentIdStr = typeof shift.agentId === 'object' ? shift.agentId._id : shift.agentId;
        }
        setNewShiftForm({
            _id: shift._id || '',
            agentId: agentIdStr,
            agentDisplayName: agentName,
            agentSipNumber: agentExt,
            date: shift.date || format(currentDate, 'yyyy-MM-dd'),
            startTime: shift.startTime || '09:00',
            endTime: shift.endTime || '17:00'
        });
        setShowAddShift(true);
        setShiftDirty(false);
        setShowShiftDiscard(false);
    };

    const handleAddShiftClick = () => {
        setNewShiftForm({ _id: '', agentId: '', agentDisplayName: '', agentSipNumber: '', date: format(currentDate, 'yyyy-MM-dd'), startTime: '09:00', endTime: '17:00' });
        setShowAddShift(true);
        setShiftDirty(false);
        setShowShiftDiscard(false);
    };

    const handleSaveShift = async () => {
        try {
            const isDemo = localStorage.getItem('cxmind:demo-mode') === 'true';
            const payload = { ...newShiftForm };

            if (newShiftForm._id) {
                await api.put(`/platform/wfm/shifts/${newShiftForm._id}`, payload);
            } else {
                const { _id, agentDisplayName, agentSipNumber, ...cleanPayload } = payload;
                await api.post('/platform/wfm/shifts', cleanPayload);
            }

            setShowAddShift(false);

            if (isDemo) {
                // Manually apply to local UI model so changes are seen instantly without real DB
                const updatedShifts = [...shifts];
                const matchedAgent = availableAgents.find(a => a._id === newShiftForm.agentId) || { _id: newShiftForm.agentId, displayName: `Agent ${newShiftForm.agentId.substring(0, 4)}`, sipNumber: '1000' };

                if (newShiftForm._id) {
                    const idx = updatedShifts.findIndex(s => s._id === newShiftForm._id);
                    if (idx > -1) {
                        updatedShifts[idx] = { ...updatedShifts[idx], ...newShiftForm, agentId: matchedAgent };
                    }
                } else {
                    updatedShifts.push({
                        ...newShiftForm,
                        _id: `shift-demo-new-${Date.now()}`,
                        status: 'published',
                        type: 'working',
                        agentId: matchedAgent
                    });
                }
                setShifts(updatedShifts);
            } else {
                // Perform a real refetch
                const startStr = format(viewMode === 'week' ? startOfWeek(currentDate, { weekStartsOn: 1 }) : currentDate, 'yyyy-MM-dd');
                const endStr = format(viewMode === 'week' ? addDays(startOfWeek(currentDate, { weekStartsOn: 1 }), 6) : currentDate, 'yyyy-MM-dd');
                const shiftsRes = await api.get(`/platform/wfm/shifts?startDate=${startStr}&endDate=${endStr}`);
                setShifts(shiftsRes.data.data);
            }
        } catch (error: any) {
            console.error('Failed to save shift', error);
            alert(error.response?.data?.error || error.message || 'Failed to save shift');
        }
    };

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (agentDropdownRef.current && !agentDropdownRef.current.contains(e.target as Node)) {
                setAgentDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Load data
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                // Determine date range based on view mode
                let start: Date;
                let end: Date;

                if (viewMode === 'day') {
                    start = currentDate;
                    end = currentDate;
                } else if (viewMode === 'week') {
                    start = startOfWeek(currentDate, { weekStartsOn: 1 });
                    end = addDays(start, 6);
                } else {
                    // month view
                    start = startOfWeek(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1), { weekStartsOn: 1 });
                    end = addDays(start, 34);
                }

                const startStr = format(start, 'yyyy-MM-dd');
                const endStr = format(end, 'yyyy-MM-dd');

                // 0. Demo Mode Check
                const isDemo = localStorage.getItem('cxmind:demo-mode') === 'true' ? '&demo=true' : '';

                // 1. Fetch Shifts
                const shiftsRes = await api.get(`/platform/wfm/shifts?startDate=${startStr}&endDate=${endStr}${isDemo}`);
                setShifts(shiftsRes.data.data);

                // 2. Fetch Forecast
                if (viewMode === 'day') {
                    const forecastDateStr = format(currentDate, 'yyyy-MM-dd');
                    const forecastRes = await api.get(`/platform/wfm/forecast?date=${forecastDateStr}&countryCode=${countryCode}${isDemo}`);
                    setForecast(forecastRes.data.data.map((f: any) => ({ ...f, label: f.time })));
                } else {
                    const forecastRes = await api.get(`/platform/wfm/forecast?startDate=${startStr}&endDate=${endStr}&countryCode=${countryCode}${isDemo}`);
                    setForecast(forecastRes.data.data);
                }

                // 2.5 Fetch Templates
                try {
                    const templatesRes = await api.get('/platform/wfm/templates');
                    let fetchedTemplates = templatesRes.data.data.filter((t: any) => t.status === 'active');

                    // Fallback for Demo Mode or Empty State
                    if (fetchedTemplates.length === 0 && (isDemo || true)) {
                        fetchedTemplates = [
                            { _id: 'demo-t1', name: 'Morning Shift', startTime: '08:00', endTime: '16:00', isNextDay: false, status: 'active' },
                            { _id: 'demo-t2', name: 'Evening Shift', startTime: '16:00', endTime: '00:00', isNextDay: false, status: 'active' },
                            { _id: 'demo-t3', name: 'Night Shift', startTime: '00:00', endTime: '08:00', isNextDay: false, status: 'active' }
                        ];
                    }

                    setTemplates(fetchedTemplates);
                } catch (e) {
                    console.error("Templates load error", e);
                }

                // 3. Fetch Agents for Picker
                try {
                    // Always try to dynamically build agents from the loaded shifts first as a fallback layer
                    const uniqueAgents = new Map();
                    if (shiftsRes.data && shiftsRes.data.data) {
                        shiftsRes.data.data.forEach((s: any) => {
                            const user = s.agentId || {};
                            if (user._id && !uniqueAgents.has(user._id)) {
                                uniqueAgents.set(user._id, { _id: user._id, sipNumber: user.sipNumber || user.agentId?.sipNumber || 'Unknown Ext', displayName: user.displayName || 'Unknown Agent' });
                            }
                        });
                    }

                    if (localStorage.getItem('cxmind:demo-mode') === 'true') {
                        setAvailableAgents(Array.from(uniqueAgents.values()));
                    } else {
                        // Fetch all telephony lines. For agents that are bound to a User account, we must
                        // use the User._id as the usableId because WFM Shifts map to Users. 
                        // For pure telephony extensions without a User, we fallback to the Agent._id.
                        const agentsRes = await api.get('/client/agents?limit=1000');
                        const apiAgents = agentsRes.data.data || [];
                        apiAgents.forEach((a: any) => {
                            const dispName = a.boundUser?.displayName || a.displayName || `Agent ${a.sipNumber || 'Unknown'}`;
                            const ext = a.sipNumber || 'Unknown Ext';
                            const usableId = (a.boundUser && a.boundUser._id) ? a.boundUser._id : a._id;
                            uniqueAgents.set(usableId, { _id: usableId, sipNumber: ext, displayName: dispName });
                        });
                        setAvailableAgents(Array.from(uniqueAgents.values()));
                    }
                } catch (e) {
                    console.error("Agent load error", e);
                }

            } catch (err) {
                console.error("Failed to load WFM schedule data", err);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [currentDate, viewMode, countryCode, aiGenerating]); // re-fetch when aiGenerating finishes

    const handleAiGenerate = async () => {
        setAiGenerating(true);
        try {
            const start = viewMode === 'week' ? startOfWeek(currentDate, { weekStartsOn: 1 }) : currentDate;
            const end = viewMode === 'week' ? addDays(start, 6) : currentDate;

            await api.post('/platform/wfm/schedules/ai-generate', {
                startDate: format(start, 'yyyy-MM-dd'),
                endDate: format(end, 'yyyy-MM-dd'),
                countryCode,
                industryBenchmark: benchmark,
                dailyVolume: volume
            });
            // We don't unset aiGenerating here, it will be done after reload or in finally
        } catch (err) {
            console.error('Failed to auto-generate', err);
        } finally {
            setAiGenerating(false);
        }
    };

    const handlePrev = () => {
        setCurrentDate(prev => viewMode === 'week' ? subWeeks(prev, 1) : addDays(prev, -1));
    };

    const handleNext = () => {
        setCurrentDate(prev => viewMode === 'week' ? addWeeks(prev, 1) : addDays(prev, 1));
    };

    // --- PRE-COMPUTE ACTIVE HOURS ---
    let startHour = 0;
    let endHour = 24;

    // Pre-calculate staffed counts first so we can use it to determine "active" hours
    const preStaffedCounts = forecast.map((f) => {
        if (viewMode === 'day') {
            const hourDecimal = parseInt(f.time.split(':')[0]) + parseInt(f.time.split(':')[1]) / 60;
            return shifts.filter(s => {
                if (s.date !== format(currentDate, 'yyyy-MM-dd')) return false;
                const sh = parseInt(s.startTime.split(':')[0]) + parseInt(s.startTime.split(':')[1]) / 60;
                let eh = parseInt(s.endTime.split(':')[0]) + parseInt(s.endTime.split(':')[1]) / 60;
                if (eh <= sh) eh += 24;
                return hourDecimal >= sh && hourDecimal < eh;
            }).length;
        }
        return 0; // Week mode handles it differently
    });

    if (viewMode === 'day' && hideInactive) {
        let earliest = 24;
        let latest = -1;

        // An hour is "active" if it either has staffed agents, OR the required agents are realistically high (>2), 
        // to avoid keeping night hours active just because the baseline formula returns 1 or 2 req agents.
        forecast.forEach((f, i) => {
            if (preStaffedCounts[i] > 0 || f.requiredAgents > 2) {
                const h = parseInt(f.time.split(':')[0] || '0');
                if (h < earliest) earliest = h;
                if (h > latest) latest = h;
            }
        });

        if (earliest <= latest) {
            startHour = Math.max(0, earliest - 1); // 1 hour buffer before
            endHour = Math.min(24, latest + 2);    // 1 hour buffer after
        }
    }

    const spanHours = endHour - startHour;
    const displayForecast = viewMode === 'day' && hideInactive && forecast.length >= 24
        ? forecast.slice(startHour, endHour)
        : forecast;

    // Slice staffed counts to match the display forecast
    const staffedCounts = viewMode === 'day' && hideInactive && forecast.length >= 24
        ? preStaffedCounts.slice(startHour, endHour)
        : preStaffedCounts;

    const handleAiFillGap = (timeStr: string, variance: number) => {
        setFillModalData({ timeStr, variance });
    };

    const confirmAiFill = () => {
        setFillModalData(null);
    };

    // Check for Critical Staffing Alert
    const criticalGaps = viewMode === 'week' ? displayForecast.filter((f, i) => {
        const staffed = staffedCounts[i];
        const req = Math.ceil((f.requiredAgents || 0) * (1 + surgeMultiplier / 100));
        return req > 0 && (staffed - req) <= -15; // Threshold for critical macro gap
    }) : [];

    // --- RENDER HELPERS ---

    const renderForecastHeatmapRow = () => {
        if (!displayForecast || displayForecast.length === 0) return null;

        // Find max volume to scale the heatmap opacity
        const maxVol = Math.max(...displayForecast.map(f => f.predictedVolume), 1);

        // 周视图的staffed统计 (日视图从slice预算好了)
        let weekStaffedCounts: number[] = [];
        if (viewMode === 'week') {
            weekStaffedCounts = displayForecast.map((f) => {
                const targetDate = f.time; // yyyy-MM-dd
                return shifts.filter(s => s.date === targetDate).length;
            });
        }

        const actualStaffedCounts = viewMode === 'week' ? weekStaffedCounts : staffedCounts;

        return (
            <div className={classes.heatmapContainer} ref={heatmapScrollRef} onScroll={handleHeatmapScroll}>
                {/* Row 1: Forecast Volume */}
                <div className={classes.heatmapRow} style={{ borderBottom: 'none', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
                    <div className={classes.timeLabel} style={{ borderBottom: '1px solid var(--border-color)' }}>{t('wfm.forecast')}</div>
                    <div className={classes.heatmapGrid}>
                        {displayForecast.map((f: any, i) => {
                            const isPast = localStorage.getItem('cxmind:demo-mode') === 'true' && i < displayForecast.length * 0.4;
                            const predicted = Math.round(f.predictedVolume * (1 + surgeMultiplier / 100));
                            // Generate an 'actual' volume that is somewhat divergent from predicted.
                            const actual = isPast ? Math.round(predicted * (0.8 + (Math.sin(i) * 0.35))) : null;
                            const actualExceeds = (actual || 0) > predicted * 1.1;

                            const primaryDisplay = isPast ? actual : predicted;
                            const intensity = maxVol > 0 ? (primaryDisplay || 0) / maxVol : 0;
                            const isHigh = intensity > 0.7;

                            return (
                                <div
                                    key={i}
                                    className={classes.heatCell}
                                    style={{
                                        backgroundColor: isHigh ? `rgba(239, 68, 68, ${intensity * 0.25})` : `rgba(6, 182, 212, ${intensity * 0.15})`,
                                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                        position: 'relative'
                                    }}
                                    title={`${f.label || f.time} - Forecast: ${predicted} ${isPast ? `| Actual: ${actual}` : ''}`}
                                >
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
                                        {viewMode === 'day' ? f.time.substring(0, 5) : f.label}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                        <span className={classes.forecastNumber} style={{ color: isPast ? (actualExceeds ? '#ef4444' : '#10b981') : 'var(--text-primary)' }}>{primaryDisplay}</span>
                                        {isPast && actualExceeds && <Activity size={12} color="#ef4444" />}
                                    </div>
                                    {isPast && (
                                        <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textDecoration: 'line-through', marginTop: '-2px' }}>
                                            {predicted}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Row 2: Net Staffing Variance Heatmap */}
                <div className={classes.heatmapRow} style={{ borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0, backgroundColor: 'var(--bg-secondary)' }}>
                    <div className={classes.timeLabel} style={{ fontWeight: 'normal', color: 'var(--text-secondary)', padding: '0.5rem 1rem' }}>{t('wfm.netStaffing')}</div>
                    <div className={classes.heatmapGrid}>
                        {displayForecast.map((f: any, i) => {
                            const staffed = actualStaffedCounts[i];
                            const req = Math.ceil((f.requiredAgents || 0) * (1 + surgeMultiplier / 100));
                            const variance = staffed - req;

                            let bgColor = 'transparent';
                            let valColor = 'var(--text-primary)';

                            if (req > 0) {
                                if (variance < 0) {
                                    // Understaffed: red intensity based on % gap
                                    const intensity = Math.min(Math.abs(variance) / req, 1);
                                    bgColor = `rgba(239, 68, 68, ${0.1 + intensity * 0.4})`;
                                    valColor = '#ef4444'; // red-500
                                } else if (variance > 0) {
                                    // Overstaffed: slight green
                                    bgColor = 'rgba(16, 185, 129, 0.15)';
                                    valColor = '#10b981'; // green-500
                                } else {
                                    // Perfect staffing
                                    bgColor = 'rgba(16, 185, 129, 0.3)';
                                    valColor = '#10b981';
                                }
                            } else if (staffed > 0) {
                                // Staffed when req is 0: amber
                                bgColor = 'rgba(245, 158, 11, 0.15)';
                                valColor = '#f59e0b'; // amber-500
                            }

                            const varianceText = variance > 0 ? `+${variance}` : variance.toString();

                            return (
                                <div
                                    key={i}
                                    className={classes.heatCell}
                                    style={{
                                        backgroundColor: bgColor,
                                        padding: '0.4rem 0',
                                        borderBottom: variance < 0 ? '2px solid #ef4444' : '2px solid transparent'
                                    }}
                                    title={`Peak Agents Req: ${req}, Currently Staffed: ${staffed}, Variance: ${variance}`}
                                >
                                    <span style={{ fontSize: '1.125rem', fontWeight: 700, color: valColor, marginBottom: '2px', lineHeight: 1 }}>
                                        {varianceText}
                                    </span>
                                    <span className={classes.staffingRatio} style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 500, transition: 'opacity 0.2s' }}>
                                        {staffed} / {req}
                                    </span>
                                    {variance < 0 && viewMode === 'day' && (
                                        <Button
                                            className={classes.aiFillBtn}
                                            title="Click to AI Auto-fill this gap"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleAiFillGap(f.time || f.label, Math.abs(variance));
                                            }}
                                        >
                                            <Sparkles size={12} strokeWidth={2.5} /> <span style={{ marginLeft: '4px' }}>{t('wfm.fill')}</span>
                                        </Button>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        )
    }

    const renderScheduleGrid = () => {
        // Group shifts by Agent
        const shiftsByAgent = shifts.reduce((acc, shift) => {
            const user = shift.agentId || {};
            const id = user._id || user;
            const name = user.displayName || 'Unknown Agent';
            const sipExtension = user.agentId?.sipNumber || user.sipNumber || '';
            if (!acc[id]) {
                const extNum = parseInt(sipExtension.replace(/\D/g, '') || '0');
                let sum = 0;
                for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
                const seed = extNum > 0 ? extNum : sum;

                const isDemo = localStorage.getItem('cxmind:demo-mode') === 'true';

                const burnoutScore = isDemo ? (seed * 37) % 100 : 0;
                const adherenceStreak = isDemo ? (seed * 13) % 6 : 0;
                // Use Dicebear's Micah style for premium, modern, diverse vector faces
                const avatarUrl = isDemo ? `https://api.dicebear.com/9.x/micah/svg?seed=${encodeURIComponent(name)}&backgroundColor=transparent` : '';
                const trend = isDemo ? Array.from({ length: 7 }, (_, i) => Math.floor(((seed * (i + 1) * 17) % 30) + 70)) : [];

                acc[id] = { name, sipExtension, shifts: [], burnoutScore, adherenceStreak, avatarUrl, trend };
            }
            acc[id].shifts.push(shift);
            return acc;
        }, {} as Record<string, { name: string, sipExtension: string, burnoutScore: number, adherenceStreak: number, avatarUrl: string, trend: number[], shifts: Shift[] }>);

        const isWeek = viewMode === 'week';
        const columns = isWeek
            ? Array.from({ length: 7 }).map((_, i) => format(addDays(startOfWeek(currentDate, { weekStartsOn: 1 }), i), 'eee MM/dd'))
            : Array.from({ length: spanHours }).map((_, i) => `${(startHour + i).toString().padStart(2, '0')}:00`);

        return (
            <div className={classes.scheduleGridContainer} ref={rosterScrollRef} onScroll={handleRosterScroll}>
                {/* Time/Day Header */}
                <div className={classes.timeHeaderRow}>
                    <div className={classes.agentLabelHeader}>{t('wfm.agent')}</div>
                    <div className={classes.hoursGridHeader}>
                        {columns.map(lbl => <div key={lbl} className={classes.hourTick}>{lbl}</div>)}
                    </div>
                </div>

                {/* Agent Rows */}
                <div style={{ flex: 1, minWidth: 'max-content' }}>
                    {Object.values(shiftsByAgent).map((_, index) => (
                        <AgentRow
                            key={index}
                            index={index}
                            data={{
                                agentList: Object.values(shiftsByAgent),
                                isWeek,
                                startHour,
                                endHour,
                                spanHours,
                                currentDate,
                                showBurnout,
                                handleEditShift
                            }}
                        />
                    ))}
                </div>
            </div>
        )
    };

    const renderMonthView = () => {
        const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const gridStart = startOfWeek(firstDayOfMonth, { weekStartsOn: 1 });
        const isDemo = localStorage.getItem('cxmind:demo-mode') === 'true';

        // Generate a 35-cell grid (5 weeks * 7 days) for the macro view
        const days = Array.from({ length: 35 }, (_, i) => {
            const date = addDays(gridStart, i);
            const dateStr = format(date, 'yyyy-MM-dd');
            const isCurrentMonth = date.getMonth() === currentDate.getMonth();

            let predicted = 0;
            let staffed = 0;

            if (isDemo) {
                predicted = Math.floor(1000 + Math.random() * 500);
                staffed = Math.floor(predicted * (0.8 + Math.random() * 0.3));
            } else {
                const forecastDay = forecast.find(f => f.time === dateStr);
                if (forecastDay) {
                    predicted = forecastDay.predictedVolume || 0;
                }
                const dateShifts = shifts.filter(s => s.date === dateStr);
                staffed = dateShifts.length;
            }

            const variance = staffed - (predicted ? Math.ceil(predicted / 10) : 0);

            return { date, isCurrentMonth, predicted, variance, staffed };
        });

        return (
            <div className={classes.monthGrid}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className={classes.monthHeaderCell}>{t(`common.day.${d}`, d)}</div>)}

                {days.map((day, i) => (
                    <div key={i} className={`${classes.monthCell} ${!day.isCurrentMonth ? classes.outOfMonth : ''}`}>
                        <div className={classes.monthDate}>{format(day.date, 'MMM d')}</div>
                        {day.isCurrentMonth && (
                            <div className={classes.monthMetrics}>
                                <div className={classes.monthMetricItem} style={{ color: day.variance < -50 ? '#ef4444' : (day.variance > 0 ? '#10b981' : 'var(--text-secondary)') }}>
                                    <Activity size={12} /> {day.variance > 0 ? '+' : ''}{day.variance} {t('wfm.net', 'Net')}
                                </div>
                                <div className={classes.monthMetricItem}>{t('wfm.vol', 'Vol')}: {day.predicted}</div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className={classes.scheduleContainer}>
            {/* Toolbar */}
            <div className={classes.toolbar}>
                <div className={classes.dateNavigation}>
                    <Button className="-icon" onClick={handlePrev} variant="ghost" size="icon"><ChevronLeft size={18} /></Button>
                    <h2>
                        {viewMode === 'week'
                            ? t('wfm.weekOf', 'Week of {{date}}', { date: format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd') })
                            : viewMode === 'month'
                                ? format(currentDate, 'yyyy-MM')
                                : format(currentDate, 'yyyy-MM-dd')
                        }
                    </h2>
                    <Button className="-icon" onClick={handleNext} variant="ghost" size="icon"><ChevronRight size={18} /></Button>
                    <Button
                        onClick={() => setCurrentDate(new Date())}
                        style={{ marginLeft: '12px', padding: '0.35rem 0.8rem', fontSize: '0.85rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        title="Jump to Today"
                    >
                        {t('wfm.today')}
                    </Button>
                </div>

                <div className={classes.toolbarActions}>
                    <div className={classes.segmentControl}>
                        <Button
                            className={`${classes.segmentBtn} ${viewMode === 'day' ? classes.active : ''}`}
                            onClick={() => setViewMode('day')}
                        >
                            {t('wfm.day')}
                        </Button>
                        <Button
                            className={`${classes.segmentBtn} ${viewMode === 'week' ? classes.active : ''}`}
                            onClick={() => setViewMode('week')}
                        >
                            {t('wfm.week')}
                        </Button>
                        <Button
                            className={`${classes.segmentBtn} ${viewMode === 'month' ? classes.active : ''}`}
                            onClick={() => setViewMode('month')}
                        >
                            {t('wfm.month')}
                        </Button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 8px' }}>
                        <Globe size={16} style={{ color: 'var(--text-secondary)' }} />
                        <Select
                            value={countryCode}
                            onChange={(e) => setCountryCode(e.target.value)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }}
                        >
                            <option value="US">🇺🇸 US</option>
                            <option value="GB">🇬🇧 GB</option>
                            <option value="JP">🇯🇵 JP</option>
                            <option value="IN">🇮🇳 IN</option>
                            <option value="PH">🇵🇭 PH</option>
                            <option value="CN">🇨🇳 CN</option>
                        </Select>
                    </div>
                    {viewMode === 'day' && (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 8px', borderLeft: '1px solid var(--border-color)' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                    <Checkbox checked={hideInactive} onChange={(e) => setHideInactive(e.target.checked)} />
                                    {t('wfm.hideInactive')}
                                </label>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 8px', borderLeft: '1px solid var(--border-color)' }}>
                                <Button
                                    onClick={() => setShowBurnout(!showBurnout)}
                                    style={{
                                        background: showBurnout ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                                        border: showBurnout ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid transparent',
                                        color: showBurnout ? '#ef4444' : 'var(--text-secondary)',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        cursor: 'pointer',
                                        fontSize: '0.875rem',
                                        fontWeight: 500,
                                        transition: 'all 0.2s'
                                    }}
                                    title="Highlight agents at risk of burnout"
                                >
                                    <Activity size={16} /> {t('wfm.burnoutRadar')}
                                </Button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 8px', borderLeft: '1px solid var(--border-color)', width: '200px' }}>
                                <span style={{ fontSize: '0.75rem', color: surgeMultiplier > 0 ? '#ef4444' : 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap', minWidth: '85px' }}>
                                    What-If: +{surgeMultiplier}%
                                </span>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="10"
                                    value={surgeMultiplier}
                                    onChange={(e) => setSurgeMultiplier(parseInt(e.target.value))}
                                    style={{ width: '100%', accentColor: surgeMultiplier > 0 ? '#ef4444' : 'var(--brand-cyan)' }}
                                    title="Simulate sudden traffic surge"
                                />
                            </div>
                        </>
                    )}
                    <Button style={{ padding: '0.45rem 1rem' }} onClick={handleAddShiftClick}>
                        <Plus size={16} /> {t('wfm.addShift')}
                    </Button>
                </div>
            </div>

            {criticalGaps.length > 0 && viewMode === 'week' && (
                <div className={classes.criticalAlertBanner}>
                    <div className={classes.alertIcon}><Flame size={18} /></div>
                    <div className={classes.alertContent}>
                        <strong>{t('wfm.criticalAlert')}</strong> {t('wfm.criticalAlertMsg', { count: criticalGaps.length })}
                    </div>
                    <Button className={classes.alertResolveBtn} onClick={() => setFillModalData({ timeStr: 'This Week', variance: criticalGaps.length * 20 })}>
                        {t('wfm.autoResolveAll')}
                    </Button>
                </div>
            )}

            {loading ? (
                <div className={classes.loadingState}>{t('wfm.loadingSchedule')}</div>
            ) : (
                <div className={classes.scrollableContent}>
                    {/* Activity Heatmap Layer */}
                    <div className={classes.heatmapContainer}>
                        <h3 className={classes.sectionTitle}>{viewMode === 'week' ? t('wfm.volumeForecastDaily') : t('wfm.volumeForecastHourly')}</h3>
                        {renderForecastHeatmapRow()}
                    </div>

                    {/* Main Schedule Grid Layer */}
                    <div className={classes.rosterContainer}>
                        <h3 className={classes.sectionTitle}>{viewMode === 'month' ? t('wfm.monthlyMacro') : t('wfm.agentRoster')}</h3>
                        {shifts.length > 0 ? (
                            viewMode === 'month' ? renderMonthView() : renderScheduleGrid()
                        ) : (
                            <div className={classes.emptyStateAI}>
                                <div className={classes.aiIconWrapper}>
                                    <Sparkles size={32} />
                                </div>
                                <h3 className={classes.aiTitle}>{t('wfm.zeroTouchTitle')}</h3>
                                <p className={classes.aiDescription}>
                                    {t('wfm.noShiftsScheduled', 'No shifts scheduled. Let CXMind AI build an optimal schedule based on industry benchmarks and regional holidays for {{country}}.', { country: countryCode })}
                                </p>

                                <div className={classes.aiOnboardingCard}>
                                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                                        <div className={classes.formGroup} style={{ flex: 2, marginBottom: 0 }}>
                                            <label>{t('wfm.industryPattern')}</label>
                                            <Select
                                                value={benchmark}
                                                onChange={e => setBenchmark(e.target.value as any)}
                                                className="input-field"
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <option value="b2b">{t('wfm.b2b')}</option>
                                                <option value="ecommerce">{t('wfm.ecommerce')}</option>
                                                <option value="24_7">{t('wfm.support247')}</option>
                                            </Select>
                                        </div>
                                        <div className={classes.formGroup} style={{ flex: 1, marginBottom: 0 }}>
                                            <label>{t('wfm.dailyCalls')}</label>
                                            <Input
                                                type="number"
                                                value={volume}
                                                onChange={(e: any) => setVolume(parseInt(e.target.value))}
                                                min={0} step={100}
                                            />
                                        </div>
                                    </div>
                                    <Button className="- w-full justify-center"
                                        style={{ padding: '0.65rem', fontWeight: 600, letterSpacing: '0.5px' }}
                                        onClick={handleAiGenerate}
                                        disabled={aiGenerating}
                                    >
                                        <Sparkles size={16} />
                                        {aiGenerating ? t('wfm.generating') : t('wfm.autoGenerate')}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* AI Auto-Fill Modal */}
            <GlassModal
                open={!!fillModalData}
                onOpenChange={(open: boolean) => { if (!open) setFillModalData(null); }}
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={20} color="var(--brand-cyan, #00f0ff)" />
                        <span>{t('wfm.intelligentReassignment')}</span>
                    </div>
                }
            >
                {fillModalData && (
                    <div>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
                            {t('wfm.gapDesc1', 'Detected a critical gap of ')}<strong style={{ color: 'var(--text-primary)' }}>{fillModalData.variance} {t('common.agents', 'agents')}</strong> {t('wfm.gapDesc2', 'at')} <strong style={{ color: 'var(--text-primary)' }}>{fillModalData.timeStr}</strong>.
                        </p>
                        <div className={classes.aiStrategyCard}>
                            <h4>{t('wfm.strategyA')}</h4>
                            <p>{t('wfm.strategyADesc')}</p>
                            <Button onClick={confirmAiFill} style={{ width: '100%', marginTop: '10px' }}>{t('wfm.applyA')}</Button>
                        </div>
                        <div className={classes.aiStrategyCard} style={{ marginTop: '12px' }}>
                            <h4>{t('wfm.strategyB')}</h4>
                            <p>{t('wfm.strategyBDesc')}</p>
                            <Button onClick={confirmAiFill} style={{ width: '100%', marginTop: '10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>{t('wfm.dispatchBounties')}</Button>
                        </div>
                    </div>
                )}
            </GlassModal>

            {/* Add/Edit Shift Modal */}
            <GlassModal
                open={showAddShift}
                onOpenChange={(v) => { if (!v) { setShowAddShift(false); setShiftDirty(false); } }}
                isDirty={shiftDirty}
                onCloseAttempt={() => { if (shiftDirty) setShowShiftDiscard(true); else { setShowAddShift(false); setShiftDirty(false); } }}
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Plus size={20} color="var(--brand-cyan, #00f0ff)" />
                        <span>{newShiftForm._id ? t('wfm.editShift') : t('wfm.createShift')}</span>
                    </div>
                }
            >
                <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    {newShiftForm._id ? t('wfm.editShiftDesc') : t('wfm.createShiftDesc')}
                </p>
                <div className={classes.formGroup}>
                    <label>{t('wfm.agent')}</label>
                    <div ref={agentDropdownRef} style={{ position: 'relative' }}>
                        {newShiftForm.agentId ? (
                            <div style={{
                                padding: '0.65rem 0.8rem', borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)',
                                color: 'var(--text-primary)', width: '100%',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                cursor: 'pointer'
                            }}>
                                <span>
                                    {(() => {
                                        const agent = availableAgents.find(a => a._id === newShiftForm.agentId);
                                        const name = agent?.displayName || newShiftForm.agentDisplayName;
                                        const ext = agent?.sipNumber || newShiftForm.agentSipNumber;
                                        if (name && ext) return `${name} (EXT: ${ext})`;
                                        if (name) return name;
                                        if (ext) return `EXT: ${ext}`;
                                        if (typeof newShiftForm.agentId === 'string' && newShiftForm.agentId.includes('u_demo_')) {
                                            return `Test Agent ${newShiftForm.agentId.replace('u_demo_100', '')}`;
                                        }
                                        return String(newShiftForm.agentId);
                                    })()}
                                </span>
                                <Button type="button" onClick={() => { setNewShiftForm({ ...newShiftForm, agentId: '' }); setAgentSearch(''); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem' }}>
                                    ✕
                                </Button>
                            </div>
                        ) : (
                            <Input
                                placeholder={t('wfm.searchAgent')}
                                value={agentSearch}
                                onChange={(e: any) => { setAgentSearch(e.target.value); setAgentDropdownOpen(true); setShiftDirty(true); }}
                                onFocus={() => setAgentDropdownOpen(true)}
                            />
                        )}
                        {agentDropdownOpen && !newShiftForm.agentId && (
                            <div style={{
                                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                                maxHeight: '160px', overflowY: 'auto',
                                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                marginTop: '4px'
                            }}>
                                {availableAgents.filter(a => (a.displayName || '').toLowerCase().includes(agentSearch.toLowerCase()) || (a.sipNumber || '').toLowerCase().includes(agentSearch.toLowerCase())).length === 0 && (
                                    <div style={{ padding: '0.65rem 0.8rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                        {t('wfm.noAgentsFound')}
                                    </div>
                                )}
                                {availableAgents.filter(a => (a.displayName || '').toLowerCase().includes(agentSearch.toLowerCase()) || (a.sipNumber || '').toLowerCase().includes(agentSearch.toLowerCase())).map(agent => (
                                    <div
                                        key={agent._id}
                                        style={{
                                            padding: '0.65rem 0.8rem', cursor: 'pointer',
                                            borderBottom: '1px solid var(--border-color)'
                                        }}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            setNewShiftForm({ ...newShiftForm, agentId: agent._id });
                                            setAgentSearch('');
                                            setAgentDropdownOpen(false);
                                        }}
                                    >
                                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{agent.displayName || agent.sipNumber}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>EXT: {agent.sipNumber}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className={classes.formGroup} style={{ marginTop: '12px' }}>
                    <label>{t('wfm.date')}</label>
                    <DatePicker

                        value={newShiftForm.date}
                        min={format(new Date(), 'yyyy-MM-dd')}
                        onChange={(e: any) => { setNewShiftForm({ ...newShiftForm, date: e.target.value }); setShiftDirty(true); }}
                        style={{ width: '100%' }}
                    />
                </div>

                {templates.length > 0 && !newShiftForm._id && (
                    <div style={{ marginTop: '16px' }}>
                        <label style={{ fontSize: '0.875rem', marginBottom: '8px', display: 'block' }}>{t('wfm.quickTemplates', 'Quick Templates')}</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {templates.map(tpl => (
                                <Button
                                    key={tpl._id}
                                    onClick={() => setNewShiftForm({ ...newShiftForm, startTime: tpl.startTime, endTime: tpl.endTime })}
                                    style={{
                                        padding: '4px 10px',
                                        fontSize: '0.8rem',
                                        background: 'var(--bg-tertiary)',
                                        border: '1px solid var(--border-color)',
                                        color: 'var(--brand-cyan)'
                                    }}
                                >
                                    {tpl.name} ({tpl.startTime}-{tpl.endTime})
                                </Button>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                    <div className={classes.formGroup} style={{ flex: 1 }}>
                        <label>{t('wfm.startTime')}</label>
                        <Input type="time" value={newShiftForm.startTime} onChange={(e: any) => { setNewShiftForm({ ...newShiftForm, startTime: e.target.value }); setShiftDirty(true); }} style={{ width: '100%' }} />
                    </div>
                    <div className={classes.formGroup} style={{ flex: 1 }}>
                        <label>{t('wfm.endTime')}</label>
                        <Input type="time" value={newShiftForm.endTime} onChange={(e: any) => { setNewShiftForm({ ...newShiftForm, endTime: e.target.value }); setShiftDirty(true); }} style={{ width: '100%' }} />
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                    {newShiftForm._id && (
                        <Button
                            onClick={() => setShiftToDelete(newShiftForm._id)}
                            style={{
                                flex: 1,
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                color: '#ef4444'
                            }}
                        >
                            {t('wfm.delete')}
                        </Button>
                    )}
                    <Button
                        onClick={handleSaveShift}
                        disabled={!newShiftForm.agentId}
                        style={{ flex: 1, opacity: !newShiftForm.agentId ? 0.5 : 1 }}
                    >
                        {t('wfm.saveShiftBlock')}
                    </Button>
                </div>
            </GlassModal>

            <ConfirmModal
                open={showShiftDiscard}
                onClose={() => setShowShiftDiscard(false)}
                onConfirm={() => { setShowShiftDiscard(false); setShowAddShift(false); setShiftDirty(false); }}
                title={t('common.discardChangesTitle', 'Discard unsaved changes?')}
                description={t('common.discardChangesDesc', 'You have unsaved changes. Are you sure you want to discard them?')}
                confirmText={t('common.discard', 'Discard')}
                cancelText={t('common.cancel', 'Cancel')}
            />

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                open={!!shiftToDelete}
                onClose={() => setShiftToDelete(null)}
                onConfirm={async () => {
                    try {
                        if (localStorage.getItem('cxmind:demo-mode') === 'true') {
                            setShifts(shifts.filter(s => s._id !== shiftToDelete));
                        } else {
                            await api.delete(`/platform/wfm/shifts/${shiftToDelete}`);
                            setShifts(shifts.filter(s => s._id !== shiftToDelete));
                        }
                        setShowAddShift(false);
                    } catch (error: any) {
                        alert(error.response?.data?.error || error.message || 'Failed to delete shift');
                    }
                }}
                title={t('wfm.deleteShift')}
                description={t('wfm.deleteShiftDesc')}
                confirmText={t('wfm.confirmDelete')}
            />
        </div>
    );
};

export default WfmSchedule;
