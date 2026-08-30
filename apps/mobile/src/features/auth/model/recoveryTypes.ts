import type { RecoveryEncrypted } from './userTypes';

export interface RecoveryChallengeResponse {
    recoveryVerifierSalt: string;
}

export interface RecoveryTokenResponse {
    userId: string;
    userEncrypted: RecoveryEncrypted;
    tempToken: string;
}
