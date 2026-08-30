import { EventService } from '../../services/eventService';
import { hasRecentSessionSwap } from './sessionSwap';
import { AuthErrorResponse } from '../../types/types';
import { AuthFlowError } from '../auth/authFlowError';
import { isRecord } from '../../shared/errors/errorGuards';
import {
    isRateLimitError as sharedIsRateLimitError,
    hasRefreshTokenFailure,
} from '../../shared/errors/errorGuards';

/**
 * Extracts the nested `sessionError` when present, falling back to the error
 * itself — mirroring the historic `error?.sessionError ?? error` access.
 */
const getSessionError = (error: unknown): AuthErrorResponse | undefined => {
    const rec = isRecord(error) ? error : null;
    if (!rec) {
        return undefined;
    }
    return (rec.sessionError ?? rec) as AuthErrorResponse | undefined;
};

export const isRateLimitError = sharedIsRateLimitError;

export const isTerminalStoredSessionError = (error: unknown): boolean => {
    return hasRefreshTokenFailure(error);
};

export const isStoredSessionMfaRequired = (error: unknown): boolean => {
    const sessionError = getSessionError(error);
    return Boolean(sessionError?.mfaRequired);
};

export const markRequiresSignOut = (error: unknown): unknown => {
    const rec = isRecord(error) ? error : null;
    if (rec) {
        rec.requiresSignOut = true;
        return rec;
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

export const throwStoredSessionAuthFailure = (error: unknown, emitSignOut: boolean): never => {
    const authError = markRequiresSignOut(error);
    if (emitSignOut && !hasRecentSessionSwap()) {
        EventService.addEvent('signOut');
    }
    throw authError;
};

export const isExpectedSessionCreationError = (error: unknown): boolean => {
    const rec = isRecord(error) ? error : null;
    const sessionError = getSessionError(error);

    return Boolean(
        isTerminalStoredSessionError(error) ||
        isRateLimitError(error) ||
        rec?.mfaRequired ||
        rec?.mfaRequiredSensitive ||
        rec?.mfaCancelled ||
        rec?.retryAfter ||
        rec?.wrongMfaCode ||
        sessionError?.mfaRequired ||
        sessionError?.mfaRequiredSensitive ||
        sessionError?.wrongMfaCode
    );
};
