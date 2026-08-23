import type { MfaState } from '../features/mfa/model/mfaTypes';

/** Generic payload fallback for external consumers that handle events loosely. */
// Payloads are narrowed per event via AppEventPayloadMap below.

export type AppEventPayloadMap = {
    clearMfaCode: { isWrongMfaCode?: boolean; message?: string } | undefined;
    closeMfaModal: { delayMs?: number; force?: boolean } | undefined;
    devTempKeys: undefined;
    mfaState: { mfaState: MfaState; source?: 'remoteNotification' };
    newRecoveryCodes: { recoveryCodes: string[] };
    passphraseStorageChanged: { enabled: boolean };
    passphraseSynced: { fingerprint: string; passphrase: string };
    passphraseDeleted: { fingerprint: string };
    signOut: undefined;
    user: undefined;
};

type AppEventName = keyof AppEventPayloadMap;

/**
 * Listener signature. `payload` is correlated to `eventName` through
 * `AppEventPayloadMap`, so listeners can narrow with `eventName === '...'`.
 */
type AppEventListener = (
    eventName: AppEventName,
    payload: AppEventPayloadMap[AppEventName] | undefined,
) => void;

const appEventNames = new Set<AppEventName>([
    'clearMfaCode',
    'closeMfaModal',
    'devTempKeys',
    'mfaState',
    'newRecoveryCodes',
    'passphraseStorageChanged',
    'passphraseSynced',
    'passphraseDeleted',
    'signOut',
    'user',
]);

const pendingEvents = new Map<AppEventName, AppEventPayloadMap[AppEventName] | undefined>();
const eventListeners = new Set<AppEventListener>();

export const isAppEventName = (eventName: string): eventName is AppEventName => (
    appEventNames.has(eventName as AppEventName)
);

type EventArgs<T extends AppEventName> = undefined extends AppEventPayloadMap[T]
    ? [payload?: AppEventPayloadMap[T]]
    : [payload: AppEventPayloadMap[T]];

export const EventService = {
    addEvent: <T extends AppEventName>(eventName: T, ...args: EventArgs<T>) => {
        const payload = args[0];
        pendingEvents.set(eventName, payload);
        eventListeners.forEach(cb => cb(eventName, payload));
    },

    consumeEvent: <T extends AppEventName>(eventName: T): AppEventPayloadMap[T] | undefined => {
        // The map stores the payload union; the caller's `T` correlates it.
        const payload = pendingEvents.get(eventName) as AppEventPayloadMap[T] | undefined;
        pendingEvents.delete(eventName);
        return payload;
    },

    addListener: (callback: AppEventListener) => {
        eventListeners.add(callback);
        return () => eventListeners.delete(callback);
    },

    getPendingEvents: () => new Map(pendingEvents),

    resetForTesting: () => {
        pendingEvents.clear();
        eventListeners.clear();
    },
};
