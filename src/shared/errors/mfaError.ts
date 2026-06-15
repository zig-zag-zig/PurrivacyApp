/**
 * Typed error for MFA-related failures.
 *
 * Replaces plain-object throws like `{ wrongMfaCode, mfaRequired }` so that
 * catch blocks can use `instanceof MfaError` checks.
 *
 * Usage:
 *   throw new MfaError('Wrong MFA code', { wrongMfaCode: true });
 *   catch (e) { if (e instanceof MfaError) { ... } }
 */

type MfaErrorOptions = {
    wrongMfaCode?: boolean;
    mfaRequired?: boolean;
    mfaRequiredSensitive?: boolean;
    mfaCancelled?: boolean;
    mfaTimedOut?: boolean;
    retryAfterSeconds?: number;
};

export class MfaError extends Error {
    readonly wrongMfaCode?: boolean;
    readonly mfaRequired?: boolean;
    readonly mfaRequiredSensitive?: boolean;
    readonly mfaCancelled?: boolean;
    readonly mfaTimedOut?: boolean;
    readonly retryAfterSeconds?: number;

    constructor(message: string, options: MfaErrorOptions = {}) {
        super(message);
        this.name = 'MfaError';
        this.wrongMfaCode = options.wrongMfaCode;
        this.mfaRequired = options.mfaRequired;
        this.mfaRequiredSensitive = options.mfaRequiredSensitive;
        this.mfaCancelled = options.mfaCancelled;
        this.mfaTimedOut = options.mfaTimedOut;
        this.retryAfterSeconds = options.retryAfterSeconds;
    }
}
