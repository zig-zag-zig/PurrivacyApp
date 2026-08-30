type MfaClosePayload = {
    delayMs?: unknown;
    force?: unknown;
};

export const shouldCloseMfaModal = (
    isLoginFlow: boolean,
    payload?: MfaClosePayload,
): boolean => {
    if (!isLoginFlow || payload?.force === true) {
        return true;
    }

    const delayMs = Number(payload?.delayMs ?? 0);
    return Number.isFinite(delayMs) && delayMs > 0;
};
