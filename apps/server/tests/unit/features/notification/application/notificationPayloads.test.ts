import { buildExpoPushMessages, collectInvalidPushTokens } from '../../../../../src/features/notification/application/expoPushPayloads';
import { SendNotificationOptions } from '../../../../../src/features/notification/application/notificationTypes';

describe('buildExpoPushMessages', () => {
    it('sets sound for visible notifications', () => {
        const tokens = ['ExponentPushToken[test123]'];
        const options: SendNotificationOptions = { title: 'Hello', body: 'World' };
        const messages = buildExpoPushMessages(tokens, options, 'visible');

        expect(messages).toHaveLength(1);
        expect(messages[0].sound).toBe('default');
        expect(messages[0].title).toBe('Hello');
        expect(messages[0].body).toBe('World');
    });

    it('sets priority and _contentAvailable for data notifications', () => {
        const tokens = ['ExponentPushToken[test123]'];
        const options: SendNotificationOptions = { eventName: 'test.event', payload: { id: '1' } };
        const messages = buildExpoPushMessages(tokens, options, 'data');

        expect(messages).toHaveLength(1);
        expect(messages[0].priority).toBe('high');
        expect(messages[0]._contentAvailable).toBe(true);
        expect(messages[0].sound).toBeUndefined();
    });

    it('creates one message per token', () => {
        const tokens = ['token-1', 'token-2', 'token-3'];
        const options: SendNotificationOptions = { eventName: 'test' };
        const messages = buildExpoPushMessages(tokens, options, 'data');

        expect(messages).toHaveLength(3);
        expect(messages[0].to).toBe('token-1');
        expect(messages[1].to).toBe('token-2');
        expect(messages[2].to).toBe('token-3');
    });
});

describe('collectInvalidPushTokens', () => {
    it('extracts tokens from error tickets with expoPushToken detail', () => {
        const tokens = ['token-1', 'token-2', 'token-3'];
        const tickets = [
            { status: 'ok' as const, id: 'ticket-1' },
            { status: 'error' as const, message: 'Invalid', details: { expoPushToken: 'token-2' } },
            { status: 'ok' as const, id: 'ticket-3' },
        ] as import('expo-server-sdk').ExpoPushTicket[];

        expect(collectInvalidPushTokens(tokens, tickets)).toEqual(['token-2']);
    });

    it('returns empty array when no errors', () => {
        const tokens = ['token-1'];
        const tickets = [
            { status: 'ok' as const, id: 'ticket-1' },
        ] as import('expo-server-sdk').ExpoPushTicket[];

        expect(collectInvalidPushTokens(tokens, tickets)).toEqual([]);
    });

    it('returns empty array for error tickets without expoPushToken detail', () => {
        const tokens = ['token-1'];
        const tickets = [
            { status: 'error' as const, message: 'Unknown error', details: { someOtherField: true } },
        ] as unknown as import('expo-server-sdk').ExpoPushTicket[];

        expect(collectInvalidPushTokens(tokens, tickets)).toEqual([]);
    });
});
