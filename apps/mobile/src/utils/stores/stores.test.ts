import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyPair } from '../../types/types';
import { activityMetadataStore } from './activityMetadataStore';
import { pushTokenCache } from './pushTokenCache';
import { popularityStore } from './popularityStore';
import { devFixtureStore } from './devFixtureStore';

vi.mock('expo-file-system', () => import('./fileSystem.mock'));

// ---------------------------------------------------------------------------
// Type-level guards (compile-time only; the arrow bodies never execute).
// tsc --noEmit fails if any of these lines stops being a type error, so a
// future change that lets a secret-classified shape into a guarded store's
// value type breaks the build.
// ---------------------------------------------------------------------------

// @ts-expect-error passphrase must not be part of the activity metadata value type
export const _typeGuardActivityWrite = () => activityMetadataStore.write({ passphrase: 'x' });
// @ts-expect-error passphrase must not be part of the push token value type
export const _typeGuardPushTokenWrite = () => pushTokenCache.write({ passphrase: 'x' });
// @ts-expect-error privateKey must not be part of the popularity index value type
export const _typeGuardPopularityWrite = () => popularityStore.write({ user1: { privateKey: 'x' } });
// devFixtureStore deliberately admits KeyPair values (which hold private keys
// in dev); this is the documented exception and must keep compiling:
export const _typeGuardDevFixtureWrite = () => devFixtureStore.write({ version: 3, generatedCount: 0, keys: [] });

type Fresh = {
    fs: typeof import('./fileSystem.mock');
    activity: typeof import('./activityMetadataStore');
    push: typeof import('./pushTokenCache');
    popularity: typeof import('./popularityStore');
    dev: typeof import('./devFixtureStore');
};

/**
 * Reset module singletons and the in-memory filesystem, then re-import fresh
 * store instances so every test starts from a clean slate (no cached memory,
 * no files on disk).
 *
 * NOTE: `vi.resetModules()` does not re-run `vi.mock` factories, so the mock
 * instance backing `expo-file-system` is stable for the whole test file. We
 * reach its state helpers through the mocked module itself rather than a
 * direct import, which would resolve to a second (unused) module instance.
 */
async function fresh(): Promise<Fresh> {
    vi.resetModules();
    const fs = await import('expo-file-system') as unknown as typeof import('./fileSystem.mock');
    fs.resetFileSystem();
    const [activity, push, popularity, dev] = await Promise.all([
        import('./activityMetadataStore'),
        import('./pushTokenCache'),
        import('./popularityStore'),
        import('./devFixtureStore'),
    ]);
    return { fs, activity, push, popularity, dev };
}

function makeKey(fingerprint: string): KeyPair {
    return {
        fingerprint,
        algorithm: 'EDDSA',
        bitStrength: 3072,
        curve: 'Ed25519',
        expiry: '2026-01-01',
        userId: 'temp01@purrivacy.local',
        privateKeyIsUnlocked: false,
        privateKey: `-----BEGIN PGP PRIVATE KEY BLOCK-----${fingerprint}`,
        publicKey: `-----BEGIN PGP PUBLIC KEY BLOCK-----${fingerprint}`,
        isDefault: false,
    };
}

beforeEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
});

describe('named stores', () => {
    it('return their typed default value when the file is missing', async () => {
        const { activity, push, popularity, dev } = await fresh();

        await expect(activity.activityMetadataStore.read()).resolves.toEqual({});
        await expect(push.pushTokenCache.read()).resolves.toBeNull();
        await expect(popularity.popularityStore.read()).resolves.toEqual({});
        await expect(dev.devFixtureStore.read()).resolves.toEqual({
            version: 0,
            generatedCount: 0,
            keys: [],
        });
    });

    it('round-trip typed values through write/read and persist to disk', async () => {
        const { fs, activity, push, popularity, dev } = await fresh();

        await activity.activityMetadataStore.write({ user1: 1_700_000_000_000 });
        await expect(activity.activityMetadataStore.read()).resolves.toEqual({ user1: 1_700_000_000_000 });
        expect(fs.readFile('activity-metadata.json')).toBe(JSON.stringify({ user1: 1_700_000_000_000 }));

        await push.pushTokenCache.write('ExponentPushToken[abc]');
        await expect(push.pushTokenCache.read()).resolves.toBe('ExponentPushToken[abc]');
        expect(fs.readFile('push-token-cache.json')).toBe(JSON.stringify('ExponentPushToken[abc]'));

        await popularity.popularityStore.write({ user1: { fp1: 3 } });
        await expect(popularity.popularityStore.read()).resolves.toEqual({ user1: { fp1: 3 } });
        expect(fs.readFile('popularity.json')).toBe(JSON.stringify({ user1: { fp1: 3 } }));

        const payload = { version: 3, generatedCount: 2, keys: [makeKey('fp1')] };
        await dev.devFixtureStore.write(payload);
        await expect(dev.devFixtureStore.read()).resolves.toEqual(payload);
        expect(fs.readFile('dev-fixtures.json')).toBe(JSON.stringify(payload));
    });

    it('read the persisted value from disk on a fresh instance', async () => {
        const { activity } = await fresh();
        await activity.activityMetadataStore.write({ user1: 42 });

        vi.resetModules();
        const activity2 = await import('./activityMetadataStore');
        await expect(activity2.activityMetadataStore.read()).resolves.toEqual({ user1: 42 });
    });

    it('update merges, persists, and returns the new value', async () => {
        const { fs, activity, popularity } = await fresh();

        await activity.activityMetadataStore.write({ user1: 100 });
        const updated = await activity.activityMetadataStore.update(metadata => ({
            ...metadata,
            user2: 200,
        }));
        expect(updated).toEqual({ user1: 100, user2: 200 });
        await expect(activity.activityMetadataStore.read()).resolves.toEqual({ user1: 100, user2: 200 });
        expect(fs.readFile('activity-metadata.json')).toBe(JSON.stringify({ user1: 100, user2: 200 }));

        await popularity.popularityStore.update(index => ({
            ...index,
            user1: { ...index.user1, fp1: (index.user1?.fp1 ?? 0) + 1 },
        }));
        await expect(popularity.popularityStore.read()).resolves.toEqual({ user1: { fp1: 1 } });
    });

    it('clear resets the value and removes the store file', async () => {
        const { fs, activity, push, popularity, dev } = await fresh();

        await activity.activityMetadataStore.write({ user1: 100 });
        await activity.activityMetadataStore.clear();
        await expect(activity.activityMetadataStore.read()).resolves.toEqual({});
        expect(fs.hasFile('activity-metadata.json')).toBe(false);

        await push.pushTokenCache.write('tok');
        await push.pushTokenCache.clear();
        await expect(push.pushTokenCache.read()).resolves.toBeNull();
        expect(fs.hasFile('push-token-cache.json')).toBe(false);

        await popularity.popularityStore.write({ user1: { fp1: 1 } });
        await popularity.popularityStore.clear();
        await expect(popularity.popularityStore.read()).resolves.toEqual({});
        expect(fs.hasFile('popularity.json')).toBe(false);

        await dev.devFixtureStore.write({ version: 3, generatedCount: 1, keys: [makeKey('fp1')] });
        await dev.devFixtureStore.clear();
        await expect(dev.devFixtureStore.read()).resolves.toEqual({ version: 0, generatedCount: 0, keys: [] });
        expect(fs.hasFile('dev-fixtures.json')).toBe(false);
    });

    it('recover from corrupted or invalid file content with the default value', async () => {
        const { fs, activity, push, popularity, dev } = await fresh();

        fs.seedFile('activity-metadata.json', '{not-json');
        fs.seedFile('push-token-cache.json', '{"token": 1}');
        fs.seedFile('popularity.json', '"just a string"');
        fs.seedFile('dev-fixtures.json', '{"version": "three", "generatedCount": 0, "keys": []}');

        await expect(activity.activityMetadataStore.read()).resolves.toEqual({});
        await expect(push.pushTokenCache.read()).resolves.toBeNull();
        await expect(popularity.popularityStore.read()).resolves.toEqual({});
        await expect(dev.devFixtureStore.read()).resolves.toEqual({
            version: 0,
            generatedCount: 0,
            keys: [],
        });
    });

    it('reject invalid typed shapes loaded from disk', async () => {
        const { fs, activity, popularity } = await fresh();

        fs.seedFile('activity-metadata.json', JSON.stringify({ user1: 'not-a-number' }));
        fs.seedFile('popularity.json', JSON.stringify({ user1: { fp1: 'NaN' } }));

        await expect(activity.activityMetadataStore.read()).resolves.toEqual({});
        await expect(popularity.popularityStore.read()).resolves.toEqual({});
    });
});

describe('secret-field runtime canary', () => {
    it('refuses to persist secret-classified property names and leaves state untouched', async () => {
        const { activity, popularity } = await fresh();

        await activity.activityMetadataStore.write({ user1: 1 });

        await expect(
            activity.activityMetadataStore.update(() => ({ passphrase: 1 })),
        ).rejects.toThrow(/passphrase/);
        await expect(
            popularity.popularityStore.update(() => ({ user1: { privateKey: 3 } })),
        ).rejects.toThrow(/privateKey/);

        // Neither memory nor disk was modified by the rejected writes.
        await expect(activity.activityMetadataStore.read()).resolves.toEqual({ user1: 1 });
        await expect(popularity.popularityStore.read()).resolves.toEqual({});
    });

    it('does not guard devFixtureStore, which legitimately holds dev private keys', async () => {
        const { dev } = await fresh();
        const payload = { version: 3, generatedCount: 1, keys: [makeKey('fp1')] };

        await expect(dev.devFixtureStore.write(payload)).resolves.toBeUndefined();
        await expect(dev.devFixtureStore.read()).resolves.toEqual(payload);
    });
});

describe('legacy app-cache.json migration', () => {
    it('migrates each store from its legacy flat keys (one-time, read-only)', async () => {
        const { fs, activity, push, popularity, dev } = await fresh();

        fs.seedFile('app-cache.json', JSON.stringify({
            'last_active_timeuser1': '1700000000000',
            'last_active_timeuser2': 'not-a-timestamp',
            expoPushToken: 'ExponentPushToken[legacy]',
            'popularity_user1_fp1': 3,
            'popularity_user2_fp2': 7,
            'dev-real-pgp-temp-keys': { version: 3, generatedCount: 1, keys: [makeKey('fp1')] },
            unrelatedKey: 'ignored',
        }));

        await expect(activity.activityMetadataStore.read()).resolves.toEqual({ user1: 1700000000000 });
        await expect(push.pushTokenCache.read()).resolves.toBe('ExponentPushToken[legacy]');
        await expect(popularity.popularityStore.read()).resolves.toEqual({
            user1: { fp1: 3 },
            user2: { fp2: 7 },
        });
        await expect(dev.devFixtureStore.read()).resolves.toEqual({
            version: 3,
            generatedCount: 1,
            keys: [makeKey('fp1')],
        });

        // Migrated values were persisted into the new per-store files...
        expect(fs.readFile('activity-metadata.json')).toBe(JSON.stringify({ user1: 1700000000000 }));
        expect(fs.readFile('push-token-cache.json')).toBe(JSON.stringify('ExponentPushToken[legacy]'));
        expect(fs.readFile('popularity.json')).toBe(JSON.stringify({ user1: { fp1: 3 }, user2: { fp2: 7 } }));
        expect(fs.readFile('dev-fixtures.json')).toBe(
            JSON.stringify({ version: 3, generatedCount: 1, keys: [makeKey('fp1')] }),
        );

        // ...and the legacy file itself is left untouched (read-only migration).
        expect(fs.hasFile('app-cache.json')).toBe(true);
        expect(JSON.parse(fs.readFile('app-cache.json')!)).toHaveProperty('expoPushToken');
    });
});

describe('activityMetadataStore helpers', () => {
    it('get/set/clear last active time per user', async () => {
        const { activity } = await fresh();

        await expect(activity.getLastActiveTime('user1')).resolves.toBeNull();
        await activity.setLastActiveTime('user1', 1234);
        await expect(activity.getLastActiveTime('user1')).resolves.toBe(1234);
        await expect(activity.getLastActiveTime('other')).resolves.toBeNull();

        await activity.clearLastActiveTime('user1');
        await expect(activity.getLastActiveTime('user1')).resolves.toBeNull();
    });
});

describe('pushTokenCache helpers', () => {
    it('set/get/clear the push token', async () => {
        const { push } = await fresh();

        await expect(push.getPushToken()).resolves.toBeNull();
        await push.setPushToken('ExponentPushToken[tok]');
        await expect(push.getPushToken()).resolves.toBe('ExponentPushToken[tok]');
        await push.pushTokenCache.clear();
        await expect(push.getPushToken()).resolves.toBeNull();
    });
});

describe('devFixtureStore __DEV__ gating', () => {
    it('never reads or writes outside __DEV__', async () => {
        const previous = (globalThis as { __DEV__?: boolean }).__DEV__;
        try {
            (globalThis as { __DEV__?: boolean }).__DEV__ = false;
            const { fs, dev } = await fresh();

            await dev.devFixtureStore.write({ version: 3, generatedCount: 1, keys: [makeKey('fp1')] });
            await expect(dev.devFixtureStore.read()).resolves.toEqual({
                version: 0,
                generatedCount: 0,
                keys: [],
            });
            expect(fs.hasFile('dev-fixtures.json')).toBe(false);
        } finally {
            (globalThis as { __DEV__?: boolean }).__DEV__ = previous;
        }
    });
});
