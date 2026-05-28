import { NativeModules, Platform } from 'react-native';

const { SecureStorageModule } = NativeModules;

const hasMethod = (method: string): boolean => (
  Platform.OS === 'android' && typeof SecureStorageModule?.[method] === 'function'
);

export const androidApkInstaller = {
  isAvailable: (): boolean => hasMethod('installApk'),

  canRequestPackageInstalls: async (): Promise<boolean> => {
    if (!hasMethod('canRequestPackageInstalls')) return true;
    return Boolean(await SecureStorageModule.canRequestPackageInstalls());
  },

  openInstallPermissionSettings: async (): Promise<void> => {
    if (!hasMethod('openInstallPermissionSettings')) return;
    await SecureStorageModule.openInstallPermissionSettings();
  },

  installApk: async (contentUri: string): Promise<void> => {
    if (!hasMethod('installApk')) {
      throw new Error('APK installer is not available in this build');
    }

    await SecureStorageModule.installApk(contentUri);
  },
};
