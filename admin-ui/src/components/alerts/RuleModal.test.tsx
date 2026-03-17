import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RuleModal } from './RuleModal';

vi.mock('../ui/GlassModal', () => ({
    GlassModal: ({ open, children, title }: any) =>
        open ? <div data-testid={`modal-${title}`}>{children}</div> : null,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string) => k,
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
}));

describe('RuleModal', () => {
    const defaultProps = {
        open: true,
        onClose: vi.fn(),
        onSave: vi.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders nothing when open=false', () => {
        const { container } = render(<RuleModal {...defaultProps} open={false} />);
        expect(container.textContent).toBe('');
    });

    it('renders modal when open=true', () => {
        render(<RuleModal {...defaultProps} />);
        // Should find form elements
        expect(screen.getByText('alertsPage.ruleModal.ruleName')).toBeTruthy();
    });

    it('renders severity select', () => {
        render(<RuleModal {...defaultProps} />);
        const selects = document.querySelectorAll('select');
        expect(selects.length).toBeGreaterThan(0);
    });

    it('renders save button', () => {
        render(<RuleModal {...defaultProps} />);
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
    });

    it('renders with initialData when editing', () => {
        render(<RuleModal {...defaultProps} initialData={{
            _id: 'r1', name: 'High MOS Alert', description: 'Alert when MOS drops',
            severity: 'critical', enabled: true, smartBaseline: false,
            metricExpressions: [{ metric: 'MOS', operator: 'LT', threshold: 3.5 }],
            durationWindowSec: 60, eventTrigger: 'metric_threshold',
            isSystemDefault: false, createdAt: '2025-01-01', updatedAt: '2025-01-01',
        }} />);
        // Name field should be pre-filled
        const nameInput = screen.getByPlaceholderText('alertsPage.placeholders.ruleNamePlaceholder') as HTMLInputElement;
        expect(nameInput.value).toBe('High MOS Alert');
    });
});
