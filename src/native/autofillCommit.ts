import { NativeModules, Platform } from 'react-native';

export const commitAutofill = () => {
    if (Platform.OS !== 'android') return;
    NativeModules.AutofillCommitModule?.commit();
};

export const restartActivity = (seed: string, username: string, password: string) => {
    if (Platform.OS !== 'android') return;
    NativeModules.AutofillCommitModule?.restartActivity(seed, username, password);
};

export const consumePendingSignup = (): Promise<{ seed: string; username: string; password: string } | null> => {
    if (Platform.OS !== 'android') return Promise.resolve(null);
    return NativeModules.AutofillCommitModule?.consumePendingSignup() ?? Promise.resolve(null);
};
