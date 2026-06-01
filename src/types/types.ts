export interface KeyPair extends KeyMetadata, KeyPairBase { }

export interface KeyPairBase {
    privateKey: string | null;
    publicKey: string;
    isDefault: boolean;
}

export interface PublicAndPrivateKey {
    publicKey: string;
    privateKey: string;
}

export type PgpAlgorithm = 'RSA' | 'ECDSA' | 'EDDSA';

export interface KeyGenerationOptions {
    algorithm: PgpAlgorithm;
    bitStrength: 2048 | 3072 | 4096;
    name: string;
    email: string;
    comment: string;
    passphrase: string;
    days?: number;
}

interface UserBase {
    dekPassword: Encryption;
    dekSeed: Encryption;
}

export interface UserEncrypted extends UserBase {
    keys: EncryptionBase[];
}

export interface RecoveryEncrypted {
    dekSeed: Encryption;
}

export interface UserCreatePayload extends UserEncrypted {
    recoveryVerifierSalt: string;
    recoveryVerifierHash: string;
}

export interface UserDecrypted extends UserBase {
    keys: KeyPair[];
}

export interface EncryptionBase {
    encryptedData: string;
    iv: string;
    tag: string;
}

export interface Encryption extends EncryptionBase {
    salt: string;
}

export interface PrivateKeyAndPassphrase {
    privateKey: string;
    passphrase: string;
}

export interface KeyMetadata {
    fingerprint: string;
    algorithm: string;
    bitStrength?: number;
    curve?: string;
    expiry: string;
    userId: string;
    privateKeyIsUnlocked?: boolean;
}

export interface DecryptionResult {
    decrypted: string;
    verified?: boolean;
}

export interface LastSignedInUser {
    uid: string;
    username: string | null;
}

export interface SessionResponse {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: string; // ISO string
    refreshTokenExpiresAt: string; // ISO string
    mfaTrusted: boolean;
    mfaEnabled: boolean;
    newRecoveryCodes?: string[];
}

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

export interface RecoveryChallengeResponse {
    recoveryVerifierSalt: string;
}

export interface RecoveryTokenResponse {
    userId: string;
    userEncrypted: RecoveryEncrypted;
    tempToken: string;
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

export interface StoredSession {
    refreshToken: string;
    refreshTokenExpiresAt: Date;
    mfaTrusted: boolean;
    mfaEnabled: boolean;
}
