import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    subscribePassphraseBannerDismiss,
    suppressNextPassphraseBannerDismiss,
    subscribePassphraseBannerReposition,
    requestPassphraseBannerReposition,
    requestPassphraseBannerDismiss,
    resetForTesting,
} from '../services/passphraseBannerEvents';

beforeEach(() => {
    resetForTesting();
    vi.useFakeTimers();
});

describe('subscribePassphraseBannerDismiss', () => {
    it('returns an unsubscribe function', () => {
        const listener = vi.fn();
        const unsubscribe = subscribePassphraseBannerDismiss(listener);
        expect(typeof unsubscribe).toBe('function');
        unsubscribe();
    });

    it('notifies listeners when dismiss is requested', () => {
        const listener = vi.fn();
        const unsubscribe = subscribePassphraseBannerDismiss(listener);

        try {
            requestPassphraseBannerDismiss();
            vi.runAllTimers();

            expect(listener).toHaveBeenCalled();
        } finally {
            unsubscribe();
        }
    });

    it('does not notify unsubscribed listeners', () => {
        const listener = vi.fn();
        const unsubscribe = subscribePassphraseBannerDismiss(listener);
        unsubscribe();

        requestPassphraseBannerDismiss();
        vi.runAllTimers();

        expect(listener).not.toHaveBeenCalled();
    });
});

describe('suppressNextPassphraseBannerDismiss', () => {
    it('suppresses dismiss for a short window', () => {
        const listener = vi.fn();
        const unsubscribe = subscribePassphraseBannerDismiss(listener);

        try {
            suppressNextPassphraseBannerDismiss();
            requestPassphraseBannerDismiss();
            vi.runAllTimers();

            expect(listener).not.toHaveBeenCalled();
        } finally {
            unsubscribe();
        }
    });
});

describe('subscribePassphraseBannerReposition', () => {
    it('notifies listeners when reposition is requested', () => {
        const listener = vi.fn();
        const unsubscribe = subscribePassphraseBannerReposition(listener);

        try {
            requestPassphraseBannerReposition();

            expect(listener).toHaveBeenCalled();
        } finally {
            unsubscribe();
        }
    });

    it('does not notify unsubscribed reposition listeners', () => {
        const listener = vi.fn();
        const unsubscribe = subscribePassphraseBannerReposition(listener);
        unsubscribe();

        requestPassphraseBannerReposition();

        expect(listener).not.toHaveBeenCalled();
    });
});
