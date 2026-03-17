import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from './sanitize';

describe('sanitizeHtml Utility', () => {
    it('allows basic safe HTML tags (b, strong, i, em)', () => {
        const input = 'This is <b>bold</b> and <em>emphasized</em> text.';
        const expected = 'This is <b>bold</b> and <em>emphasized</em> text.';
        expect(sanitizeHtml(input)).toBe(expected);
    });

    it('strips <script> tags and their contents completely', () => {
        const input = 'Hello <script>alert("XSS")</script> World';
        // DOMPurify removes the tag and its content
        expect(sanitizeHtml(input)).toBe('Hello  World');
    });

    it('removes unsafe inline event handlers like onerror', () => {
        const input = '<img src="x" onerror="alert(1)"> test';
        // <img> tag is not in our allowlist, so the entire tag should be stripped
        expect(sanitizeHtml(input)).toBe(' test');
    });

    it('removes javascript: URIs', () => {
        const input = '<a href="javascript:alert(1)">Click Me</a>';
        // DOMPurify strips javascript: URIs from href
        const result = sanitizeHtml(input);
        expect(result).not.toContain('javascript:alert(1)');
        expect(result).toContain('<a>Click Me</a>');
    });

    it('allows safe formatting tags used in markdown parsing', () => {
        const input = '<pre><code>console.log("hello");</code></pre>';
        const expected = '<pre><code>console.log("hello");</code></pre>';
        expect(sanitizeHtml(input)).toBe(expected);
    });

    it('handles empty input safely', () => {
        expect(sanitizeHtml('')).toBe('');
        // @ts-ignore - testing runtime behavior with invalid inputs
        expect(sanitizeHtml(null)).toBe('');
        // @ts-ignore
        expect(sanitizeHtml(undefined)).toBe('');
    });

    it('handles complex nested malicious payloads', () => {
        const input = '<div class="alert"><span onmouseover="stealTokens()">Hover</span> <<script>script>evil</script></div>';
        const expected = '<div class="alert"><span>Hover</span> &lt;</div>';
        expect(sanitizeHtml(input)).toBe(expected);
    });
});
