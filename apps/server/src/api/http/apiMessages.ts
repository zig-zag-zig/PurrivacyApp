export const apiMessages = {
    auth: {
        invalidRecoveryCredentials: 'Invalid recovery credentials',
    },
    body: {
        invalidJson: 'Invalid JSON request body',
        tooLarge: 'Request body is too large',
    },
    rateLimit: {
        authentication: 'Too many authentication attempts. Please try again later.',
        default: 'Too many requests. Please slow down.',
        login: 'Too many login attempts. Please try again later.',
        mfaVerification: 'Too many MFA verification attempts. Please try again later.',
        sensitiveOperations: 'Too many sensitive operations. Please try again later.',
        sessionRefresh: 'Too many session refresh attempts. Please try again later.',
        updates: 'Too many updates. Please slow down.',
    },
    mfa: {
        freshAuthRequired: 'Fresh authentication is required to start MFA enrollment',
        nonceInvalid: 'Invalid or expired MFA setup nonce. Please request a new one.',
    },
    server: {
        internalError: 'Internal server error',
        requestFailed: 'Request failed',
    },
} as const;

