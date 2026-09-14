import { describe, expect, it } from 'vitest';

import { getDisplayName } from './displayNameUtils';

describe('getDisplayName', () => {
    it('extracts name from "Name <email>" format', () => {
        expect(getDisplayName('John Doe <john@example.com>')).toBe('John Doe');
    });

    it('shows only the email for an angle-bracketed email-only userId', () => {
        const result = getDisplayName('<john@example.com>');
        expect(result).toBe('john@example.com');
    });

    it('strips the angle brackets from an email-only userId without them', () => {
        expect(getDisplayName('john@example.com')).toBe('john@example.com');
    });

    it('strips a trailing comment from a name', () => {
        expect(getDisplayName('John (work) <john@example.com>')).toBe('John');
    });

    it('strips parentheses-wrapped comment from an email-only userId', () => {
        expect(getDisplayName('(work) <john@example.com>')).toBe('john@example.com');
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
