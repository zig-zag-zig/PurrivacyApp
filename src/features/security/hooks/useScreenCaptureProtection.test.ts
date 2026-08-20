import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-screen-capture', () => ({
    preventScreenCaptureAsync: vi.fn(),
    allowScreenCaptureAsync: vi.fn(),
}));

import { screenCaptureEffect } from './useScreenCaptureProtection';

describe('screenCaptureEffect (APP-SEC-003 iOS)', () => {
    it('prevents capture while active on iOS and returns a cleanup that allows it again', () => {
        const prevent = vi.fn();
        const allow = vi.fn();

        const cleanup = screenCaptureEffect(true, 'ios', prevent, allow);

        expect(prevent).toHaveBeenCalledTimes(1);
        expect(allow).not.toHaveBeenCalled();

        cleanup!();
        expect(allow).toHaveBeenCalledTimes(1);
    });

    it('does nothing while inactive', () => {
        const prevent = vi.fn();
        const allow = vi.fn();

        const cleanup = screenCaptureEffect(false, 'ios', prevent, allow);

        expect(cleanup).toBeUndefined();
        expect(prevent).not.toHaveBeenCalled();
        expect(allow).not.toHaveBeenCalled();
    });

    it('does nothing on Android (FLAG_SECURE is applied natively at prebuild)', () => {
        const prevent = vi.fn();
        const allow = vi.fn();

        const cleanup = screenCaptureEffect(true, 'android', prevent, allow);

        expect(cleanup).toBeUndefined();
        expect(prevent).not.toHaveBeenCalled();
        expect(allow).not.toHaveBeenCalled();
    });
});
