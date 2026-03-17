import React, { useState, useMemo } from 'react';
import { Search, AlertTriangle, Merge, CheckCircle2 } from 'lucide-react';
import AvatarInitials from '../ui/AvatarInitials';
import { GlassModal } from '../ui/GlassModal';
import { MotionButton } from '../ui/MotionButton';

interface Contact {
    _id: string;
    displayName?: string;
    identifiers: {
        phone?: string[];
        email?: string[];
    };
    company?: string;
}

interface MergeContactModalProps {
    isOpen: boolean;
    onClose: () => void;
    targetContact: Contact | null;
    availableContacts: Contact[];
    onMerge: (sourceContactId: string) => Promise<void>;
}

const MergeContactModal: React.FC<MergeContactModalProps> = ({
    isOpen,
    onClose,
    targetContact,
    availableContacts,
    onMerge
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const filteredContacts = useMemo(() => {
        if (!isOpen || !targetContact) return [];
        const query = searchQuery.toLowerCase();
        return availableContacts.filter(c => {
            if (c._id === targetContact._id) return false; // Exclude target
            return (
                c.displayName?.toLowerCase().includes(query) ||
                c.company?.toLowerCase().includes(query) ||
                c.identifiers.phone?.some(p => p.includes(query)) ||
                c.identifiers.email?.some(e => e.includes(query))
            );
        }).slice(0, 5); // Limit to top 5 matches
    }, [searchQuery, availableContacts, targetContact, isOpen]);

    if (!isOpen || !targetContact) return null;

    const handleMergeClick = async () => {
        if (!selectedSourceId) return;
        setIsSubmitting(true);
        try {
            await onMerge(selectedSourceId);
            onClose();
        } catch (error) {
            console.error('Merge error:', error);
            // Error handling usually bubbled up to parent
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <GlassModal
            open={isOpen}
            onOpenChange={(open) => !open && onClose()}
            title="Merge Contact"
        >
            <div className="flex flex-col gap-md">
                <div style={{ padding: '16px', backgroundColor: 'var(--surface-hover)', borderRadius: '8px' }}>
                    <p className="text-secondary" style={{ marginBottom: '8px', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Target Contact (Keep)</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <AvatarInitials name={targetContact.displayName || 'Unknown'} size={40} />
                        <div>
                            <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{targetContact.displayName || 'Unknown Contact'}</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                {[...(targetContact.identifiers.phone || []), ...(targetContact.identifiers.email || [])].slice(0, 2).join(', ')}
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <label className="form-label" style={{ fontWeight: 500, display: 'block', marginBottom: 8, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Find Contact to Merge From</label>
                    <div className="search-box" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', padding: '0 12px', border: '1px solid var(--glass-border)' }}>
                        <Search size={16} className="text-secondary" />
                        <input
                            type="text"
                            placeholder="Search by name, phone, or email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ flex: 1, border: 'none', background: 'transparent', padding: '10px 12px', color: 'var(--text-primary)', outline: 'none' }}
                        />
                    </div>
                </div>

                <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '24px' }}>
                    {filteredContacts.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            {searchQuery ? 'No contacts found.' : 'Type to search for contacts.'}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {filteredContacts.map(c => (
                                <div
                                    key={c._id}
                                    onClick={() => setSelectedSourceId(c._id)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '12px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        border: selectedSourceId === c._id ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                                        backgroundColor: selectedSourceId === c._id ? 'rgba(79, 70, 229, 0.05)' : 'transparent'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <AvatarInitials name={c.displayName || 'Unknown'} size={32} />
                                        <div>
                                            <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{c.displayName || 'Unknown Contact'}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                {[...(c.identifiers.phone || []), ...(c.identifiers.email || [])].slice(0, 1).join(', ')}
                                            </div>
                                        </div>
                                    </div>
                                    {selectedSourceId === c._id && (
                                        <CheckCircle2 size={18} className="text-primary" />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {selectedSourceId && (
                    <div style={{ padding: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <AlertTriangle size={18} className="text-danger" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                            <strong style={{ color: 'var(--text-danger)' }}>Warning:</strong> This action cannot be undone. The selected contact's data and timeline will be permanently merged into the target contact. The original source contact will be hidden.
                        </div>
                    </div>
                )}

                <div className="flex gap-md" style={{ marginTop: '1rem' }}>
                    <MotionButton type="button" variant="secondary" className="w-full" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </MotionButton>
                    <MotionButton
                        type="button"
                        className="w-full"
                        onClick={handleMergeClick}
                        disabled={!selectedSourceId || isSubmitting}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                        <Merge size={16} />
                        {isSubmitting ? 'Merging...' : 'Merge Contacts'}
                    </MotionButton>
                </div>
            </div>
        </GlassModal>
    );
};

export default MergeContactModal;
