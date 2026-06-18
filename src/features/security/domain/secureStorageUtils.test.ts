import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSecureStorageModule = vi.hoisted(() => ({
    deleteValue: vi.fn(),
    deleteSensitiveValue: vi.fn(),
    deleteBiometricKey: vi.fn(),
    setValue: vi.fn(),
    getValue: vi.fn(),
    removeItemAsync: vi.fn(),
}));

const mockLogger = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('../services/biometricSecureStorage', () => ({
    SecureStorageModule: mockSecureStorageModule,
}));

vi.mock('../../../utils/logger', () => ({
    logger: mockLogger,
}));

import {
    handleSecureStorageResponse,
    deleteSecureStoreItem,
    clearBiometricsConfig,
    setHasBeenPromptedForBiometric,
} from '../domain/secureStorageUtils';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('handleSecureStorageResponse', () => {
    it('calls successHandler with value on success', async () => {
        const successHandler = vi.fn(async (value: string) => `processed:${value}`);
        const result = await handleSecureStorageResponse(
            { success: true, value: 'my-value' },
            'test-op',
            successHandler,
        );

        expect(successHandler).toHaveBeenCalledWith('my-value');
        expect(result).toBe('processed:my-value');
    });

    it('calls errorHandler with code and message on failure', async () => {
        const errorHandler = vi.fn(async (code: string, message: string) => `${code}:${message}`);
        const result = await handleSecureStorageResponse(
            { success: false, code: 'NOT_FOUND', message: 'Key missing' },
            'test-op',
            undefined,
            errorHandler,
        );

        expect(errorHandler).toHaveBeenCalledWith('NOT_FOUND', 'Key missing');
        expect(result).toBe('NOT_FOUND:Key missing');
    });

    it('returns null when success is false and no errorHandler', async () => {
        const result = await handleSecureStorageResponse(
            { success: false, code: 'ERROR' },
            'test-op',
        );

        expect(result).toBeNull();
    });

    it('returns null for response without value and no handlers', async () => {
        const result = await handleSecureStorageResponse({}, 'test-op');

        expect(result).toBeNull();
    });

    it('logs a warning on failure with a code when errorHandler is provided', async () => {
        const errorHandler = vi.fn(async (code: string, message: string) => `${code}:${message}`);
        await handleSecureStorageResponse(
            { success: false, code: 'STORAGE_ERROR', message: 'Storage failed' },
            'store-op',
            undefined,
            errorHandler,
        );

        expect(mockLogger.warn).toHaveBeenCalledWith(
            'secure storage operation failed',
            { operation: 'store-op', code: 'STORAGE_ERROR' },
        );
    });

    it('returns null when value is undefined on success', async () => {
        const successHandler = vi.fn(async () => 'should-not-be-called');
        const result = await handleSecureStorageResponse(
            { success: true },
            'test-op',
            successHandler,
        );

        expect(successHandler).not.toHaveBeenCalled();
        expect(result).toBeNull();
    });
});

describe('deleteSecureStoreItem', () => {
    it('throws when key is empty', async () => {
        await expect(deleteSecureStoreItem('non-sensitive', '   '))
            .rejects.toThrow('key is required when deleting values from secure storage');
    });

    it('deletes non-sensitive values via deleteValue', async () => {
        await deleteSecureStoreItem('non-sensitive', 'my-key');

        expect(mockSecureStorageModule.deleteValue).toHaveBeenCalledWith('my-key');
    });

    it('deletes sensitive values via deleteSensitiveValue', async () => {
        mockSecureStorageModule.deleteSensitiveValue.mockResolvedValueOnce({ success: true });

        await deleteSecureStoreItem('sensitive', 'my-key');

        expect(mockSecureStorageModule.deleteSensitiveValue).toHaveBeenCalledWith('my-key');
    });

    it('deletes PGP biometric keys via deleteBiometricKey', async () => {
        await deleteSecureStoreItem('pgp', 'my-key');

        expect(mockSecureStorageModule.deleteBiometricKey).toHaveBeenCalledWith('my-key');
    });

    it('re-throws deletion errors', async () => {
        mockSecureStorageModule.deleteValue.mockRejectedValueOnce(new Error('native error'));

        await expect(deleteSecureStoreItem('non-sensitive', 'my-key'))
            .rejects.toThrow('native error');
    });
});

describe('clearBiometricsConfig', () => {
    it('clears all biometric keys for a user', async () => {
        await clearBiometricsConfig('alice');

        expect(mockSecureStorageModule.deleteSensitiveValue).toHaveBeenCalledWith(
            expect.stringContaining('public_key_alice'),
        );
        expect(mockSecureStorageModule.deleteBiometricKey).toHaveBeenCalledWith(
            expect.stringContaining('biometric_keypair_alice'),
        );
        expect(mockSecureStorageModule.deleteValue).toHaveBeenCalledWith(
            expect.stringContaining('first_time_biometric_prompt_alice'),
        );
        expect(mockSecureStorageModule.deleteValue).toHaveBeenCalledWith(
            expect.stringContaining('last_used_auth_was_biometric_alice'),
        );
    });

    it('skips clearing when username is empty', async () => {
        await clearBiometricsConfig('   ');

        expect(mockSecureStorageModule.deleteSensitiveValue).not.toHaveBeenCalled();
        expect(mockSecureStorageModule.deleteBiometricKey).not.toHaveBeenCalled();
        expect(mockSecureStorageModule.deleteValue).not.toHaveBeenCalled();
    });

    it('can skip clearing the first-time prompt marker', async () => {
        await clearBiometricsConfig('alice', false);

        const deleteKeys = mockSecureStorageModule.deleteValue.mock.calls.map((c: any[]) => c[0]);
        const firstTimeKeys = deleteKeys.filter((k: string) => k.includes('first_time_biometric_prompt'));
        expect(firstTimeKeys).toHaveLength(0);
    });
});

describe('setHasBeenPromptedForBiometric', () => {
    it('stores the prompted flag as a string boolean', async () => {
        await setHasBeenPromptedForBiometric('alice', true);

        expect(mockSecureStorageModule.setValue).toHaveBeenCalledWith(
            expect.stringContaining('first_time_biometric_prompt_alice'),
            'true',
        );
    });

    it('skips when username is empty', async () => {
        await setHasBeenPromptedForBiometric('   ', true);

        expect(mockSecureStorageModule.setValue).not.toHaveBeenCalled();
    });

    it('stores false value correctly', async () => {
        await setHasBeenPromptedForBiometric('alice', false);

        expect(mockSecureStorageModule.setValue).toHaveBeenCalledWith(
            expect.stringContaining('first_time_biometric_prompt_alice'),
            'false',
        );
    });
});
