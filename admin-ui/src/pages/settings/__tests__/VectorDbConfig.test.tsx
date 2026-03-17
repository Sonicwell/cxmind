import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import VectorDbConfig from '../VectorDbConfig';
import api from '../../../services/api';

// Mock the API responses
vi.mock('../../../services/api', () => ({
    default: {
        get: vi.fn().mockResolvedValue({
            data: {
                data: {
                    vectorDb: { provider: 'pinecone', apiKey: 'mock-key' }
                }
            }
        }),
        patch: vi.fn(),
        post: vi.fn(),
    }
}));

describe('VectorDbConfig Password Accessibility', () => {
    it('should have autoComplete="new-password" on password inputs to prevent UX issues', async () => {
        render(<VectorDbConfig />);

        // Wait for the mock API call to settle and the form to update
        await waitFor(() => {
            const passwordInput = screen.getByPlaceholderText(/Enter API Key/i);
            expect(passwordInput).toBeInTheDocument();
            expect(passwordInput).toHaveAttribute('type', 'password');
            expect(passwordInput).toHaveAttribute('autoComplete', 'new-password');
        });
    });
});
