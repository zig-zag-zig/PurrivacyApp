import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

interface ManifestLike {
    manifest: {
        'uses-permission'?: Array<{ $: Record<string, string> }>;
        application?: Array<{
            $?: Record<string, string>;
            service?: Array<{ $: Record<string, string> }>;
        }>;
    };
}

const keepAlive = require('../scripts/android-operation-keepalive.js') as {
    ensureManifestKeepAliveService: (manifest: ManifestLike) => ManifestLike;
};

const SERVICE_NAME = '.operations.OperationKeepAliveService';
const DATA_SYNC_PERMISSION = 'android.permission.FOREGROUND_SERVICE_DATA_SYNC';

const makeManifest = (): ManifestLike => ({
    manifest: {
        'uses-permission': [{ $: { 'android:name': 'android.permission.INTERNET' } }],
        application: [{ $: { 'android:name': '.MainApplication' }, service: [] }],
    },
});

describe('scripts/android-operation-keepalive.js manifest wiring', () => {
    it('adds the dataSync permission and non-exported foreground service', () => {
        const result = keepAlive.ensureManifestKeepAliveService(makeManifest());
        const application = result.manifest.application?.[0];

        expect(
            result.manifest['uses-permission']?.some(
                entry => entry.$['android:name'] === DATA_SYNC_PERMISSION,
            ),
        ).toBe(true);

        const service = application?.service?.find(entry => entry.$['android:name'] === SERVICE_NAME);
        expect(service).toEqual({
            $: {
                'android:name': SERVICE_NAME,
                'android:exported': 'false',
                'android:foregroundServiceType': 'dataSync',
            },
        });
    });

    it('is idempotent and repairs an existing declaration', () => {
        const once = keepAlive.ensureManifestKeepAliveService(makeManifest());
        const twice = keepAlive.ensureManifestKeepAliveService(once);

        const permissions = twice.manifest['uses-permission'] ?? [];
        const services = twice.manifest.application?.[0]?.service ?? [];

        expect(permissions.filter(p => p.$['android:name'] === DATA_SYNC_PERMISSION)).toHaveLength(1);
        expect(services.filter(s => s.$['android:name'] === SERVICE_NAME)).toHaveLength(1);
    });

    it('restores required attributes on an existing service entry', () => {
        const manifest = makeManifest();
        manifest.manifest.application?.[0]?.service?.push({
            $: { 'android:name': SERVICE_NAME, 'android:exported': 'true' },
        });

        const service = keepAlive
            .ensureManifestKeepAliveService(manifest)
            .manifest.application?.[0]?.service?.find(entry => entry.$['android:name'] === SERVICE_NAME);

        expect(service?.$['android:exported']).toBe('false');
        expect(service?.$['android:foregroundServiceType']).toBe('dataSync');
    });
});