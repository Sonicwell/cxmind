import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption, TableFooter } from './table';
import React from 'react';

describe('Table components', () => {
    it('renders Table with children', () => {
        render(
            <Table>
                <TableBody>
                    <TableRow>
                        <TableCell>data</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        );
        expect(screen.getByText('data')).toBeTruthy();
    });

    it('renders TableHeader', () => {
        render(
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Col</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody><TableRow><TableCell>x</TableCell></TableRow></TableBody>
            </Table>
        );
        expect(screen.getByText('Col')).toBeTruthy();
    });

    it('renders TableCaption', () => {
        render(
            <Table>
                <TableCaption>My Caption</TableCaption>
                <TableBody><TableRow><TableCell>x</TableCell></TableRow></TableBody>
            </Table>
        );
        expect(screen.getByText('My Caption')).toBeTruthy();
    });

    it('renders TableFooter', () => {
        render(
            <Table>
                <TableBody><TableRow><TableCell>x</TableCell></TableRow></TableBody>
                <TableFooter>
                    <TableRow><TableCell>Total</TableCell></TableRow>
                </TableFooter>
            </Table>
        );
        expect(screen.getByText('Total')).toBeTruthy();
    });

    it('accepts custom className', () => {
        const { container } = render(
            <Table className="my-table">
                <TableBody><TableRow><TableCell>x</TableCell></TableRow></TableBody>
            </Table>
        );
        expect(container.querySelector('table.my-table')).toBeTruthy();
    });
});
