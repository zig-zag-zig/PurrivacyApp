import { describe, expect, it } from 'vitest';
import {
    CLIPBOARD_SENSITIVITY_TTL_MS,
    ClipboardSensitivity,
    DEFAULT_CLIPBOARD_SENSITIVITY,
    getClipboardTtlMs,
} from './clipboardSensitivity';

describe('clipboard sensitivity classes (APP-SEC-005)', () => {
    it('maps each sensitivity class to its own TTL', () => {
        expect(CLIPBOARD_SENSITIVITY_TTL_MS.high).toBe(20_000);
        expect(CLIPBOARD_SENSITIVITY_TTL_MS.medium).toBe(60_000);
        expect(CLIPBOARD_SENSITIVITY_TTL_MS.low).toBe(180_000);
    });

    it('orders TTLs so root secrets expire faster than plaintext, which expires faster than public material', () => {
        expect(CLIPBOARD_SENSITIVITY_TTL_MS.high).toBeLessThan(CLIPBOARD_SENSITIVITY_TTL_MS.medium);
        expect(CLIPBOARD_SENSITIVITY_TTL_MS.medium).toBeLessThan(CLIPBOARD_SENSITIVITY_TTL_MS.low);
    });

    it('defaults to the high class so unspecified copies are treated as root secrets', () => {
        expect(DEFAULT_CLIPBOARD_SENSITIVITY).toBe('high');
        expect(getClipboardTtlMs()).toBe(CLIPBOARD_SENSITIVITY_TTL_MS.high);
    });

    it('returns the per-class TTL for explicit classes', () => {
        const classes: ClipboardSensitivity[] = ['high', 'medium', 'low'];
        for (const sensitivity of classes) {
            expect(getClipboardTtlMs(sensitivity)).toBe(CLIPBOARD_SENSITIVITY_TTL_MS[sensitivity]);
        }
    });
});
