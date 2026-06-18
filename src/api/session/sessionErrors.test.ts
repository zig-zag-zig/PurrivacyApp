import { describe, expect, it, vi } from 'vitest';

vi.mock('../../services/eventService', () => ({
    EventService: { addEvent: vi.fn() },
}));

import {
    isRateLimitError,
    isTerminalStoredSessionError,
    isStoredSessionMfaRequired,
    markRequiresSignOut,
    missingStoredSessionError,
    throwStoredSessionAuthFailure,
    isExpectedSessionCreationError,
} from './sessionErrors';
import { EventService } from '../../services/eventService';
import { AuthFlowError } from '../auth/authFlowError';

describe('isRateLimitError', () => {
    it('returns true for rateLimited flag', () => {
        expect(isRateLimitError({ rateLimited: true })).toBe(true);
    });

    it('returns true for status 429', () => {
        expect(isRateLimitError({ status: 429 })).toBe(true);
    });

    it('returns true for retryAfter', () => {
        expect(isRateLimitError({ retryAfter: '30' })).toBe(true);
    });

    it('returns true for nested sessionError.rateLimited', () => {
        expect(isRateLimitError({ sessionError: { rateLimited: true } })).toBe(true);
    });

    it('returns true for nested sessionError.status 429', () => {
        expect(isRateLimitError({ sessionError: { status: 429 } })).toBe(true);
    });

    it('returns false for unrelated error', () => {
        expect(isRateLimitError({ status: 500 })).toBe(false);
    });
});

describe('isTerminalStoredSessionError', () => {
    it('returns true for requiresSignOut', () => {
        expect(isTerminalStoredSessionError({ requiresSignOut: true })).toBe(true);
    });

    it('returns true for direct refreshTokenMissing', () => {
        expect(isTerminalStoredSessionError({ refreshTokenMissing: true })).toBe(true);
    });

    it('returns true for direct refreshTokenInvalid', () => {
        expect(isTerminalStoredSessionError({ refreshTokenInvalid: true })).toBe(true);
    });

    it('returns true for direct refreshTokenExpired', () => {
        expect(isTerminalStoredSessionError({ refreshTokenExpired: true })).toBe(true);
    });

    it('returns true for direct refreshTokenReuse', () => {
        expect(isTerminalStoredSessionError({ refreshTokenReuse: true })).toBe(true);
    });

    it('returns true for nested sessionError.refreshTokenMissing', () => {
        expect(
            isTerminalStoredSessionError({ sessionError: { refreshTokenMissing: true } }),
        ).toBe(true);
    });

    it('returns true for nested sessionError.refreshTokenInvalid', () => {
        expect(
            isTerminalStoredSessionError({ sessionError: { refreshTokenInvalid: true } }),
        ).toBe(true);
    });

    it('returns false for unrelated error', () => {
        expect(isTerminalStoredSessionError({ status: 500 })).toBe(false);
    });
});

describe('isStoredSessionMfaRequired', () => {
    it('returns true for direct mfaRequired', () => {
        expect(isStoredSessionMfaRequired({ mfaRequired: true })).toBe(true);
    });

    it('returns true for nested sessionError.mfaRequired', () => {
        expect(
            isStoredSessionMfaRequired({ sessionError: { mfaRequired: true } }),
        ).toBe(true);
    });

    it('returns false when mfaRequired is absent', () => {
        expect(isStoredSessionMfaRequired({ status: 401 })).toBe(false);
    });
});

describe('markRequiresSignOut', () => {
    it('mutates object error to set requiresSignOut', () => {
        const error = { status: 401 } as any;
        const result = markRequiresSignOut(error);
        expect(result.requiresSignOut).toBe(true);
        expect(result).toBe(error);
    });

    it('wraps non-object value in new object', () => {
        const result = markRequiresSignOut('bad' as any);
        expect(result).toEqual({ error: 'bad', requiresSignOut: true });
    });
});

describe('missingStoredSessionError', () => {
    it('returns AuthFlowError with refresh token missing', () => {
        const err = missingStoredSessionError();
        expect(err).toBeInstanceOf(AuthFlowError);
        expect(err.message).toBe('Stored session is missing a refresh token');
        expect(err.requiresSignOut).toBe(true);
        expect(err.status).toBe(401);
    });
});

describe('throwStoredSessionAuthFailure', () => {
    it('throws error with requiresSignOut and emits signOut event', () => {
        const error = { status: 401 } as any;
        expect(() => throwStoredSessionAuthFailure(error, true)).toThrow();
        expect(EventService.addEvent).toHaveBeenCalledWith('signOut');
    });

    it('throws without emitting when emitSignOut is false', () => {
        vi.mocked(EventService.addEvent).mockClear();
        const error = { status: 401 } as any;
        expect(() => throwStoredSessionAuthFailure(error, false)).toThrow();
        expect(EventService.addEvent).not.toHaveBeenCalled();
    });
});

describe('isExpectedSessionCreationError', () => {
    it('returns true for terminal session errors', () => {
        expect(isExpectedSessionCreationError({ requiresSignOut: true })).toBe(true);
    });

    it('returns true for rate limit errors', () => {
        expect(isExpectedSessionCreationError({ rateLimited: true })).toBe(true);
    });

    it('returns true for mfaRequired', () => {
        expect(isExpectedSessionCreationError({ mfaRequired: true })).toBe(true);
    });

    it('returns true for mfaRequiredSensitive', () => {
        expect(isExpectedSessionCreationError({ mfaRequiredSensitive: true })).toBe(true);
    });

    it('returns true for mfaCancelled', () => {
        expect(isExpectedSessionCreationError({ mfaCancelled: true })).toBe(true);
    });

    it('returns true for wrongMfaCode', () => {
        expect(isExpectedSessionCreationError({ wrongMfaCode: true })).toBe(true);
    });

    it('returns true for nested sessionError.mfaRequired', () => {
        expect(
            isExpectedSessionCreationError({ sessionError: { mfaRequired: true } }),
        ).toBe(true);
    });

    it('returns true for nested sessionError.wrongMfaCode', () => {
        expect(
            isExpectedSessionCreationError({ sessionError: { wrongMfaCode: true } }),
        ).toBe(true);
    });

    it('returns false for unrelated error', () => {
        expect(isExpectedSessionCreationError({ status: 500 })).toBe(false);
    });
});
