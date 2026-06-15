/**
 * Typed error for session-related failures.
 *
 * Replaces plain-object throws like `{ sessionError, status }` so that
 * catch blocks can use `instanceof SessionError` checks.
 *
 * Usage:
 *   throw new SessionError('Session expired', { sessionError, status: 401 });
 *   catch (e) { if (e instanceof SessionError) { ... } }
 */

import type { AuthErrorResponse } from '../../types/types';

type SessionErrorOptions = {
    sessionError?: AuthErrorResponse;
    status?: number;
    requiresSignOut?: boolean;
};

export class SessionError extends Error {
    readonly sessionError?: AuthErrorResponse;
    readonly status?: number;
    requiresSignOut?: boolean;

    constructor(message: string, options: SessionErrorOptions = {}) {
        super(message);
        this.name = 'SessionError';
        this.sessionError = options.sessionError;
        this.status = options.status;
        this.requiresSignOut = options.requiresSignOut;
    }
}
