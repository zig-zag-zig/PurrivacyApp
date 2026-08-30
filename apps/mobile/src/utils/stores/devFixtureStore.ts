import type { KeyPair } from '../../types/types';
import { createFileStore, TypedStore } from './fileStore';

/**
 * Dev-only cache of generated temp PGP key pairs (see tempKeyFixtures).
 *
 * __DEV__-ONLY: this store no-ops in production builds (devOnly: true), so
 * dev fixture keys can never be read or written by production code paths.
 *
 * Unlike the other named stores, this value class MAY contain private keys —
 * it exists to avoid regenerating slow PGP keys during development — so the
 * secret-field guard is intentionally disabled here (guardSecrets: false).
 * The dev-only gate is what keeps it out of production, not the guard.
 */
type DevFixturePayload = {
    version: number;
    generatedCount: number;
    keys: KeyPair[];
};

const EMPTY_PAYLOAD: DevFixturePayload = {
    version: 0,
    generatedCount: 0,
    keys: [],
};

function isDevFixturePayload(value: unknown): value is DevFixturePayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const payload = value as Partial<DevFixturePayload>;
    return typeof payload.version === 'number'
        && typeof payload.generatedCount === 'number'
        && Array.isArray(payload.keys);
}

/**
 * The legacy generic storage helper kept the payload under the flat
 * `dev-real-pgp-temp-keys` key in the shared app-cache.json.
 */
function migrateLegacy(legacy: Record<string, unknown>): DevFixturePayload | undefined {
    const payload = legacy['dev-real-pgp-temp-keys'];
    return isDevFixturePayload(payload) ? payload : undefined;
}

export const devFixtureStore: TypedStore<DevFixturePayload> = createFileStore<DevFixturePayload>({
    fileName: 'dev-fixtures.json',
    defaultValue: EMPTY_PAYLOAD,
    isValid: isDevFixturePayload,
    migrateLegacy,
    devOnly: true,
    guardSecrets: false,
});
