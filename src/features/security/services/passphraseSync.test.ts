import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockBackendSync = {
    setPassphraseStorage: vi.fn(async () => { }),
};

vi.mock('../../../utils/logger', () => ({
    logger: { warn: vi.fn(), info: vi.fn() },
}));

vi.mock('../domain/secureStorageUtils', () => ({
    PASSPHRASE_STORAGE_ENABLED_PREFIX: 'enabled_',
    PASSPHRASE_STORAGE_PROMPTED_PREFIX: 'prompted_',
}));

vi.mock('./biometricSecureStorage', () => ({
    getNonSensitiveValue: vi.fn(async () => null),
    setNonSensitiveValue: vi.fn(async () => { }),
}));

import { setPassphraseStorageEnabled, setPassphraseBackendSync } from './passphraseStore';

describe('passphrase storage flag sync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setPassphraseBackendSync(mockBackendSync);
    });

    describe('setPassphraseStorageEnabled', () => {
        it('calls backendSync.setPassphraseStorage when enabled', async () => {
            await setPassphraseStorageEnabled('user-1', true);
            expect(mockBackendSync.setPassphraseStorage).toHaveBeenCalledWith(true);
        });

        it('calls backendSync.setPassphraseStorage when disabled', async () => {
            await setPassphraseStorageEnabled('user-1', false);
            expect(mockBackendSync.setPassphraseStorage).toHaveBeenCalledWith(false);
        });

        it('skips remote sync when skipRemoteSync is true', async () => {
            await setPassphraseStorageEnabled('user-1', true, { skipRemoteSync: true });
            expect(mockBackendSync.setPassphraseStorage).not.toHaveBeenCalled();
        });

        it('does not throw if API call fails', async () => {
            mockBackendSync.setPassphraseStorage.mockRejectedValueOnce(new Error('network'));
            await expect(setPassphraseStorageEnabled('user-1', true)).resolves.not.toThrow();
        });
    });
});
