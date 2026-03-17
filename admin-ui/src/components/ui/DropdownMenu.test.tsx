import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { DropdownMenu } from './DropdownMenu';

describe('DropdownMenu', () => {
    const items = [
        { label: 'Option A', onClick: vi.fn() },
        { label: 'Option B', onClick: vi.fn() },
    ];

    beforeEach(() => {
        items.forEach(i => i.onClick.mockClear());
    });

    it('should render trigger button', () => {
        render(
            <DropdownMenu
                trigger={<button>Open Menu</button>}
                items={items}
            />
        );
        expect(screen.getByText('Open Menu')).toBeDefined();
    });

    it('should open the dropdown and show items', async () => {
        const user = userEvent.setup();
        render(
            <DropdownMenu
                trigger={<button>Open Menu</button>}
                items={items}
            />
        );

        await user.click(screen.getByText('Open Menu'));

        expect(screen.getByText('Option A')).toBeDefined();
        expect(screen.getByText('Option B')).toBeDefined();
    });

    it('should call onClick when item is selected', async () => {
        const user = userEvent.setup();
        render(
            <DropdownMenu
                trigger={<button>Open Menu</button>}
                items={items}
            />
        );

        await user.click(screen.getByText('Open Menu'));
        await user.click(screen.getByText('Option A'));

        expect(items[0].onClick).toHaveBeenCalledTimes(1);
    });
});
