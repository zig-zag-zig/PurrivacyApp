import { EventService } from '../../services/eventService';
import { AuthErrorResponse } from '../../types/types';
import { AuthFlowError } from '../auth/authFlowError';

const getSessionError = (error: any): AuthErrorResponse | undefined => {
    return error?.sessionError ?? error;
};

export const isRateLimitError = (error: any): boolean => {
    return Boolean(
        error?.rateLimited ||
        error?.status === 429 ||
        error?.retryAfter ||
        error?.sessionError?.rateLimited ||
        error?.sessionError?.status === 429
    );
};

export const isTerminalStoredSessionError = (error: any): boolean => {
    const sessionError = error?.sessionError;

    return Boolean(
        error?.requiresSignOut ||
        error?.refreshTokenMissing ||
        error?.refreshTokenInvalid ||
        error?.refreshTokenExpired ||
        error?.refreshTokenReuse ||
        sessionError?.refreshTokenMissing ||
        sessionError?.refreshTokenInvalid ||
        sessionError?.refreshTokenExpired ||
        sessionError?.refreshTokenReuse
    );
};

export const isStoredSessionMfaRequired = (error: any): boolean => {
    const sessionError = error?.sessionError ?? error;
    return Boolean(sessionError?.mfaRequired);
};

export const markRequiresSignOut = (error: any): any => {
    if (error && typeof error === 'object') {
        error.requiresSignOut = true;
        return error;
    }

    return { error, requiresSignOut: true };
};

export const missingStoredSessionError = (): AuthFlowError => {
    return new AuthFlowError('Stored session is missing a refresh token', {
        status: 401,
        requiresSignOut: true,
        sessionError: { refreshTokenMissing: true },
    });
};

export const throwStoredSessionAuthFailure = (error: any, emitSignOut: boolean): never => {
    const authError = markRequiresSignOut(error);
    if (emitSignOut) {
        EventService.addEvent('signOut');
    }
    throw authError;
};

export const isExpectedSessionCreationError = (error: any): boolean => {
    const sessionError = getSessionError(error);

    return Boolean(
        isTerminalStoredSessionError(error) ||
        isRateLimitError(error) ||
        error?.mfaRequired ||
        error?.mfaRequiredSensitive ||
        error?.mfaCancelled ||
        error?.retryAfter ||
        error?.wrongMfaCode ||
        sessionError?.mfaRequired ||
        sessionError?.mfaRequiredSensitive ||
        sessionError?.wrongMfaCode
    );
};
