import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
    default: {
        nativeAppVersion: '1.0.0',
        expoConfig: { version: '1.0.0' },
    },
}));

import { normalizeVersion, compareVersions } from './updateVersion';

describe('normalizeVersion', () => {
    it('strips v prefix', () => {
        expect(normalizeVersion('v1.2.3')).toBe('1.2.3');
    });

    it('strips V prefix (case insensitive)', () => {
        expect(normalizeVersion('V2.0.0')).toBe('2.0.0');
    });

    it('strips build metadata after +', () => {
        expect(normalizeVersion('1.2.3+build.456')).toBe('1.2.3');
    });

    it('strips both v prefix and build metadata', () => {
        expect(normalizeVersion('v3.0.1+abc')).toBe('3.0.1');
    });

    it('trims whitespace', () => {
        expect(normalizeVersion('  1.0.0  ')).toBe('1.0.0');
    });
});

describe('compareVersions', () => {
    it('returns 0 for equal versions', () => {
        expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    });

    it('returns 1 when a > b (patch bump)', () => {
        expect(compareVersions('1.2.4', '1.2.3')).toBe(1);
    });

    it('returns -1 when a < b (minor bump)', () => {
        expect(compareVersions('1.1.0', '1.2.0')).toBe(-1);
    });

    it('returns 1 for major bump', () => {
        expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    });

    it('handles v prefix normalization', () => {
        expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    });

    it('handles different segment lengths', () => {
        expect(compareVersions('1.0', '1.0.0')).toBe(0);
    });

    it('handles pre-release via normalize stripping', () => {
        expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(0);
    });

    it('returns 1 for invalid input when not equal', () => {
        expect(compareVersions('abc', 'def')).toBe(1);
    });

    it('returns 0 for identical invalid input', () => {
        expect(compareVersions('abc', 'abc')).toBe(0);
    });
});
