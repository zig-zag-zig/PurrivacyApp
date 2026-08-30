export interface CreateSessionOptions {
    userHasMfa?: boolean;
    mfaTrusted?: boolean;
    label?: string;
    platform?: string;
    deviceId?: string;
    /**
     * Defaults to true for ordinary logins: stale refresh-token families for
     * the same device are swept while the new session is created. MFA state
     * transitions pass false because their createSession step runs BEFORE the
     * code is verified — sweeping the CURRENT family there would leave the
     * user sessionless after a wrong code (the old family must survive until
     * the transition's revokeOldSessions step, or until a failed attempt
     * rethrows).
     */
    sweepStaleFamilies?: boolean;
}

export interface GeneratedRefreshToken {
    tokenId: string;
    rawToken: string;
    tokenHash: string;
}

