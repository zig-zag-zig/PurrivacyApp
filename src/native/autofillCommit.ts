import { NativeModules, Platform } from 'react-native';

export interface PendingSignupPayload {
    seed: string;
    username: string;
    password: string;
}

interface AutofillCommitModuleSpec {
    commit(): void;
    /** Finishes and relaunches the activity; takes NO secret arguments. */
    restartActivity(): void;
    /** Persists the pending signup as a Keystore-encrypted envelope. */
    persistPendingSignup(payloadJson: string): Promise<boolean>;
    consumePendingSignup(): Promise<PendingSignupPayload | null>;
}

const AutofillCommitModule = NativeModules.AutofillCommitModule as (AutofillCommitModuleSpec | undefined) | undefined;

/**
 * True when the Android native restart path exists (the restart shows the
 * password-manager save dialog; secrets travel via the encrypted envelope).
 */
export const isNativeSignupRestartAvailable = (): boolean =>
    Platform.OS === 'android' && Boolean(AutofillCommitModule?.restartActivity);

export const commitAutofill = () => {
    if (Platform.OS !== 'android') return;
    AutofillCommitModule?.commit();
};

/**
 * Relaunches the Android activity so the password manager shows its save
 * dialog. Never carries secrets (APP-SEC-001): use persistPendingSignup
 * first when the signup must survive the restart.
 */
export const restartActivity = () => {
    if (Platform.OS !== 'android') return;
    AutofillCommitModule?.restartActivity();
};

export const persistPendingSignup = (payload: PendingSignupPayload): Promise<boolean> => {
    if (Platform.OS !== 'android' || !AutofillCommitModule?.persistPendingSignup) {
        return Promise.resolve(false);
    }
    return AutofillCommitModule.persistPendingSignup(JSON.stringify(payload))
        .then((ok: boolean) => Boolean(ok))
        .catch(() => false);
};

export const consumePendingSignup = (): Promise<PendingSignupPayload | null> => {
    if (Platform.OS !== 'android') return Promise.resolve(null);
    return AutofillCommitModule?.consumePendingSignup() ?? Promise.resolve(null);
};
