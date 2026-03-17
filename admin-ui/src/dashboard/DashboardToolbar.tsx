import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Check, RotateCcw, Plus, X, Eye, EyeOff, LayoutGrid, Download, Trash2, Loader2, Copy, ChevronDown } from 'lucide-react';
import { WIDGET_REGISTRY } from './widget-registry';
import { GlassModal } from '../components/ui/GlassModal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import type { WidgetCategory, DashboardView } from './types';
import { useDashboardCore } from './DashboardContext';
import { MotionButton } from '../components/ui/MotionButton';
import { SoundService } from '../services/audio/SoundService';
import { useModules } from '../context/ModuleContext';
import { GroupSelector } from '../components/ui/GroupSelector';
import api from '../services/api';
import { copyToClipboard } from '../utils/clipboard';

interface DashboardToolbarProps {
    editMode: boolean;
    onToggleEdit: () => void;
    onReset: () => void;
    onAutoArrange: () => void;
    activeWidgetIds: string[];
    onAddWidget: (id: string) => void;
    // View management
    views: DashboardView[];
    activeViewId: string;
    onSwitchView: (id: string) => void;
    onCreateView: (name: string) => void;
    onDeleteView: (id: string) => void;
    onRenameView: (id: string, name: string) => void;
}

const CATEGORY_LABEL_KEYS: Record<WidgetCategory, { key: string; fallback: string }> = {
    stat: { key: 'dashboard.categories.stat', fallback: 'Statistics' },
    chart: { key: 'dashboard.categories.chart', fallback: 'Charts' },
    table: { key: 'dashboard.categories.table', fallback: 'Tables' },
    map: { key: 'dashboard.categories.map', fallback: 'Maps' },
    card: { key: 'dashboard.categories.card', fallback: 'Cards' },
};

const DashboardToolbar: React.FC<DashboardToolbarProps> = ({
    editMode, onToggleEdit, onReset, onAutoArrange, activeWidgetIds, onAddWidget,
    views, activeViewId, onSwitchView, onCreateView, onDeleteView, onRenameView,
}) => {
    const { t } = useTranslation();
    const [pickerOpen, setPickerOpen] = useState(false);
    const { demoMode, setDemoMode, groupIds, setGroupIds, refreshAll } = useDashboardCore();
    const { isModuleEnabled } = useModules();
    const [demoLoading, setDemoLoading] = useState<'seed' | 'clear' | null>(null);
    const [demoStatus, setDemoStatus] = useState<string | null>(null);
    const [credentialsModalOpen, setCredentialsModalOpen] = useState(false);
    const [demoCredentials, setDemoCredentials] = useState<{ email: string, password: string } | null>(null);
    const [copiedField, setCopiedField] = useState<'email' | 'password' | null>(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    // View selector state
    const [viewDropdownOpen, setViewDropdownOpen] = useState(false);
    const [newViewName, setNewViewName] = useState('');
    const [showNewViewInput, setShowNewViewInput] = useState(false);
    const [renamingViewId, setRenamingViewId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const viewDropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (viewDropdownRef.current && !viewDropdownRef.current.contains(e.target as Node)) {
                setViewDropdownOpen(false);
                setShowNewViewInput(false);
                setRenamingViewId(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const activeView = views.find(v => v.id === activeViewId);

    const handleCopy = (text: string, field: 'email' | 'password') => {
        copyToClipboard(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const availableWidgets = WIDGET_REGISTRY
        .filter(w => !activeWidgetIds.includes(w.id))
        .filter(w => !w.module || isModuleEnabled(w.module));
    const grouped = availableWidgets.reduce((acc, w) => {
        (acc[w.category] = acc[w.category] || []).push(w);
        return acc;
    }, {} as Record<string, typeof availableWidgets>);

    const handleDemoToggle = () => {
        SoundService.getInstance().play('toggle');
        setDemoMode(!demoMode);
        setDemoStatus(null);
    };

    const handleSeedDemo = async () => {
        setDemoLoading('seed');
        setDemoStatus(null);
        try {
            const res = await api.post('/platform/demo/seed');
            const stats = res.data?.data;
            setDemoStatus(`${t('dashboard.toolbar.seeded', 'Seeded')} ${stats?.sipCalls || 0} ${t('dashboard.toolbar.calls', 'calls')}`);
            SoundService.getInstance().play('success');

            if (stats?.credentials) {
                setDemoCredentials(stats.credentials);
                setCredentialsModalOpen(true);
            }

            refreshAll?.();
        } catch (err) {
            setDemoStatus(t('dashboard.toolbar.seedFailed', 'Seed failed'));
        } finally {
            setDemoLoading(null);
        }
    };

    const handleClearDemo = async () => {
        setShowClearConfirm(false);
        setDemoLoading('clear');
        setDemoStatus(null);
        try {
            await api.delete('/platform/demo/clear');
            setDemoMode(false);
            setDemoStatus(null);
            SoundService.getInstance().play('success');
            setTimeout(() => refreshAll?.(), 500);
        } catch (err) {
            setDemoStatus(t('dashboard.toolbar.clearFailed', 'Clear failed'));
        } finally {
            setDemoLoading(null);
        }
    };

    const handleCreateNewView = () => {
        const name = newViewName.trim();
        if (!name) return;
        onCreateView(name);
        setNewViewName('');
        setShowNewViewInput(false);
        setViewDropdownOpen(false);
    };

    const handleRenameSubmit = (viewId: string) => {
        const name = renameValue.trim();
        if (!name) return;
        onRenameView(viewId, name);
        setRenamingViewId(null);
    };

    return (
        <div className="dashboard-toolbar">
            <div className="toolbar-left">
                {/* ─── View Selector ─── */}
                <div className="view-selector" ref={viewDropdownRef}>
                    <button
                        className="view-selector-trigger"
                        onClick={() => setViewDropdownOpen(!viewDropdownOpen)}
                    >
                        <span className="view-selector-name">{activeView?.name || t('dashboard.toolbar.dashboard', 'Dashboard')}</span>
                        <ChevronDown size={16} className={`view-chevron ${viewDropdownOpen ? 'open' : ''}`} />
                    </button>

                    {viewDropdownOpen && (
                        <div className="view-selector-dropdown glass-panel" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200 }}>
                            {views.map(v => (
                                <div
                                    key={v.id}
                                    className={`view-selector-item ${v.id === activeViewId ? 'active' : ''}`}
                                >
                                    {renamingViewId === v.id ? (
                                        <input
                                            className="view-rename-input"
                                            value={renameValue}
                                            onChange={e => setRenameValue(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') handleRenameSubmit(v.id);
                                                if (e.key === 'Escape') setRenamingViewId(null);
                                            }}
                                            onBlur={() => handleRenameSubmit(v.id)}
                                            autoFocus
                                        />
                                    ) : (
                                        <>
                                            <button
                                                className="view-selector-item-btn"
                                                onClick={() => {
                                                    onSwitchView(v.id);
                                                    setViewDropdownOpen(false);
                                                }}
                                            >
                                                <span>{t(v.nameKey || '', v.name)}</span>
                                                {v.builtIn && <span className="view-badge">{t('dashboard.toolbar.preset', 'Preset')}</span>}
                                            </button>
                                            {!v.builtIn && (
                                                <div className="view-item-actions">
                                                    <button
                                                        className="view-action-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setRenamingViewId(v.id);
                                                            setRenameValue(v.name);
                                                        }}
                                                        title={t('dashboard.toolbar.rename', 'Rename')}
                                                    >
                                                        <Pencil size={12} />
                                                    </button>
                                                    <button
                                                        className="view-action-btn view-action-delete"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onDeleteView(v.id);
                                                        }}
                                                        title={t('dashboard.toolbar.delete', 'Delete')}
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            ))}

                            <div className="view-selector-divider" />

                            {showNewViewInput ? (
                                <div className="view-create-row">
                                    <input
                                        className="view-create-input"
                                        placeholder={t('dashboard.toolbar.viewNamePlaceholder', 'View name...')}
                                        value={newViewName}
                                        onChange={e => setNewViewName(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') handleCreateNewView();
                                            if (e.key === 'Escape') setShowNewViewInput(false);
                                        }}
                                        autoFocus
                                    />
                                    <button className="view-create-confirm" onClick={handleCreateNewView}>
                                        <Check size={14} />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    className="view-selector-item view-create-btn"
                                    onClick={() => setShowNewViewInput(true)}
                                >
                                    <Plus size={14} />
                                    <span>{t('dashboard.toolbar.newView', 'New View')}</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {import.meta.env.VITE_MOCK_MODE !== 'true' && (
                    <>
                        <MotionButton
                            variant="ghost"
                            size="sm"
                            soundEnabled={false}
                            className={`toolbar-btn toolbar-btn-demo ${demoMode ? 'active' : ''}`}
                            onClick={handleDemoToggle}
                            title={demoMode ? 'Disable Demo Mode' : 'Enable Demo Mode'}
                        >
                            {demoMode ? <EyeOff size={16} /> : <Eye size={16} />}
                            <span>{demoMode ? t('dashboard.toolbar.demoOn', 'Demo ON') : t('dashboard.toolbar.demo', 'Demo')}</span>
                        </MotionButton>
                        {demoMode && (
                            <>
                                <MotionButton
                                    variant="ghost"
                                    size="sm"
                                    className="toolbar-btn"
                                    onClick={handleSeedDemo}
                                    disabled={demoLoading !== null}
                                    title="Import demo data into ClickHouse"
                                >
                                    {demoLoading === 'seed' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                    <span>{t('dashboard.toolbar.import', 'Import')}</span>
                                </MotionButton>
                                <MotionButton
                                    variant="ghost"
                                    size="sm"
                                    className="toolbar-btn"
                                    onClick={() => setShowClearConfirm(true)}
                                    disabled={demoLoading !== null}
                                    title="Clear all demo data from ClickHouse"
                                >
                                    {demoLoading === 'clear' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                    <span>{t('dashboard.toolbar.clear', 'Clear')}</span>
                                </MotionButton>
                                {demoStatus && (
                                    <span className="toolbar-demo-status">{demoStatus}</span>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
            <div className="toolbar-right flex items-center gap-2">
                <GroupSelector
                    selectedIds={groupIds}
                    onChange={setGroupIds}
                    disabled={editMode}
                />

                {editMode && (
                    <>
                        <div className="toolbar-picker-wrap">
                            <MotionButton
                                variant="ghost"
                                size="sm"
                                className="toolbar-btn"
                                onClick={() => setPickerOpen(!pickerOpen)}
                            >
                                {pickerOpen ? <X size={16} /> : <Plus size={16} />}
                                <span>{pickerOpen ? t('dashboard.toolbar.close', 'Close') : t('dashboard.toolbar.addWidget', 'Add Widget')}</span>
                            </MotionButton>
                            {pickerOpen && (
                                <div
                                    className="widget-picker-panel glass-panel"
                                    style={{
                                        position: 'absolute',
                                        top: 'calc(100% + 8px)',
                                        right: 0,
                                        zIndex: 100
                                    }}
                                >                                    <div className="picker-header">{t('dashboard.toolbar.addWidget', 'Add Widget')}</div>
                                    {availableWidgets.length === 0 ? (
                                        <div className="picker-empty">{t('dashboard.toolbar.allWidgetsAdded', 'All widgets are already on the dashboard')}</div>
                                    ) : (
                                        Object.entries(grouped).map(([cat, widgets]) => (
                                            <div key={cat} className="picker-group">
                                                <div className="picker-group-label">{t(CATEGORY_LABEL_KEYS[cat as WidgetCategory]?.key || '', CATEGORY_LABEL_KEYS[cat as WidgetCategory]?.fallback || cat)}</div>
                                                {widgets.map(w => {
                                                    const Icon = w.icon;
                                                    return (
                                                        <MotionButton
                                                            key={w.id}
                                                            variant="ghost"
                                                            size="sm"
                                                            className="picker-item"
                                                            onClick={() => { onAddWidget(w.id); }}
                                                        >
                                                            <Icon size={14} />
                                                            <span>{t(w.nameKey || '', w.name)}</span>
                                                        </MotionButton>
                                                    );
                                                })}
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                        <MotionButton
                            variant="ghost"
                            size="sm"
                            className="toolbar-btn toolbar-btn-ghost"
                            onClick={onAutoArrange}
                            title="Auto-arrange widgets"
                        >
                            <LayoutGrid size={16} />
                            <span>{t('dashboard.toolbar.arrange', 'Arrange')}</span>
                        </MotionButton>
                        <MotionButton
                            variant="ghost"
                            size="sm"
                            className="toolbar-btn toolbar-btn-ghost"
                            onClick={onReset}
                        >
                            <RotateCcw size={16} />
                            <span>{t('dashboard.toolbar.reset', 'Reset')}</span>
                        </MotionButton>
                    </>
                )}
                <MotionButton
                    variant={editMode ? 'primary' : 'ghost'}
                    size="sm"
                    className={`toolbar-btn ${editMode ? 'toolbar-btn-primary' : 'toolbar-btn-ghost'}`}
                    onClick={onToggleEdit}
                >
                    {editMode ? <Check size={16} /> : <Pencil size={16} />}
                    <span>{editMode ? t('dashboard.toolbar.done', 'Done') : t('dashboard.toolbar.edit', 'Edit')}</span>
                </MotionButton>
            </div>

            <GlassModal
                open={credentialsModalOpen}
                onOpenChange={setCredentialsModalOpen}
                title={t('dashboard.toolbar.demoImportedTitle', 'Demo Data Imported Successfully')}
                description={t('dashboard.toolbar.demoImportedDesc', 'Please use the following account to log in to the CXMind Copilot extension:')}
                className="w-[450px]"
            >
                {demoCredentials && (
                    <div className="flex flex-col gap-4 mt-6">
                        <div className="flex flex-col gap-1.5">
                            <span className="text-xs text-brand-teal uppercase tracking-wider font-semibold opacity-80">{t('dashboard.toolbar.account', 'Account')}</span>
                            <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl overflow-hidden group hover:bg-white/10 transition-colors">
                                <span className="text-lg text-white font-medium select-all font-mono ml-1">{demoCredentials.email}</span>
                                <MotionButton
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleCopy(demoCredentials.email, 'email')}
                                    className="text-white/50 hover:text-brand-teal group-hover:opacity-100 opacity-50 transition-opacity"
                                >
                                    {copiedField === 'email' ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                                </MotionButton>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className="text-xs text-brand-teal uppercase tracking-wider font-semibold opacity-80">{t('dashboard.toolbar.password', 'Password')}</span>
                            <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl overflow-hidden group hover:bg-white/10 transition-colors">
                                <span className="text-lg text-white font-medium select-all font-mono ml-1">{demoCredentials.password}</span>
                                <MotionButton
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleCopy(demoCredentials.password, 'password')}
                                    className="text-white/50 hover:text-brand-teal group-hover:opacity-100 opacity-50 transition-opacity"
                                >
                                    {copiedField === 'password' ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                                </MotionButton>
                            </div>
                        </div>
                    </div>
                )}
            </GlassModal>

            <ConfirmModal
                open={showClearConfirm}
                onClose={() => setShowClearConfirm(false)}
                onConfirm={handleClearDemo}
                title={t('dashboard.toolbar.clearDemoTitle', 'Clear Demo Data')}
                description={t('dashboard.toolbar.clearDemoDesc', 'Clear all demo data and exit Demo mode?')}
            />
        </div>
    );
};

export default DashboardToolbar;
