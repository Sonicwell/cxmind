import React, { useState, useEffect, useRef } from 'react';
import { Filter, X, Check } from 'lucide-react';
import { MotionButton } from './MotionButton';
import api from '../../services/api';

interface Group {
    _id: string;
    name: string;
    code: string;
}

interface GroupSelectorProps {
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    disabled?: boolean;
}

export const GroupSelector: React.FC<GroupSelectorProps> = ({ selectedIds, onChange, disabled }) => {
    const [groups, setGroups] = useState<Group[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchGroups = async () => {
            setLoading(true);
            try {
                const res = await api.get('/groups');
                setGroups(res.data?.data || []);
            } catch (err) {
                console.error('Failed to fetch groups for selector', err);
            } finally {
                setLoading(false);
            }
        };
        fetchGroups();
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleToggleSelect = (id: string) => {
        if (selectedIds.includes(id)) {
            onChange(selectedIds.filter(v => v !== id));
        } else {
            onChange([...selectedIds, id]);
        }
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange([]);
        setOpen(false);
    };

    return (
        <div className="relative inline-block text-left" ref={ref}>
            <MotionButton
                variant={selectedIds.length > 0 ? 'primary' : 'ghost'}
                size="sm"
                soundEnabled={false}
                className={`toolbar-btn ${selectedIds.length > 0 ? 'toolbar-btn-primary' : 'toolbar-btn-ghost'} flex items-center gap-1.5`}
                onClick={() => !disabled && setOpen(!open)}
                disabled={disabled || loading}
                title="Filter by Group"
            >
                <Filter size={16} />
                <span>
                    {selectedIds.length === 0
                        ? 'All Groups'
                        : `${selectedIds.length} Group${selectedIds.length > 1 ? 's' : ''}`}
                </span>
                {selectedIds.length > 0 && (
                    <div
                        className="ml-1 flex items-center justify-center rounded-full hover:bg-black/20 p-0.5 transition-colors"
                        onClick={handleClear}
                    >
                        <X size={12} />
                    </div>
                )}
            </MotionButton>

            {open && (
                <div
                    className="absolute right-0 top-full mt-2 w-56 rounded-xl z-50 overflow-hidden box-border"
                    style={{
                        background: 'var(--glass-bg)',
                        border: '1px solid var(--glass-border)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
                    }}
                >
                    <div
                        className="px-3 py-2 items-center flex justify-between"
                        style={{ borderBottom: '1px solid var(--glass-border)' }}
                    >
                        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Select Groups</span>
                        {selectedIds.length > 0 && (
                            <button
                                onClick={handleClear}
                                className="text-xs transition-colors hover:opacity-80"
                                style={{ color: 'var(--primary)' }}
                            >
                                Clear all
                            </button>
                        )}
                    </div>
                    <div className="max-h-64 overflow-y-auto p-1 custom-scrollbar">
                        {groups.length === 0 ? (
                            <div className="p-3 text-sm text-center" style={{ color: 'var(--text-muted)' }}>No groups found</div>
                        ) : (
                            groups.map(g => {
                                const isSelected = selectedIds.includes(g._id);
                                return (
                                    <MotionButton
                                        key={g._id}
                                        variant={isSelected ? 'primary' : 'ghost'}
                                        size="sm"
                                        soundEnabled={false}
                                        className="w-full flex items-center justify-between text-left px-3 py-2 text-sm rounded-lg transition-colors mt-1"
                                        style={{
                                            background: isSelected ? 'hsla(var(--primary-hue), var(--primary-sat), 60%, 0.15)' : 'transparent',
                                            color: isSelected ? 'var(--primary)' : 'var(--text-primary)',
                                            border: 'none',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        }}
                                        onClick={() => handleToggleSelect(g._id)}
                                    >
                                        <span className="truncate pr-2">{g.name}</span>
                                        {isSelected && <Check size={14} className="flex-shrink-0" />}
                                    </MotionButton>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
