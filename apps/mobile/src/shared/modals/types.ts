/**
 * Neutral modal types — extracted from component files so API-layer code
 * can import modal contracts without pulling in React/TSX dependencies.
 */

/** Options for the MFA (TOTP/recovery-code) modal. */
export type MfaModalOptions = {
    isSensitive?: boolean;
    isLoginFlow?: boolean;
    /**
     * Defaults to showing the recovery-code toggle for sensitive/login
     * flows. MFA enrollment (enable) passes false: no recovery codes exist
     * yet, and only a real authenticator TOTP proves the setup works.
     */
    allowRecoveryCode?: boolean;
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

/**
 * Discriminated union describing every modal the ModalProvider can display.
 * `type` drives rendering and back-press handling; `options` carries the
 * per-modal props (absent for payload-less modals).
 */
export type ModalRequest =
    | { type: 'mfa'; options: MfaModalOptions }
    | { type: 'recoveryCodes'; options: RecoveryCodesModalOptions }
    | { type: 'passphraseStorageConsent' };
