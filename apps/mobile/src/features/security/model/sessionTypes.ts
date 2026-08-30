export interface SessionResponse {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: string;
    refreshTokenExpiresAt: string;
    mfaTrusted: boolean;
    mfaEnabled: boolean;
    newRecoveryCodes?: string[];
}

export interface StoredSession {
    refreshToken: string;
    refreshTokenExpiresAt: Date;
    mfaTrusted: boolean;
    mfaEnabled: boolean;
}
