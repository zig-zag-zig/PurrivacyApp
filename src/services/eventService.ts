import type { MfaState } from '../features/mfa/model/mfaTypes';

export type EventPayload = Record<string, unknown>;

export type AppEventPayloadMap = {
    clearMfaCode: { isWrongMfaCode?: boolean } | undefined;
    closeMfaModal: { delayMs?: number; force?: boolean } | undefined;
    devTempKeys: undefined;
    mfaState: { mfaState: MfaState; source?: 'remoteNotification' };
    newRecoveryCodes: { recoveryCodes: string[] };
    signOut: undefined;
    user: undefined;
};

type AppEventName = keyof AppEventPayloadMap;

type AppEventListener = (
    eventName: AppEventName,
    payload: EventPayload | undefined,
) => void;

const appEventNames = new Set<AppEventName>([
    'clearMfaCode',
    'closeMfaModal',
    'devTempKeys',
    'mfaState',
    'newRecoveryCodes',
    'signOut',
    'user',
]);

const pendingEvents = new Map<AppEventName, EventPayload | undefined>();
const eventListeners = new Set<AppEventListener>();

export const isAppEventName = (eventName: string): eventName is AppEventName => (
    appEventNames.has(eventName as AppEventName)
);

type EventArgs<T extends AppEventName> = undefined extends AppEventPayloadMap[T]
    ? [payload?: AppEventPayloadMap[T]]
    : [payload: AppEventPayloadMap[T]];

export const EventService = {
    addEvent: <T extends AppEventName>(eventName: T, ...args: EventArgs<T>) => {
        const payload = args[0] as EventPayload | undefined;
        pendingEvents.set(eventName, payload);
        eventListeners.forEach(cb => cb(eventName, payload));
    },

    consumeEvent: <T extends AppEventName>(eventName: T): AppEventPayloadMap[T] | undefined => {
        const payload = pendingEvents.get(eventName);
        pendingEvents.delete(eventName);
        return payload as AppEventPayloadMap[T] | undefined;
    },

    addListener: (callback: AppEventListener) => {
        eventListeners.add(callback);
        return () => eventListeners.delete(callback);
    },

    getPendingEvents: () => new Map(pendingEvents),
};
