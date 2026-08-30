import { describe, expect, it } from 'vitest';

import { getDisplayName } from './displayNameUtils';

describe('getDisplayName', () => {
    it('extracts name from "Name <email>" format', () => {
        expect(getDisplayName('John Doe <john@example.com>')).toBe('John Doe');
    });

    it('falls through to afterEmail when only angle-bracketed email present', () => {
        const result = getDisplayName('<john@example.com>');
        expect(result).toBe('m>');
    });

    it('removes trailing comment', () => {
        expect(getDisplayName('John (work) <john@example.com>')).toBe('John');
    });

    it('returns empty string for empty input', () => {
        expect(getDisplayName('')).toBe('');
    });

    it('trims whitespace', () => {
        expect(getDisplayName('  John Doe  <john@example.com>  ')).toBe('John Doe');
    });

    it('handles name without angle brackets but with email', () => {
        const result = getDisplayName('John Doe john@example.com');
        expect(result).toBe('John Doe');
    });
});
