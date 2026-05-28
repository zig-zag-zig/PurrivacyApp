import { MfaModalOptions } from '../features/mfa/components/MfaModal';
import { RecoveryCodesModalOptions } from '../features/mfa/components/RecoveryCodesModal';
import { MfaModalResult } from '../app/state/ModalContext';

type MfaModalHandler = (options: MfaModalOptions) => Promise<MfaModalResult>;
type RecoveryCodesModalHandler = (options: RecoveryCodesModalOptions) => Promise<void>;

let mfaModalHandler: MfaModalHandler | null = null;
let recoveryCodesModalHandler: RecoveryCodesModalHandler | null = null;

export const setMfaModalHandler = (handler: MfaModalHandler | null) => {
    mfaModalHandler = handler;
};

export const setRecoveryCodesModalHandler = (handler: RecoveryCodesModalHandler | null) => {
    recoveryCodesModalHandler = handler;
};

export const getMfaModalHandler = (): MfaModalHandler | null => {
    return mfaModalHandler;
};

export const getRecoveryCodesModalHandler = (): RecoveryCodesModalHandler | null => {
    return recoveryCodesModalHandler;
};
