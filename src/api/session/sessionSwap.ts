/**
 * Tracks the most recent client-side session swap.
 *
 * MFA state transitions (enable/disable) replace the session: the backend
 * revokes the OLD session family while the new session arrives in the
 * transition response. Any request that raced the swap then refreshes with a
 * revoked token (refreshTokenReuse) and would otherwise trigger a sign-out
 * event even though a fresh session is already stored. The sign-out emitters
 * consult this module and stay quiet shortly after a swap.
 */
let lastSessionSwapAt = 0;

export const recordSessionSwap = (): void => {
    lastSessionSwapAt = Date.now();
};

export const hasRecentSessionSwap = (withinMs = 20_000): boolean => {
    return Date.now() - lastSessionSwapAt <= withinMs;
};
