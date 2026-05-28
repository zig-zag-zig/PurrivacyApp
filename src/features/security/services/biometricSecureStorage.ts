import { NativeModules } from 'react-native';

type SecureStorageResponse = {
    success?: boolean;
    value?: string;
    code?: string;
    message?: string;
};

type NativeSecureStorageModule = {
    setSensitiveValue?: (key: string, value: string) => Promise<SecureStorageResponse>;
    getSensitiveValue?: (key: string) => Promise<SecureStorageResponse>;
    deleteSensitiveValue?: (key: string) => Promise<SecureStorageResponse>;
    setValue?: (key: string, value: string) => Promise<boolean>;
    getValue?: (key: string) => Promise<string | null>;
    deleteValue?: (key: string) => Promise<boolean>;
    deleteBiometricKey?: (key: string) => Promise<boolean>;
    authenticateBiometric?: (promptMessage: string) => Promise<boolean>;
    isBiometricAvailable?: () => Promise<boolean>;
    isBiometricEnabledInApp?: (keyAlias: string) => Promise<boolean>;
    isBiometricEnabledOnPhone?: () => Promise<boolean>;
    setBiometricProtectedValue?: (
        key: string,
        storageKey: string,
        value: string,
        promptMessage: string
    ) => Promise<SecureStorageResponse>;
    getBiometricProtectedValue?: (
        key: string,
        storageKey: string,
        promptMessage: string
    ) => Promise<SecureStorageResponse>;
};

const nativeSecureStorageModule = NativeModules.SecureStorageModule as NativeSecureStorageModule | null | undefined;
const missingModuleMessage = [
    'SecureStorageModule is not available.',
    'Use a native development build, then rebuild/reinstall the app so the secure-storage config plugin can register it.',
].join(' ');

const createErrorResponse = (code: string, message: string): SecureStorageResponse => ({
    success: false,
    code,
    message,
});

const invalidInputResponse = (message: string): SecureStorageResponse => (
    createErrorResponse('INVALID_INPUT', message)
);

const hasNativeMethod = <MethodName extends keyof NativeSecureStorageModule>(methodName: MethodName): boolean => (
    typeof nativeSecureStorageModule?.[methodName] === 'function'
);

export const isSecureStorageModuleAvailable = (): boolean => Boolean(nativeSecureStorageModule);

const getNativeSecureStorageModule = (): NativeSecureStorageModule => {
    if (!nativeSecureStorageModule) {
        throw new Error(missingModuleMessage);
    }

    return nativeSecureStorageModule;
};

const getMissingMethodMessage = (methodName: keyof NativeSecureStorageModule): string => (
    `SecureStorageModule.${String(methodName)} is not available. Rebuild/reinstall the native app.`
);

const getRequiredNativeMethod = <MethodName extends keyof NativeSecureStorageModule>(
    methodName: MethodName,
): NonNullable<NativeSecureStorageModule[MethodName]> => {
    const module = getNativeSecureStorageModule();
    const method = module[methodName];

    if (typeof method !== 'function') {
        throw new Error(getMissingMethodMessage(methodName));
    }

    return method.bind(module) as NonNullable<NativeSecureStorageModule[MethodName]>;
};

export const SecureStorageModule = {
    async setSensitiveValue(key: string, value: string): Promise<SecureStorageResponse> {
        if (key.trim() === '' || value.trim() === '') {
            return invalidInputResponse('Key and value cannot be empty');
        }

        return getRequiredNativeMethod('setSensitiveValue')(key, value);
    },

    async getSensitiveValue(key: string): Promise<SecureStorageResponse> {
        if (key.trim() === '') {
            return invalidInputResponse('Key cannot be empty');
        }

        return getRequiredNativeMethod('getSensitiveValue')(key);
    },

    async deleteSensitiveValue(key: string): Promise<SecureStorageResponse> {
        if (key.trim() === '') {
            return invalidInputResponse('Key cannot be empty');
        }

        return getRequiredNativeMethod('deleteSensitiveValue')(key);
    },

    async setValue(key: string, value: string): Promise<boolean> {
        if (key.trim() === '' || value.trim() === '') {
            throw new Error('Key and value cannot be empty');
        }

        return getRequiredNativeMethod('setValue')(key, value);
    },

    async getValue(key: string): Promise<string | null> {
        if (key.trim() === '') {
            throw new Error('Key cannot be empty');
        }

        return getRequiredNativeMethod('getValue')(key);
    },

    async deleteValue(key: string): Promise<boolean> {
        if (key.trim() === '') {
            throw new Error('Key cannot be empty');
        }

        return getRequiredNativeMethod('deleteValue')(key);
    },

    async deleteBiometricKey(key: string): Promise<boolean> {
        if (key.trim() === '') {
            throw new Error('Key cannot be empty');
        }

        return getRequiredNativeMethod('deleteBiometricKey')(key);
    },

    async authenticateBiometric(promptMessage: string): Promise<boolean> {
        if (promptMessage.trim() === '' || !hasNativeMethod('authenticateBiometric')) {
            return false;
        }

        return Boolean(await getRequiredNativeMethod('authenticateBiometric')(promptMessage));
    },

    async isBiometricAvailable(): Promise<boolean> {
        if (!hasNativeMethod('isBiometricAvailable')) {
            return false;
        }

        return Boolean(await getRequiredNativeMethod('isBiometricAvailable')());
    },

    async isBiometricEnabledInApp(keyAlias: string): Promise<boolean> {
        if (keyAlias.trim() === '' || !hasNativeMethod('isBiometricEnabledInApp')) {
            return false;
        }

        return Boolean(await getRequiredNativeMethod('isBiometricEnabledInApp')(keyAlias));
    },

    async isBiometricEnabledOnPhone(): Promise<boolean> {
        if (!hasNativeMethod('isBiometricEnabledOnPhone')) {
            return false;
        }

        return Boolean(await getRequiredNativeMethod('isBiometricEnabledOnPhone')());
    },

    ...(hasNativeMethod('setBiometricProtectedValue')
        ? {
            setBiometricProtectedValue:
                nativeSecureStorageModule!.setBiometricProtectedValue!.bind(nativeSecureStorageModule),
        }
        : {}),
    ...(hasNativeMethod('getBiometricProtectedValue')
        ? {
            getBiometricProtectedValue:
                nativeSecureStorageModule!.getBiometricProtectedValue!.bind(nativeSecureStorageModule),
        }
        : {}),
};

export const isBiometricAuthCancelled = (error: any): boolean => {
    const code = String(error?.code ?? error?.userInfo?.code ?? '');
    const message = [
        error?.message,
        error?.userInfo?.message,
        String(error ?? ''),
    ].filter(Boolean).join(' ').toLowerCase();

    return code === 'AUTH_CANCELLED' ||
        code === 'ERROR_CANCELED' ||
        code === 'ERR_CANCELED' ||
        message.includes('cancel') ||
        message.includes('dismiss') ||
        message.includes('negative button');
};

export const hasBiometricProtectedStorage = (): boolean => (
    hasNativeMethod('setBiometricProtectedValue') &&
    hasNativeMethod('getBiometricProtectedValue')
);

export const hasStandaloneBiometricAuth = (): boolean => (
    hasNativeMethod('authenticateBiometric')
);

export const authenticateBiometric = async (promptMessage: string): Promise<boolean> => {
    if (!hasStandaloneBiometricAuth()) return false;
    return Boolean(await SecureStorageModule.authenticateBiometric(promptMessage));
};

export const biometricKeyExists = async (keyAlias: string): Promise<boolean> => {
    try {
        if (typeof SecureStorageModule?.isBiometricEnabledInApp !== 'function') return false;
        return Boolean(await SecureStorageModule.isBiometricEnabledInApp(keyAlias));
    } catch {
        return false;
    }
};

export const getNonSensitiveValue = async (key: string): Promise<string | null> => {
    try {
        return await SecureStorageModule.getValue(key);
    } catch {
        return null;
    }
};

export const setNonSensitiveValue = async (key: string, value: string): Promise<void> => {
    await SecureStorageModule.setValue(key, value);
};
