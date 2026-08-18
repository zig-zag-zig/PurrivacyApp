import { afterEach, describe, expect, it, vi } from 'vitest';
import { pendingSignupSession } from './pendingSignupSession';

const payload = { seed: 'seed words here', username: 'alice', password: 'hunter2!' };

describe('pendingSignupSession (APP-SEC-007)', () => {
    afterEach(() => {
        pendingSignupSession.clear();
        vi.useRealTimers();
    });

    it('stores and consumes secrets exactly once', () => {
        pendingSignupSession.set(payload);

        expect(pendingSignupSession.has()).toBe(true);
        expect(pendingSignupSession.consume()).toEqual(payload);
        expect(pendingSignupSession.consume()).toBeNull();
        expect(pendingSignupSession.has()).toBe(false);
    });

    it('returns a copy so stored secrets cannot be mutated externally', () => {
        pendingSignupSession.set(payload);

        const consumed = pendingSignupSession.consume()!;
        consumed.seed = 'tampered';

        pendingSignupSession.set(payload);
        const second = pendingSignupSession.consume()!;
        expect(second.seed).toBe(payload.seed);
    });

    it('discards expired sessions on consume and has()', () => {
        vi.useFakeTimers();
        vi.setSystemTime(Date.now());

        pendingSignupSession.set(payload);
        vi.advanceTimersByTime(10 * 60 * 1000 + 1);

        expect(pendingSignupSession.has()).toBe(false);
        expect(pendingSignupSession.consume()).toBeNull();
    });

    it('keeps sessions within the TTL', () => {
        vi.useFakeTimers();
        vi.setSystemTime(Date.now());

        pendingSignupSession.set(payload);
        vi.advanceTimersByTime(9 * 60 * 1000);

        expect(pendingSignupSession.consume()).toEqual(payload);
    });

    it('clear() discards any pending signup', () => {
        pendingSignupSession.set(payload);
        pendingSignupSession.clear();

        expect(pendingSignupSession.has()).toBe(false);
        expect(pendingSignupSession.consume()).toBeNull();
    });
});
