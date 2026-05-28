import type { SessionResponse, StoredSession } from '../../types/types';

const ACCESS_TOKEN_REFRESH_BUFFER_MS = 30 * 1000;

export class AccessTokenStore {
    private accessToken: string | null = null;
    private accessTokenExpiresAt: Date | null = null;

    store(response: SessionResponse): void {
        this.accessToken = response.accessToken;
        this.accessTokenExpiresAt = new Date(response.accessTokenExpiresAt);
    }

    clear(): void {
        this.accessToken = null;
        this.accessTokenExpiresAt = null;
    }

    getToken(): string | null {
        return this.accessToken;
    }

    getUsableToken(): string | null {
        return this.hasUsableToken() ? this.accessToken : null;
    }

    responseFromStoredSession(stored: StoredSession): SessionResponse | null {
        if (!this.hasUsableToken() || !this.accessTokenExpiresAt) {
            return null;
        }

        return {
            accessToken: this.accessToken!,
            refreshToken: stored.refreshToken,
            accessTokenExpiresAt: this.accessTokenExpiresAt.toISOString(),
            refreshTokenExpiresAt: stored.refreshTokenExpiresAt.toISOString(),
            mfaTrusted: stored.mfaTrusted,
            mfaEnabled: stored.mfaEnabled,
        };
    }

    private hasUsableToken(): boolean {
        if (!this.accessToken || !this.accessTokenExpiresAt) {
            return false;
        }

        return this.accessTokenExpiresAt.getTime() - Date.now() > ACCESS_TOKEN_REFRESH_BUFFER_MS;
    }
}
