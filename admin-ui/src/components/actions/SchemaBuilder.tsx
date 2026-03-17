
import { Checkbox } from '../ui/Checkbox';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { MotionButton } from '../ui/MotionButton';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

export interface SchemaField {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array';
    description: string;
    required: boolean;
    enumValues?: string[]; // For string type with enum
}

export interface SchemaValue {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
}

/** Convert visual fields → JSON Schema */
export function fieldsToSchema(fields: SchemaField[]): SchemaValue {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    fields.forEach(f => {
        const prop: any = { type: f.type, description: f.description || undefined };
        if (f.type === 'string' && f.enumValues && f.enumValues.length > 0) {
            prop.enum = f.enumValues;
        }
        if (f.type === 'array') {
            prop.items = { type: 'string' };
        }
        properties[f.name] = prop;
        if (f.required) required.push(f.name);
    });

    return { type: 'object', properties, required };
}

/** Convert JSON Schema → visual fields */
export function schemaToFields(schema: any): SchemaField[] {
    if (!schema || !schema.properties) return [];
    const requiredSet = new Set<string>(schema.required || []);
    return Object.entries(schema.properties).map(([name, prop]: [string, any]) => ({
        name,
        type: prop.type || 'string',
        description: prop.description || '',
        required: requiredSet.has(name),
        enumValues: prop.enum || undefined,
    }));
}

interface SchemaBuilderProps {
    fields: SchemaField[];
    onChange: (fields: SchemaField[]) => void;
}

const TYPES = [
    { value: 'string', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'boolean', label: 'Boolean' },
    { value: 'array', label: 'List' },
];

const fieldRowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 100px 1fr 60px 36px',
    gap: '0.5rem',
    alignItems: 'center',
    padding: '0.6rem 0',
    borderBottom: '1px solid var(--glass-border)',
};

/* smallInputStyle removed: Input 组件自带 input-field class */

const smallSelectStyle: React.CSSProperties = {
    padding: '0.45rem 0.6rem',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--glass-border)',
    background: 'rgba(0,0,0,0.02)',
    fontSize: '0.85rem',
    fontFamily: 'inherit',
    width: '100%',
    cursor: 'pointer',
};

const SchemaBuilder: React.FC<SchemaBuilderProps> = ({ fields, onChange }) => {
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
    const [enumInput, setEnumInput] = useState('');
    const [mode, setMode] = useState<'visual' | 'json'>('visual');
    const [jsonText, setJsonText] = useState('');
    const [jsonError, setJsonError] = useState('');

    // Sync fields → jsonText when switching to JSON mode
    const switchToJson = () => {
        const schema = fields.length > 0 ? fieldsToSchema(fields) : { type: 'object', properties: {}, required: [] };
        setJsonText(JSON.stringify(schema, null, 2));
        setJsonError('');
        setMode('json');
    };

    // Sync jsonText → fields when switching to Visual mode
    const switchToVisual = () => {
        if (jsonText.trim()) {
            try {
                const parsed = JSON.parse(jsonText);
                onChange(schemaToFields(parsed));
                setJsonError('');
            } catch {
                setJsonError('Invalid JSON — fix before switching');
                return;
            }
        }
        setMode('visual');
    };

    const handleJsonChange = (text: string) => {
        setJsonText(text);
        try {
            const parsed = JSON.parse(text);
            onChange(schemaToFields(parsed));
            setJsonError('');
        } catch {
            setJsonError('Invalid JSON');
        }
    };

    const addField = () => {
        onChange([...fields, { name: '', type: 'string', description: '', required: false }]);
        setExpandedIdx(fields.length);
    };

    const removeField = (idx: number) => {
        const next = fields.filter((_, i) => i !== idx);
        onChange(next);
        if (expandedIdx === idx) setExpandedIdx(null);
    };

    const updateField = (idx: number, patch: Partial<SchemaField>) => {
        const next = fields.map((f, i) => i === idx ? { ...f, ...patch } : f);
        onChange(next);
    };

    const addEnum = (idx: number) => {
        const val = enumInput.trim();
        if (!val) return;
        const f = fields[idx];
        const existing = f.enumValues || [];
        if (!existing.includes(val)) {
            updateField(idx, { enumValues: [...existing, val] });
        }
        setEnumInput('');
    };

    const removeEnum = (idx: number, val: string) => {
        const f = fields[idx];
        updateField(idx, { enumValues: (f.enumValues || []).filter(v => v !== val) });
    };

    const tabStyle = (active: boolean): React.CSSProperties => ({
        padding: '0.35rem 0.75rem',
        fontSize: '0.8rem',
        fontWeight: 600,
        borderRadius: 'var(--radius-sm)',
        border: 'none',
        cursor: 'pointer',
        background: active ? 'var(--primary)' : 'transparent',
        color: active ? '#fff' : 'var(--text-muted)',
        transition: 'all 0.15s ease',
    });

    return (
        <div>
            {/* Mode Toggle */}
            <div style={{
                display: 'flex',
                gap: '0.25rem',
                marginBottom: '0.75rem',
                padding: '0.2rem',
                background: 'rgba(0,0,0,0.04)',
                borderRadius: 'var(--radius-sm)',
                width: 'fit-content',
            }}>
                <Button type="button" style={tabStyle(mode === 'visual')} onClick={() => mode === 'json' ? switchToVisual() : null}>
                    Visual
                </Button>
                <Button type="button" style={tabStyle(mode === 'json')} onClick={() => mode === 'visual' ? switchToJson() : null}>
                    JSON
                </Button>
            </div>

            {mode === 'json' ? (
                /* JSON Editor */
                <div>
                    <Textarea
                        value={jsonText}
                        onChange={e => handleJsonChange(e.target.value)}
                        spellCheck={false}
                        style={{
                            width: '100%',
                            minHeight: '180px',
                            padding: '0.75rem',
                            borderRadius: 'var(--radius-sm)',
                            border: `1px solid ${jsonError ? 'var(--danger)' : 'var(--glass-border)'}`,
                            background: 'rgba(0,0,0,0.02)',
                            fontFamily: 'monospace',
                            fontSize: '0.8rem',
                            lineHeight: 1.5,
                            resize: 'vertical',
                            color: 'var(--text-primary)',
                        }}
                    />
                    {jsonError && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.3rem' }}>
                            {jsonError}
                        </div>
                    )}
                </div>
            ) : (
                /* Visual Editor */
                <>
                    {/* Header */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 100px 1fr 60px 36px',
                        gap: '0.5rem',
                        padding: '0.4rem 0',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.03em',
                    }}>
                        <span>Field Name</span>
                        <span>Type</span>
                        <span>Description</span>
                        <span style={{ textAlign: 'center' }}>Req</span>
                        <span></span>
                    </div>

                    {/* Field Rows */}
                    {fields.map((field, idx) => (
                        <div key={idx}>
                            <div style={fieldRowStyle}>
                                <Input
                                    style={{ fontSize: '0.85rem' }}
                                    placeholder="field_name"
                                    value={field.name}
                                    onChange={e => updateField(idx, { name: e.target.value.replace(/\s+/g, '_').toLowerCase() })}
                                />
                                <Select
                                    style={smallSelectStyle}
                                    value={field.type}
                                    onChange={e => updateField(idx, { type: e.target.value as SchemaField['type'] })}
                                >
                                    {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </Select>
                                <Input
                                    style={{ fontSize: '0.85rem' }}
                                    placeholder="Description (optional)"
                                    value={field.description}
                                    onChange={e => updateField(idx, { description: e.target.value })}
                                />
                                <div style={{ textAlign: 'center' }}>
                                    <label className="toggle-switch" style={{ transform: 'scale(0.8)' }}>
                                        <Checkbox
                                            checked={field.required}
                                            onChange={e => updateField(idx, { required: e.target.checked })}
                                        />
                                        <span className="toggle-slider" />
                                    </label>
                                </div>
                                <div style={{ display: 'flex', gap: '2px' }}>
                                    {field.type === 'string' && (
                                        <Button
                                            type="button"
                                            onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-muted)' }}
                                            title="Enum options"
                                        >
                                            {expandedIdx === idx ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        onClick={() => removeField(idx)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--danger)' }}
                                        title="Remove field"
                                    >
                                        <Trash2 size={14} />
                                    </Button>
                                </div>
                            </div>

                            {/* Expanded Enum Editor */}
                            {expandedIdx === idx && field.type === 'string' && (
                                <div style={{
                                    padding: '0.5rem 0 0.5rem 1rem',
                                    borderBottom: '1px solid var(--glass-border)',
                                    background: 'rgba(0,0,0,0.01)',
                                }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                                        Allowed values (enum) — leave empty for free text
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                                        {(field.enumValues || []).map(v => (
                                            <span key={v} style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                                                padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-full)',
                                                fontSize: '0.75rem', background: 'hsla(var(--primary-hue), 60%, 60%, 0.08)',
                                                color: 'var(--primary)', border: '1px solid hsla(var(--primary-hue), 60%, 60%, 0.2)',
                                            }}>
                                                {v}
                                                <span onClick={() => removeEnum(idx, v)} style={{ cursor: 'pointer', opacity: 0.7 }}>×</span>
                                            </span>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                                        <Input
                                            style={{ flex: 1, fontSize: '0.85rem' }}
                                            placeholder="Add option..."
                                            value={enumInput}
                                            onChange={e => setEnumInput(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEnum(idx); } }}
                                        />
                                        <MotionButton type="button" variant="secondary" onClick={() => addEnum(idx)} style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>
                                            Add
                                        </MotionButton>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Add Field Button */}
                    <div style={{ marginTop: '0.75rem' }}>
                        <MotionButton type="button" variant="secondary" onClick={addField} style={{ gap: '0.4rem', fontSize: '0.85rem' }}>
                            <Plus size={14} />
                            Add Field
                        </MotionButton>
                    </div>

                    {fields.length === 0 && (
                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            No fields defined. Add fields that the AI should extract from the conversation.
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default SchemaBuilder;
