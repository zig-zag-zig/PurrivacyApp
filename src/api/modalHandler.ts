import type { MfaModalOptions, RecoveryCodesModalOptions, MfaModalResult } from '../shared/modals/types';

type MfaModalHandler = (options: MfaModalOptions) => Promise<MfaModalResult>;
type RecoveryCodesModalHandler = (options: RecoveryCodesModalOptions) => Promise<void>;
type PassphraseStorageConsentHandler = () => Promise<boolean>;

let mfaModalHandler: MfaModalHandler | null = null;
let recoveryCodesModalHandler: RecoveryCodesModalHandler | null = null;
let passphraseStorageConsentHandler: PassphraseStorageConsentHandler | null = null;

export const setMfaModalHandler = (handler: MfaModalHandler | null) => {
    mfaModalHandler = handler;
};

export const clearMfaModalHandler = (handler: MfaModalHandler) => {
    if (mfaModalHandler === handler) {
        mfaModalHandler = null;
    }
};

export const setRecoveryCodesModalHandler = (handler: RecoveryCodesModalHandler | null) => {
    recoveryCodesModalHandler = handler;
};

export const clearRecoveryCodesModalHandler = (handler: RecoveryCodesModalHandler) => {
    if (recoveryCodesModalHandler === handler) {
        recoveryCodesModalHandler = null;
    }
};

export const setPassphraseStorageConsentHandler = (
    handler: PassphraseStorageConsentHandler | null,
) => {
    passphraseStorageConsentHandler = handler;
};

export const clearPassphraseStorageConsentHandler = (handler: PassphraseStorageConsentHandler) => {
    if (passphraseStorageConsentHandler === handler) {
        passphraseStorageConsentHandler = null;
    }
};

export const getMfaModalHandler = (): MfaModalHandler | null => {
    return mfaModalHandler;
};

export const getRecoveryCodesModalHandler = (): RecoveryCodesModalHandler | null => {
    return recoveryCodesModalHandler;
};

export const getPassphraseStorageConsentHandler = (): PassphraseStorageConsentHandler | null => {
    return passphraseStorageConsentHandler;
};
