import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('../../services/api', () => ({
    default: {
        get: (...args: any[]) => mockGet(...args),
        post: (...args: any[]) => mockPost(...args),
    },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

const mockStatus = {
    enabled: true,
    queueLength: 2,
    stats: { queued: 5, uploading: 2, uploaded: 120, failed: 3 },
    recent: [
        {
            callId: 'call-abc-123-def-456',
            localPath: '/recordings/call-abc.wav',
            cloudUri: 's3://bucket/call-abc.wav',
            status: 'uploaded',
            attempts: 1,
            fileSize: 2048000, // ~2 MB
            realm: 'default',
            uploadedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
        {
            callId: 'call-failed-789',
            localPath: '/recordings/call-failed.wav',
            cloudUri: '',
            status: 'failed',
            attempts: 3,
            lastError: 'Connection timeout',
            fileSize: 512000,
            realm: 'default',
            updatedAt: new Date(Date.now() - 3600000).toISOString(), // 1h ago
        },
    ],
};

import { RecordingUploadPanel } from './RecordingUploadPanel';

const Wrapper = ({ children }: any) => <MemoryRouter>{children}</MemoryRouter>;

describe('RecordingUploadPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue({ data: { data: mockStatus } });
    });

    it('fetches status on mount', async () => {
        render(<RecordingUploadPanel />, { wrapper: Wrapper });
        await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/platform/recording-uploads/status'));
    });

    it('renders title', async () => {
        render(<RecordingUploadPanel />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('settingsPage.recordingUpload.title')).toBeTruthy();
        });
    });

    it('renders stat cards with correct values', async () => {
        render(<RecordingUploadPanel />, { wrapper: Wrapper });
        await waitFor(() => {
            // Check stat card labels are rendered
            expect(screen.getByText('settingsPage.recordingUpload.queued')).toBeTruthy();
            expect(screen.getByText('settingsPage.recordingUpload.uploaded')).toBeTruthy();
            expect(screen.getByText('settingsPage.recordingUpload.failed')).toBeTruthy();
            // queued total = 5+2=7
            expect(screen.getByText('7')).toBeTruthy();
            expect(screen.getByText('120')).toBeTruthy(); // uploaded
        });
    });

    it('renders recent uploads table', async () => {
        render(<RecordingUploadPanel />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('settingsPage.recordingUpload.recentUploads')).toBeTruthy();
        });
    });

    it('displays file sizes in readable format', async () => {
        render(<RecordingUploadPanel />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('2.0 MB')).toBeTruthy();  // 2048000 bytes
            expect(screen.getByText('500.0 KB')).toBeTruthy(); // 512000 bytes
        });
    });

    it('shows retry button for failed uploads', async () => {
        render(<RecordingUploadPanel />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('settingsPage.recordingUpload.retry')).toBeTruthy();
        });
    });

    it('calls retry API when retry button clicked', async () => {
        mockPost.mockResolvedValue({});
        render(<RecordingUploadPanel />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByText('settingsPage.recordingUpload.retry')).toBeTruthy());
        fireEvent.click(screen.getByText('settingsPage.recordingUpload.retry'));
        await waitFor(() => {
            expect(mockPost).toHaveBeenCalledWith('/platform/recording-uploads/call-failed-789/retry');
        });
    });

    it('renders refresh button', async () => {
        render(<RecordingUploadPanel />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('settingsPage.recordingUpload.refresh')).toBeTruthy();
        });
    });

    it('renders disabled badge when upload is disabled', async () => {
        mockGet.mockResolvedValue({ data: { data: { ...mockStatus, enabled: false } } });
        render(<RecordingUploadPanel />, { wrapper: Wrapper });
        await waitFor(() => {
            expect(screen.getByText('settingsPage.recordingUpload.disabled')).toBeTruthy();
        });
    });

    it('returns null before status loads', () => {
        mockGet.mockReturnValue(new Promise(() => { })); // never resolves
        const { container } = render(<RecordingUploadPanel />, { wrapper: Wrapper });
        expect(container.innerHTML).toBe('');
    });
});
