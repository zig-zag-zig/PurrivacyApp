import { SecureStorageModule } from '../features/security/services/biometricSecureStorage';

type SecureStorageResponse = {
    success?: boolean;
    value?: string;
    code?: string;
    message?: string;
};

const getSecureStorageModule = () => {
    if (!SecureStorageModule) {
        throw new Error('SecureStorageModule is not available');
    }
    return SecureStorageModule;
};

const assertSuccess = (response: SecureStorageResponse, operation: string): void => {
    if (response?.success === false) {
        throw new Error(response.message || `${operation} failed`);
    }
};

export const secureAuthStorage = {
    async getItem(key: string): Promise<string | null> {
        const response = await getSecureStorageModule().getSensitiveValue(key);
        assertSuccess(response, 'get Firebase auth state');
        return typeof response?.value === 'string' ? response.value : null;
    },

    async setItem(key: string, value: string): Promise<void> {
        const response = await getSecureStorageModule().setSensitiveValue(key, value);
        assertSuccess(response, 'set Firebase auth state');
    },

    async removeItem(key: string): Promise<void> {
        const response = await getSecureStorageModule().deleteSensitiveValue(key);
        assertSuccess(response, 'remove Firebase auth state');
    },
};
