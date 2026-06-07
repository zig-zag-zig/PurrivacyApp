export type EventPayload = Record<string, any>;
const pendingEvents = new Map<string, EventPayload | undefined>();
const eventListeners = new Set<(eventName: string, payload: EventPayload | undefined) => void>();

export const EventService = {
    addEvent: (eventName: string, payload?: EventPayload) => {
        pendingEvents.set(eventName, payload);
        eventListeners.forEach(cb => cb(eventName, payload));
    },

    consumeEvent: (eventName: string) => {
        const payload = pendingEvents.get(eventName);
        pendingEvents.delete(eventName);
        return payload;
    },

    addListener: (callback: (eventName: string, payload?: EventPayload) => void) => {
        eventListeners.add(callback);
        return () => eventListeners.delete(callback);
    },

    getPendingEvents: () => new Map(pendingEvents)
};
