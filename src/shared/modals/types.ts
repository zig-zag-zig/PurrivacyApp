/**
 * Neutral modal types — extracted from component files so API-layer code
 * can import modal contracts without pulling in React/TSX dependencies.
 */

/** Options for the MFA (TOTP/recovery-code) modal. */
export type MfaModalOptions = {
    isSensitive?: boolean;
    isLoginFlow?: boolean;
    message?: string;
};

/** Options for the recovery-codes-display modal. */
export type RecoveryCodesModalOptions = {
    recoveryCodes: string[];
    source: 'setup' | 'regenerate' | 'auto-generated';
};

/** Resolved value when the MFA modal completes. */
export type MfaModalResult = {
    code: string | null;
};
