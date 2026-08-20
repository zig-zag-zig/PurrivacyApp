import { validateUsername } from '../../domain/usernameIdentity';

/**
 * Module-scoped suppression registry for automatic biometric unlock prompts
 * (APP-ARCH-002).
 *
 * Lives at module scope so suppression persists across screen unmounts and
 * remounts within the same process (e.g. navigating away from Signin and back
 * after a failed biometric attempt). The Set must never move into component
 * state: the original SigninScreen kept it module-scoped for exactly this
 * reason, and extraction preserves that semantics.
 */

export const autoBiometricUsernameKey = (value: string): string => value.trim().toLowerCase();

const autoBiometricSuppressedUsernames = new Set<string>();

/**
 * Records suppression for a username. Returns false (and records nothing)
 * when the value is not a valid username, mirroring the original guard.
 */
export const suppressAutoBiometricUsername = (value: string): boolean => {
    const key = autoBiometricUsernameKey(value);
    if (validateUsername(key)) return false;
    autoBiometricSuppressedUsernames.add(key);
    return true;
};

/** True when the username is currently suppressed (normalized key match). */
export const isAutoBiometricSuppressed = (value: string): boolean =>
    autoBiometricSuppressedUsernames.has(autoBiometricUsernameKey(value));

/** Removes suppression for a username (normalized key match). */
export const clearAutoBiometricSuppression = (value: string): void => {
    autoBiometricSuppressedUsernames.delete(autoBiometricUsernameKey(value));
};

/**
 * Background-reset semantics: clears suppression only for valid usernames.
 * Returns true when the suppression entry was cleared (valid username),
 * false for invalid values (nothing is cleared).
 */
export const resetAutoBiometricSuppression = (value: string): boolean => {
    const key = autoBiometricUsernameKey(value);
    if (validateUsername(key)) return false;
    autoBiometricSuppressedUsernames.delete(key);
    return true;
};
