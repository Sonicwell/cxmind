import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import SystemConfig from '../SystemConfig';
import api from '../../../services/api';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, options?: any) => (options && typeof options === "object") ? (options.defaultValue || k) : (options || k) }),
}));

vi.mock('../../../services/api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
    }
}));

describe('SystemConfig component', () => {
    const mockData = {
        data: {
            sysConfig: {
                maintenanceMode: false,
                debugLogging: false
            },
            infrastructure: {
                goServiceUrl: 'http://go-api',
                appNodeInternalUrl: 'http://node-api'
            },
            systemEmail: {
                provider: 'smtp',
                host: 'smtp.mail.com',
                port: 465,
                secure: true,
                user: 'test_user',
                pass: 'test_pass',
                fromAddress: 'from@mail.com'
            },
            events: {
            }
        }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (api.get as any).mockResolvedValue({ data: { data: mockData.data } });
        (api.patch as any).mockResolvedValue({ data: { success: true } });
        (api.put as any).mockResolvedValue({ data: { success: true } });
        (api.post as any).mockResolvedValue({ data: { success: true, ok: true } });
    });

    it('renders and fetches settings correctly', async () => {
        render(<SystemConfig />);

        expect(screen.getByText(/systemConfig.loading/i)).toBeInTheDocument();

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/platform/settings');
            expect(screen.queryByText(/systemConfig.loading/i)).not.toBeInTheDocument();
        });

        expect(screen.getByText('systemConfig.title')).toBeInTheDocument();
        expect(screen.getByDisplayValue('http://go-api')).toBeInTheDocument();
        expect(screen.getByDisplayValue('smtp.mail.com')).toBeInTheDocument();
        expect(screen.getByDisplayValue('from@mail.com')).toBeInTheDocument();
    });

    it('handles fetching empty settings and initializes defaults', async () => {
        (api.get as any).mockResolvedValue({ data: { data: {} } });
        render(<SystemConfig />);

        await waitFor(() => {
            expect(screen.queryByText(/systemConfig.loading/i)).not.toBeInTheDocument();
        });

        // Default values should be present
        expect(screen.getByDisplayValue('http://localhost:8081')).toBeInTheDocument();
        expect(screen.getByDisplayValue('http://localhost:3000')).toBeInTheDocument();
    });

    it('updates sysConfig switches correctly', async () => {
        render(<SystemConfig />);
        await waitFor(() => screen.getByText('systemConfig.title'));

        const maintenanceCheckbox = screen.getByLabelText(/systemConfig.maintenanceMode/i) as HTMLInputElement;
        const debugCheckbox = screen.getByLabelText(/systemConfig.debugLogging/i) as HTMLInputElement;

        expect(maintenanceCheckbox.checked).toBe(false);
        expect(debugCheckbox.checked).toBe(false);

        fireEvent.click(maintenanceCheckbox);
        fireEvent.click(debugCheckbox);

        expect(maintenanceCheckbox.checked).toBe(true);
        expect(debugCheckbox.checked).toBe(true);
    });

    it('tests internal endpoints correctly', async () => {
        const { container } = render(<SystemConfig />);
        await waitFor(() => screen.getByText('systemConfig.title'));

        // Find the test buttons
        const testBtns = screen.getAllByRole('button', { name: /Test/i });
        // The first one is typically Go Engine Test, the second is App-Node. 
        // We can just rely on index or exact match if they differ. Both say "Test".
        fireEvent.click(testBtns[0]); // Test Go service

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/platform/settings/internal-service/test', {
                service: 'go',
                url: 'http://go-api'
            });
            expect(screen.getByText(/systemConfig.connected/i)).toBeInTheDocument();
        });

        // Test failure branch
        (api.post as any).mockRejectedValueOnce(new Error('Network error'));
        fireEvent.click(testBtns[1]); // Test App Node
        await waitFor(() => {
            expect(screen.getByText(/systemConfig.requestFailed/i)).toBeInTheDocument();
        });
    });

    it('tests SMTP correctly', async () => {
        render(<SystemConfig />);
        await waitFor(() => screen.getByText('systemConfig.title'));

        const testSmtpBtn = screen.getByRole('button', { name: /settingsPage.smtp.test/i });
        fireEvent.click(testSmtpBtn);

        // fetchSettings 映射后前端 state 为 smtp 格式
        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/platform/settings/system-email/test', {
                enabled: true,
                host: 'smtp.mail.com',
                port: 465,
                secure: true,
                user: 'test_user',
                pass: 'test_pass',
                from: 'from@mail.com',
            });
            expect(screen.getByText('✅ systemConfig.smtpSuccess')).toBeInTheDocument();
        });

        // Test failure branch
        (api.post as any).mockResolvedValueOnce({ data: { ok: false, message: 'Auth failed' } });
        fireEvent.click(testSmtpBtn);
        await waitFor(() => {
            expect(screen.getByText(/Auth failed/i)).toBeInTheDocument();
        });
    });

    it('handles saving configuration', async () => {
        render(<SystemConfig />);
        await waitFor(() => screen.getByText('systemConfig.title'));

        const maintenanceCheckbox = screen.getByLabelText(/systemConfig.maintenanceMode/i) as HTMLInputElement;
        expect(maintenanceCheckbox.checked).toBe(false);
        fireEvent.click(maintenanceCheckbox); // Enable

        const saveBtn = screen.getByRole('button', { name: /settingsPage.saveSettings/i });
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(api.patch).toHaveBeenCalledWith('/platform/settings', expect.objectContaining({
                sysConfig: expect.objectContaining({
                    maintenanceMode: true,
                })
            }));
            expect(screen.getByText('systemConfig.saveSuccess')).toBeInTheDocument();
        });
    });

    it('shows error when saving fails', async () => {
        (api.patch as any).mockRejectedValueOnce(new Error('Save failed'));
        render(<SystemConfig />);
        await waitFor(() => screen.getByText('systemConfig.title'));

        const saveBtn = screen.getByRole('button', { name: /settingsPage.saveSettings/i });
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(screen.getByText('systemConfig.saveFailed')).toBeInTheDocument();
        });
    });
});
