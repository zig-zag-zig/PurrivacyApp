import type { EncryptedPayload, SaltedEncryptedPayload } from '@purrivacy/shared';
export type { EncryptedPayload, SaltedEncryptedPayload };

export interface UserEncryptedData {
    dekPassword: SaltedEncryptedPayload;
    dekSeed: SaltedEncryptedPayload;
    keys: EncryptedPayload[];
}

export interface EncryptedKeyRecordWithId {
    recordId: string;
    key: EncryptedPayload;
}

export interface UserEncryptedKeyRecordsResponse {
    keys: Array<EncryptedPayload & { recordId: string }>;
    nextCursor?: string;
}

export interface KeyRecordListOptions {
    limit?: number;
    cursor?: string;
    since?: number;
}

export interface UserRecoveryEncryptedData {
    dekSeed: SaltedEncryptedPayload;
}

export interface User extends UserEncryptedData {
    mfaEnabled?: boolean;
    recoveryVerifierSalt: string;
    recoveryVerifierHash: string;
}

export interface UserMfaSecurity {
    mfaSecret: string; // Encrypted with MFA_KEK
    mfaSecretIv: string;
    mfaSecretTag: string;
    mfaRecoveryCodes: string[]; // Array of hashed recovery codes
}

export interface SessionTrustRequest {
    mfaTrusted?: boolean;
}

export interface SessionResponse {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: string;
    refreshTokenExpiresAt: string;
    mfaTrusted: boolean;
    mfaEnabled: boolean;
    /**
     * The refresh-token family id backing this session. Used by clients and
     * by state transitions to exclude the session from bulk revocation.
     */
    sessionFamilyId: string;
}

export interface AuthErrorDetails {
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

export interface Session {
    accessTokenHash: string;
    userId: string;
    refreshTokenFamilyId: string;
    createdAt: Date;
    expiresAt: Date;
    userHasMfa?: boolean;
}

export interface RefreshTokenFamily {
    familyId: string;
    userId: string;
    deviceId?: string;
    createdAt: Date;
    lastUsedAt: Date;
    expiresAt: Date;
    revokedAt?: Date | null;
    userHasMfa: boolean;
    mfaTrusted: boolean;
    mfaVerifiedAt?: Date | null;
    label?: string;
    platform?: string;
}

export interface RefreshToken {
    tokenId: string;
    familyId: string;
    userId: string;
    tokenHash: string;
    createdAt: Date;
    expiresAt: Date;
    usedAt?: Date | null;
    revokedAt?: Date | null;
    replacedByTokenId?: string | null;
}
