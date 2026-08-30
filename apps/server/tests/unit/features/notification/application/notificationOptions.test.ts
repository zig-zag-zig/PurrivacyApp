import { getNotificationKind } from '../../../../../src/features/notification/application/notificationOptions';
import { BadRequestError } from '../../../../../src/utils/errors';

describe('notificationOptions', () => {
    describe('getNotificationKind', () => {
        it('returns visible when title is provided', () => {
            expect(getNotificationKind({ title: 'Hello', body: 'World' })).toBe('visible');
        });

        it('returns visible when only body is provided', () => {
            expect(getNotificationKind({ body: 'Just a body' })).toBe('visible');
        });

        it('returns data when eventName is provided', () => {
            expect(getNotificationKind({ eventName: 'chat.message' })).toBe('data');
        });

        it('returns data with payload', () => {
            expect(getNotificationKind({ eventName: 'chat.message', payload: { id: '1' } })).toBe('data');
        });

        it('returns data when title is whitespace only', () => {
            expect(getNotificationKind({ title: '  ', eventName: 'test' })).toBe('data');
        });

        it('throws when title and eventName are both present', () => {
            expect(() => getNotificationKind({ title: 'Hi', eventName: 'test' })).toThrow(BadRequestError);
        });

        it('throws when neither title nor eventName is provided', () => {
            expect(() => getNotificationKind({})).toThrow(BadRequestError);
        });

        it('throws when payload is null', () => {
            expect(() => getNotificationKind({ eventName: 'test', payload: null as unknown })).toThrow(BadRequestError);
        });

        it('throws when payload is an array', () => {
            expect(() => getNotificationKind({ eventName: 'test', payload: [] as unknown })).toThrow(BadRequestError);
        });

        it('throws when payload is a string', () => {
            expect(() => getNotificationKind({ eventName: 'test', payload: 'bad' as unknown })).toThrow(BadRequestError);
        });
    });
});
