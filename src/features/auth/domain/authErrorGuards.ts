/**
 * Auth-specific error guards.
 *
 * Uses shared error guards from src/shared/errors/errorGuards.ts
 * for the common rate-limit and refresh-token-failure checks.
 */

import {
  isRateLimitError as _isRateLimitError,
  hasRefreshTokenFailure,
  isMfaRequired as _isMfaRequired,
} from '../../../shared/errors/errorGuards';

export const isRateLimitError = _isRateLimitError;

export const shouldEndPartialBackendAuth = (error: any): boolean => {
  return hasRefreshTokenFailure(error);
};

export const isMfaRequiredAuthError = _isMfaRequired;

export const isRefreshTokenMissingAuthError = (error: any): boolean => {
  const sessionError = error?.sessionError ?? error?.errorData ?? error;
  return Boolean(sessionError?.refreshTokenMissing);
};
