import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * APP-SEC-001 regression guard: the canonical AutofillCommitModule template
 * must never again accept signup secrets through restartActivity or write
 * plaintext secrets to SharedPreferences. Secrets cross the restart only as
 * an Android-Keystore-encrypted envelope.
 *
 * The template under scripts/autofill-commit-template/ is the canonical
 * source; android/ is generated (ignored) output.
 */

const TEMPLATE_PATH = resolve(__dirname, '../../../../scripts/autofill-commit-template/AutofillCommitModule.kt');

const template = readFileSync(TEMPLATE_PATH, 'utf8');

// Collapse whitespace so assertions survive Kotlin formatting changes.
const normalized = template.replace(/\s+/g, ' ');

describe('AutofillCommitModule template security invariants (APP-SEC-001)', () => {
    it('restartActivity takes no secret arguments', () => {
        const match = normalized.match(/fun restartActivity\s*\(([^)]*)\)/);
        expect(match).not.toBeNull();
        expect(match![1].trim()).toBe('');
    });

    it('encrypts the pending signup with Android Keystore AES/GCM', () => {
        expect(normalized).toContain('AndroidKeyStore');
        expect(normalized).toContain('KEY_ALGORITHM_AES');
        expect(normalized).toContain('BLOCK_MODE_GCM');
        expect(normalized).toContain('AES/GCM/NoPadding');
        expect(normalized).toContain('KeyGenParameterSpec');
    });

    it('never writes secret-named keys to SharedPreferences', () => {
        // The only values that may follow a prefs edit chain are the
        // ciphertext envelope fields - never plaintext secret names.
        expect(normalized).not.toMatch(/edit\(\)[\s\S]{0,300}?putString\(\s*"(seed|username|password)"/);
        expect(normalized).not.toContain('KEY_SEED');
        expect(normalized).not.toContain('KEY_USERNAME');
        expect(normalized).not.toContain('KEY_PASSWORD');
    });

    it('enforces one-time consume semantics and expiry before returning secrets', () => {
        expect(normalized).toContain('clearPendingPrefs()');
        expect(normalized).toContain('expiresAt');
        // Persisted state must be cleared before decryption/return.
        const clearIndex = normalized.indexOf('clearPendingPrefs()');
        const resolveIndex = normalized.indexOf('promise.resolve(map)');
        expect(clearIndex).toBeGreaterThan(-1);
        expect(resolveIndex).toBeGreaterThan(clearIndex);
    });

    it('deletes the Keystore key on consume, expiry, and failure', () => {
        const deleteCalls = normalized.match(/deletePendingSignupKey\(\)/g) ?? [];
        expect(deleteCalls.length).toBeGreaterThanOrEqual(4);
    });

    it('requires an unlocked device for the key on Android P and later', () => {
        expect(normalized).toContain('setUnlockedDeviceRequired(true)');
    });

    it('does not log secrets or flow internals at error level', () => {
        expect(normalized).not.toMatch(/Log\.e\(/);
    });
});
