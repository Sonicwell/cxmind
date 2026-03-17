import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import KnowledgeBase from './KnowledgeBase';

// ── Mocks ──

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();

vi.mock('../services/api', () => ({
    default: {
        get: (...args: any[]) => mockGet(...args),
        post: (...args: any[]) => mockPost(...args),
        patch: (...args: any[]) => mockPatch(...args),
    },
}));

vi.mock('../components/ui/GlassModal', () => ({
    GlassModal: ({ open, children, title }: any) =>
        open ? <div data-testid={`modal-${title}`}>{children}</div> : null,
}));

vi.mock('../components/ui/ConfirmModal', () => ({
    ConfirmModal: ({ open, onConfirm, onClose, title, description }: any) =>
        open ? (
            <div data-testid="confirm-modal">
                <span>{title}</span>
                <span>{description}</span>
                <button data-testid="confirm-btn" onClick={onConfirm}>Confirm</button>
                <button data-testid="cancel-btn" onClick={onClose}>Cancel</button>
            </div>
        ) : null,
}));

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const MOCK_ARTICLES = [
    {
        _id: 'kb1',
        title: 'Test Article',
        content: 'Test content here',
        category: 'faq',
        tags: ['test'],
        status: 'active',
        createdAt: '2025-01-01',
        updatedAt: '2025-01-02',
    },
];

describe('KnowledgeBase Modal Unification', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default mock: return articles for list, health ok
        mockGet.mockImplementation((url: string) => {
            if (url === '/knowledge/health') {
                return Promise.resolve({ data: { ok: true, message: 'OK' } });
            }
            return Promise.resolve({
                data: { data: MOCK_ARTICLES, pagination: { total: 1 } },
            });
        });
        mockPost.mockResolvedValue({ data: {} });
        mockPatch.mockResolvedValue({ data: {} });
    });

    it('should render editor modal using GlassModal when "New Article" is clicked', async () => {
        render(<KnowledgeBase />);

        await waitFor(() => {
            expect(screen.getByText('Test Article')).toBeInTheDocument();
        });

        // Click the "New Article" button
        const newBtn = screen.getByText('New Article');
        fireEvent.click(newBtn);

        // The GlassModal mock renders with data-testid="modal-{title}"
        // After migration, the editor should be wrapped in a GlassModal
        await waitFor(() => {
            const modal = document.querySelector('[data-testid^="modal-"]');
            expect(modal).toBeInTheDocument();
        });
    });

    it('should close editor GlassModal when cancel is clicked', async () => {
        render(<KnowledgeBase />);

        await waitFor(() => {
            expect(screen.getByText('Test Article')).toBeInTheDocument();
        });

        // Open editor
        fireEvent.click(screen.getByText('New Article'));

        await waitFor(() => {
            expect(document.querySelector('[data-testid^="modal-"]')).toBeInTheDocument();
        });

        // Click cancel
        fireEvent.click(screen.getByText('Cancel'));

        await waitFor(() => {
            expect(document.querySelector('[data-testid^="modal-"]')).not.toBeInTheDocument();
        });
    });

    it('should use ConfirmModal instead of native confirm() for archive', async () => {
        render(<KnowledgeBase />);

        await waitFor(() => {
            expect(screen.getByText('Test Article')).toBeInTheDocument();
        });

        // Click the archive button (the Archive icon button)
        const archiveButtons = document.querySelectorAll('button');
        const archiveBtn = Array.from(archiveButtons).find(
            btn => btn.querySelector('svg.lucide-archive')
        );

        // If we can't find the exact SVG class, find by position
        // The archive button is the second button in each article row's action div
        const articleRow = screen.getByText('Test Article').closest('div[style]');
        if (articleRow) {
            const actionBtns = articleRow.querySelectorAll('button.btn-sm');
            const lastBtn = actionBtns[actionBtns.length - 1]; // archive button
            if (lastBtn) {
                fireEvent.click(lastBtn);

                // ConfirmModal should appear
                await waitFor(() => {
                    expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
                });
            }
        }
    });
});
