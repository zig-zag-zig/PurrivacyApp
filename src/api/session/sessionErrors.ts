import { EventService } from '../../services/eventService';
import { AuthErrorResponse } from '../../types/types';
import { AuthFlowError } from '../auth/authFlowError';
import {
    isRateLimitError as sharedIsRateLimitError,
    hasRefreshTokenFailure,
} from '../../shared/errors/errorGuards';

const getSessionError = (error: any): AuthErrorResponse | undefined => {
    return error?.sessionError ?? error;
};

export const isRateLimitError = sharedIsRateLimitError;

export const isTerminalStoredSessionError = (error: any): boolean => {
    return hasRefreshTokenFailure(error);
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
