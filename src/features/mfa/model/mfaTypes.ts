export interface AuthErrorResponse {
    sessionHeaderMissing?: boolean;
    deviceHeaderMissing?: boolean;
    bearerHeaderMissing?: boolean;
    bearerTokenInvalid?: boolean;
    sessionInvalid?: boolean;
    sessionExpired?: boolean;
    accessTokenInvalid?: boolean;
    accessTokenExpired?: boolean;
    refreshTokenMissing?: boolean;
    refreshTokenInvalid?: boolean;
    refreshTokenExpired?: boolean;
    refreshTokenReuse?: boolean;
    mfaRequired?: boolean;
    wrongMfaCode?: boolean;
    mfaRequiredSensitive?: boolean;
}

export interface MfaSetupResponse {
    secret: string;
    otpauthUrl: string;
    recoveryCodes: string[];
    message: string;
}

export interface RecoveryCodeRegenerateResponse {
    recoveryCodes: string[];
}

export interface RecoveryCodeRemainingResponse {
    remainingCodes: number;
}

export interface MfaState {
    mfaEnabled: boolean;
    mfaTrusted: boolean;
}
