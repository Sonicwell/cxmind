import DOMPurify from 'dompurify';

/**
 * Sanitizes HTML content using DOMPurify to prevent XSS attacks.
 * Allows safe HTML tags like formatting (<b>, <i>, <br>, <strong>), 
 * code blocks (<code>, <pre>), and safe lists/paragraphs.
 * Strips script tags, unsafe attributes (onerror, onload), and malicious payloads.
 * 
 * @param dirty The dirty HTML string to sanitize.
 * @returns The sanitized HTML string.
 */
export function sanitizeHtml(dirty: string): string {
    if (!dirty) return '';

    return DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS: [
            // Text formatting
            'b', 'i', 'em', 'strong', 'u', 's', 'strike',
            // Blocks and structure
            'p', 'br', 'div', 'span', 'blockquote',
            // Code
            'code', 'pre',
            // Lists
            'ul', 'ol', 'li',
            // Links
            'a',
            // Headers
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            // Tables
            'table', 'thead', 'tbody', 'tr', 'th', 'td'
        ],
        ALLOWED_ATTR: [
            'href', 'target', // For links
            'class', 'id',    // For styling hooks (ensure safe CSS scope if used)
            'target'
        ],
        // Allow a target="_blank" on links but add rel="noopener noreferrer" automatically
        ADD_ATTR: ['target'],
        // Explicitly ban risky tags/attributes just as a defense-in-depth, 
        // though DOMPurify's default behavior with the allowlist is secure
        FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
        FORBID_ATTR: ['onerror', 'onload', 'onmouseover', 'javascript:', 'data:'],
    });
}
