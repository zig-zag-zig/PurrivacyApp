import { MfaModalOptions } from '../features/mfa/components/MfaModal';
import { RecoveryCodesModalOptions } from '../features/mfa/components/RecoveryCodesModal';
import { MfaModalResult } from '../app/state/ModalContext';

type MfaModalHandler = (options: MfaModalOptions) => Promise<MfaModalResult>;
type RecoveryCodesModalHandler = (options: RecoveryCodesModalOptions) => Promise<void>;
type PassphraseStorageConsentHandler = () => Promise<boolean>;

let mfaModalHandler: MfaModalHandler | null = null;
let recoveryCodesModalHandler: RecoveryCodesModalHandler | null = null;
let passphraseStorageConsentHandler: PassphraseStorageConsentHandler | null = null;

export const setMfaModalHandler = (handler: MfaModalHandler | null) => {
    mfaModalHandler = handler;
};

export const setRecoveryCodesModalHandler = (handler: RecoveryCodesModalHandler | null) => {
    recoveryCodesModalHandler = handler;
};

export const setPassphraseStorageConsentHandler = (
    handler: PassphraseStorageConsentHandler | null,
) => {
    passphraseStorageConsentHandler = handler;
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
