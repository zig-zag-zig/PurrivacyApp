import { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { NotificationKind, SendNotificationOptions } from './notificationTypes';

export const buildExpoPushMessages = (
    pushTokens: string[],
    options: SendNotificationOptions,
    kind: NotificationKind,
): ExpoPushMessage[] => {
    return pushTokens.map((token) => {
        const message: ExpoPushMessage = {
            to: token,
            data: {
                eventName: options.eventName,
                payload: options.payload,
            },
        };

        if (options.title) message.title = options.title;
        if (options.body) message.body = options.body;
        if (kind === 'visible') {
            message.sound = 'default';
        } else {
            message.priority = 'high';
            message._contentAvailable = true;
        }

        return message;
    });
};

export const collectInvalidPushTokens = (
    pushTokens: string[],
    tickets: ExpoPushTicket[],
): string[] => {
    return tickets.flatMap((ticket, index) => {
        if (ticket.status !== 'error') {
            return [];
        }

        const errorDetails = ticket.details;
        return errorDetails && 'expoPushToken' in errorDetails
            ? [pushTokens[index]]
            : [];
    });
};
