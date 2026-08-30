/**
 * Clipboard sensitivity classes (APP-SEC-005).
 *
 * The TTL is the maximum lifetime of a copied value on the system clipboard.
 * Higher-sensitivity values (root secrets) must live for the shortest time,
 * while non-secret material such as ciphertext or public keys may persist
 * longer so users can paste them into other apps without rushing.
 */
export type ClipboardSensitivity = 'high' | 'medium' | 'low';

export const CLIPBOARD_SENSITIVITY_TTL_MS: Record<ClipboardSensitivity, number> = {
    // Recovery seeds, private keys, recovery codes, generated passphrases, MFA secrets
    high: 20000,
    // Decrypted plaintext
    medium: 60000,
    // Public keys, ciphertext, signatures, non-secret text
    low: 180000,
};

/**
 * SAFE DEFAULT: when a call site does not declare a sensitivity class, treat
 * the copied value as a root secret rather than assuming it is harmless.
 */
export const DEFAULT_CLIPBOARD_SENSITIVITY: ClipboardSensitivity = 'high';

export const getClipboardTtlMs = (
    sensitivity: ClipboardSensitivity = DEFAULT_CLIPBOARD_SENSITIVITY,
): number => CLIPBOARD_SENSITIVITY_TTL_MS[sensitivity];
