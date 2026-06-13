import { describe, expect, it } from 'vitest';

import {
    formatPublishedDate,
    formatBytes,
    getProgressLabel,
    getUpdateStatusPresentation,
} from './updateCopy';

describe('formatPublishedDate', () => {
    it('returns a formatted date string for valid date', () => {
        const result = formatPublishedDate('2025-12-25T00:00:00Z');
        expect(result).not.toBeNull();
        expect(result).toContain('2025');
    });

    it('returns null for null input', () => {
        expect(formatPublishedDate(null)).toBeNull();
    });

    it('returns null for invalid date string', () => {
        expect(formatPublishedDate('not-a-date')).toBeNull();
    });
});

describe('formatBytes', () => {
    it('formats KB correctly', () => {
        expect(formatBytes(2048)).toBe('2 KB');
    });

    it('formats MB with one decimal for values >= 1MB and < 10MB', () => {
        expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
    });

    it('formats MB with no decimal for values >= 10MB', () => {
        expect(formatBytes(12 * 1024 * 1024)).toBe('12 MB');
    });

    it('formats MB with one decimal for < 10MB', () => {
        expect(formatBytes(5.5 * 1024 * 1024)).toBe('5.5 MB');
    });

    it('returns null for zero', () => {
        expect(formatBytes(0)).toBeNull();
    });

    it('returns null for negative values', () => {
        expect(formatBytes(-100)).toBeNull();
    });

    it('returns null for null', () => {
        expect(formatBytes(null)).toBeNull();
    });
});

describe('getProgressLabel', () => {
    it('returns Preparing installer for checking-permission', () => {
        expect(getProgressLabel({ stage: 'checking-permission' } as any)).toBe('Preparing installer');
    });

    it('returns Downloading update for downloading', () => {
        expect(getProgressLabel({ stage: 'downloading' } as any)).toBe('Downloading update');
    });

    it('returns Opening installer for opening-installer', () => {
        expect(getProgressLabel({ stage: 'opening-installer' } as any)).toBe('Opening installer');
    });

    it('returns Preparing update for null', () => {
        expect(getProgressLabel(null)).toBe('Preparing update');
    });

    it('returns Preparing update for unknown stage', () => {
        expect(getProgressLabel({ stage: 'unknown' } as any)).toBe('Preparing update');
    });
});

describe('getUpdateStatusPresentation', () => {
    it('returns correct presentation for available', () => {
        const p = getUpdateStatusPresentation('available');
        expect(p.title).toBe('Update Available');
        expect(p.tone).toBe('primary');
    });

    it('returns correct presentation for current', () => {
        const p = getUpdateStatusPresentation('current');
        expect(p.title).toBe('App Is Up To Date');
        expect(p.tone).toBe('success');
    });

    it('returns correct presentation for not_found', () => {
        const p = getUpdateStatusPresentation('not_found');
        expect(p.title).toBe('No Public Release Found');
        expect(p.tone).toBe('info');
    });

    it('returns correct presentation for checking', () => {
        const p = getUpdateStatusPresentation('checking');
        expect(p.title).toBe('Checking for Updates');
        expect(p.tone).toBe('primary');
    });

    it('returns error presentation for error status', () => {
        const p = getUpdateStatusPresentation('error');
        expect(p.title).toBe('Update Check Failed');
        expect(p.tone).toBe('error');
    });

    it('returns error presentation for idle status', () => {
        const p = getUpdateStatusPresentation('idle');
        expect(p.title).toBe('Update Check Failed');
        expect(p.tone).toBe('error');
    });
});
