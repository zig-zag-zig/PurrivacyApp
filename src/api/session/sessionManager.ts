import { getUserId } from '../../features/auth/domain/authUtils';
import { securityService } from '../../features/security/services/securityService';
import { EventService } from '../../services/eventService';
import type { MfaState, SessionResponse } from '../../types/types';
import { logger } from '../../utils/logger';
import type { ApiRequestFn } from '../core/apiRequestFactory';
import { buildApiUrl } from '../core/buildApiUrl';
import { RequestOptions, processResponse } from '../requestHelpers';
import { AccessTokenStore } from './accessTokenStore';
import {
    isExpectedSessionCreationError,
    isRateLimitError,
    isStoredSessionMfaRequired,
    isTerminalStoredSessionError,
    markRequiresSignOut,
    missingStoredSessionError,
    throwStoredSessionAuthFailure,
} from './sessionErrors';

export class SessionManager {
    private refreshSessionPromise: Promise<SessionResponse> | null = null;
    private forceFreshSessionAfterRemoteMfaState = false;
    private readonly accessTokens = new AccessTokenStore();

    constructor(private readonly request: ApiRequestFn) { }

    clearInMemoryAccessToken(): void {
        this.accessTokens.clear();
    }

    async syncRemoteMfaState(mfaState: MfaState): Promise<void> {
        const userId = getUserId();
        const storedSession = await securityService.getStoredSession(userId);
        const nextMfaTrusted = mfaState.mfaEnabled && mfaState.mfaTrusted;

        if (
            storedSession &&
            storedSession.mfaEnabled === mfaState.mfaEnabled &&
            storedSession.mfaTrusted === nextMfaTrusted
        ) {
            return;
        }

        this.accessTokens.clear();
        this.forceFreshSessionAfterRemoteMfaState = true;
        await securityService.updateStoredSessionMfaState(
            userId,
            mfaState.mfaEnabled,
            mfaState.mfaTrusted,
        );
    }

    async storeSessionResponse(response: SessionResponse, userId: string): Promise<void> {
        this.accessTokens.store(response);
        await securityService.storeSession(response, userId);
    }

    async createSession(
        retryOnFailure: boolean,
        mfaCode?: string,
        forceNewSession = false,
    ): Promise<SessionResponse> {
        const forceFreshSession = forceNewSession || this.forceFreshSessionAfterRemoteMfaState;
        if (forceFreshSession) {
            this.accessTokens.clear();
        } else if (mfaCode === undefined) {
            try {
                const stored = await this.tryGetLocalSession();
                if (stored) {
                    return stored;
                }

                throw missingStoredSessionError();
            } catch (error) {
                if (isStoredSessionMfaRequired(error)) {
                    this.accessTokens.clear();
                    if (!retryOnFailure) {
                        throw error;
                    }
                } else if (isTerminalStoredSessionError(error)) {
                    throwStoredSessionAuthFailure(error, retryOnFailure);
                }

                if (isRateLimitError(error)) {
                    throw error;
                }
                if (!isStoredSessionMfaRequired(error)) {
                    logger.warn('failed to check local session', { error });
                }
            }
        }

        const options: RequestOptions = {
            mfaCode,
            useSessionAuth: false,
            includeDeviceId: true,
        };

        const body: any = {};
        if (mfaCode !== undefined) {
            body.mfaCode = mfaCode;
        }

        try {
            const response = await this.request('/auth/session', 'POST', body, true, options, retryOnFailure);
            if (response.accessToken) {
                const userId = getUserId();
                await this.storeSessionResponse(response as SessionResponse, userId);
                this.forceFreshSessionAfterRemoteMfaState = false;
            }
            return response as SessionResponse;
        } catch (error: any) {
            if (isTerminalStoredSessionError(error)) {
                try {
                    await this.clearBackendSession(getUserId());
                } catch { }
            }

            if (!isExpectedSessionCreationError(error)) {
                logger.error('failed to get session from api', { error });
            }
            throw error;
        }
    }

    async revokeAllSessions(): Promise<void> {
        await this.request('/auth/revoke-all-sessions', 'POST', undefined, true);
    }

    async signOut(): Promise<void> {
        let accessToken = this.accessTokens.getUsableToken();

        if (!accessToken) {
            try {
                const session = await securityService.getStoredSession(getUserId());
                if (session && (!session.mfaEnabled || session.mfaTrusted)) {
                    const refreshed = await this.refreshSession();
                    accessToken = refreshed.accessToken;
                }
            } catch { }
        }

        this.accessTokens.clear();

        if (!accessToken) {
            return;
        }

        try {
            const response = await fetch(buildApiUrl('/auth/sign-out'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: '{}',
            });

            if (!response.ok && response.status !== 401 && response.status !== 403) {
                logger.warn('server sign-out failed', { status: response.status });
            }
        } catch (error) {
            logger.warn('server sign-out request failed', { error });
        }
    }

    private async clearBackendSession(userId: string): Promise<void> {
        this.accessTokens.clear();
        await securityService.clearStoredSession(userId);
    }

    private async tryGetLocalSession(): Promise<SessionResponse | null> {
        try {
            const userId = getUserId();
            const session = await securityService.getStoredSession(userId);

            if (!session) {
                return null;
            }

            const localSession = this.accessTokens.responseFromStoredSession(session);
            if (localSession) {
                EventService.addEvent('mfaState', {
                    mfaState: {
                        mfaTrusted: session.mfaTrusted,
                        mfaEnabled: session.mfaEnabled,
                    },
                });
                return localSession;
            }

            try {
                return await this.refreshSession();
            } catch (refreshError: any) {
                if (isStoredSessionMfaRequired(refreshError)) {
                    this.accessTokens.clear();
                    throw refreshError;
                }

                if (isTerminalStoredSessionError(refreshError)) {
                    await this.clearBackendSession(userId);
                    throw markRequiresSignOut(refreshError);
                }

                if (isRateLimitError(refreshError)) {
                    throw refreshError;
                }

                logger.warn('failed to auto-refresh session', { error: refreshError });
                this.accessTokens.clear();
                throw refreshError;
            }
        } catch (error) {
            if (
                isStoredSessionMfaRequired(error) ||
                isTerminalStoredSessionError(error) ||
                isRateLimitError(error)
            ) {
                throw error;
            }
            logger.warn('failed to check stored session', { error });
            throw error;
        }
    }

    private async refreshSession(): Promise<SessionResponse> {
        if (this.refreshSessionPromise) {
            return await this.refreshSessionPromise;
        }

        this.refreshSessionPromise = this.refreshSessionOnce();

        try {
            return await this.refreshSessionPromise;
        } finally {
            this.refreshSessionPromise = null;
        }
    }

    private async refreshSessionOnce(): Promise<SessionResponse> {
        const userId = getUserId();
        const session = await securityService.getStoredSession(userId);
        if (!session) {
            throw new Error('No session to refresh');
        }

        const endpoint = '/auth/session/refresh';
        const method = 'POST';
        const body = { refreshToken: session.refreshToken };
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        const accessToken = this.accessTokens.getToken();
        if (accessToken) {
            headers.Authorization = `Bearer ${accessToken}`;
        }

        const httpResponse = await fetch(buildApiUrl(endpoint), {
            method,
            headers,
            body: JSON.stringify(body),
        });

        const response = await processResponse(
            httpResponse,
            endpoint,
            method,
            body,
            false,
            true,
            undefined,
            this.request,
            (retryOnFailure: boolean, mfaCode?: string) => (
                this.createSession(retryOnFailure, mfaCode)
            ),
        );

        if (response.accessToken) {
            await this.storeSessionResponse(response as SessionResponse, userId);
        }

        return response as SessionResponse;
    }
}
