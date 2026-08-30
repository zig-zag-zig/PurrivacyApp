import {
    isPushTokenAssignment,
    isDevicePushTokenAssignment,
} from '../../../../../src/features/notification/infrastructure/pushTokens/pushTokenAssignmentGuards';

describe('isPushTokenAssignment', () => {
    it('accepts a valid object with userId and deviceId', () => {
        expect(isPushTokenAssignment({ userId: 'user-1', deviceId: 'dev-1' })).toBe(true);
    });

    it('accepts an object with extra fields', () => {
        expect(isPushTokenAssignment({ userId: 'u', deviceId: 'd', extra: 'data' })).toBe(true);
    });

    it('rejects null', () => {
        expect(isPushTokenAssignment(null)).toBe(false);
    });

    it('rejects undefined', () => {
        expect(isPushTokenAssignment(undefined)).toBe(false);
    });

    it('rejects an array', () => {
        expect(isPushTokenAssignment([1, 2, 3])).toBe(false);
    });

    it('rejects an object missing userId', () => {
        expect(isPushTokenAssignment({ deviceId: 'dev-1' })).toBe(false);
    });

    it('rejects an object missing deviceId', () => {
        expect(isPushTokenAssignment({ userId: 'user-1' })).toBe(false);
    });

    it('rejects an object with empty userId', () => {
        expect(isPushTokenAssignment({ userId: '  ', deviceId: 'dev-1' })).toBe(false);
    });

    it('rejects an object with empty deviceId', () => {
        expect(isPushTokenAssignment({ userId: 'user-1', deviceId: '  ' })).toBe(false);
    });

    it('rejects non-string userId', () => {
        expect(isPushTokenAssignment({ userId: 123, deviceId: 'dev-1' })).toBe(false);
    });
});

describe('isDevicePushTokenAssignment', () => {
    it('accepts a valid object with userId and pushToken', () => {
        expect(isDevicePushTokenAssignment({ userId: 'user-1', pushToken: 'ExponentPushToken[abc]' })).toBe(true);
    });

    it('rejects null', () => {
        expect(isDevicePushTokenAssignment(null)).toBe(false);
    });

    it('rejects an object missing pushToken', () => {
        expect(isDevicePushTokenAssignment({ userId: 'user-1' })).toBe(false);
    });

    it('rejects an object with empty pushToken', () => {
        expect(isDevicePushTokenAssignment({ userId: 'user-1', pushToken: '  ' })).toBe(false);
    });

    it('rejects non-string pushToken', () => {
        expect(isDevicePushTokenAssignment({ userId: 'user-1', pushToken: 123 })).toBe(false);
    });
});
