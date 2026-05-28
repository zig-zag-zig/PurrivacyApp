export const isRateLimitError = (error: any): boolean => {
  return Boolean(error?.rateLimited || error?.status === 429 || error?.retryAfter);
};

export const shouldEndPartialBackendAuth = (error: any): boolean => {
  const sessionError = error?.sessionError ?? error;

  return Boolean(
    error?.requiresSignOut ||
    sessionError?.refreshTokenMissing ||
    sessionError?.refreshTokenInvalid ||
    sessionError?.refreshTokenExpired ||
    sessionError?.refreshTokenReuse
  );
};

export const isMfaRequiredAuthError = (error: any): boolean => {
  const sessionError = error?.sessionError ?? error;
  return Boolean(
    error?.mfaRequired ||
    error?.mfaRequiredSensitive ||
    sessionError?.mfaRequired ||
    sessionError?.mfaRequiredSensitive
  );
};

export const isRefreshTokenMissingAuthError = (error: any): boolean => {
  const sessionError = error?.sessionError ?? error?.errorData ?? error;
  return Boolean(sessionError?.refreshTokenMissing);
};
