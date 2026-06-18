import type { AuthErrorResponse } from '../../features/mfa/model/mfaTypes';

type AuthFlowErrorOptions = {
    mfaCancelled?: boolean;
    mfaTimedOut?: boolean;
    rateLimited?: boolean;
    requiresSignOut?: boolean;
    retryAfter?: string;
    retryAfterSeconds?: number;
    sessionError?: AuthErrorResponse;
    status?: number;
    wrongMfaCode?: boolean;
};

export class AuthFlowError extends Error {
    readonly mfaCancelled?: boolean;
    readonly mfaTimedOut?: boolean;
    readonly rateLimited?: boolean;
    readonly requiresSignOut?: boolean;
    readonly retryAfter?: string;
    readonly retryAfterSeconds?: number;
    readonly sessionError?: AuthErrorResponse;
    readonly status?: number;
    readonly wrongMfaCode?: boolean;

    constructor(message: string, options: AuthFlowErrorOptions = {}) {
        super(message);
        this.name = 'AuthFlowError';
        this.mfaCancelled = options.mfaCancelled;
        this.mfaTimedOut = options.mfaTimedOut;
        this.rateLimited = options.rateLimited;
        this.requiresSignOut = options.requiresSignOut;
        this.retryAfter = options.retryAfter;
        this.retryAfterSeconds = options.retryAfterSeconds;
        this.sessionError = options.sessionError;
        this.status = options.status;
        this.wrongMfaCode = options.wrongMfaCode;
    }
}
