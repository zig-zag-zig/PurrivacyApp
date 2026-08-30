import { BadRequestError } from '../../../../../src/utils/errors';
import {
    parseCreateUserRequest,
    parseKeyRecordListQuery,
    parseKeyRecordRequest,
    parseSavePushTokenRequest,
    parseDeletePushTokenRequest,
} from '../../../../../src/features/user/api/userRequests';
import { MAX_PUSH_TOKEN_LENGTH } from '../../../../../src/core/constants';

describe('userRequests', () => {
    describe('parseCreateUserRequest', () => {
        it('extracts userData from body', () => {
            const data = { dekPassword: {} };
            expect(parseCreateUserRequest({ userData: data })).toBe(data);
        });

        it('throws when userData is missing', () => {
            expect(() => parseCreateUserRequest({ user: {} })).toThrow(BadRequestError);
        });
    });

    describe('parseKeyRecordRequest', () => {
        it('extracts key from body', () => {
            const key = { encryptedData: 'x', iv: 'y', tag: 'z' };
            expect(parseKeyRecordRequest({ key })).toBe(key);
        });

        it('throws when key is missing', () => {
            expect(() => parseKeyRecordRequest({})).toThrow(BadRequestError);
        });
    });

    describe('parseKeyRecordListQuery', () => {
        it('returns empty options for an empty query', () => {
            expect(parseKeyRecordListQuery({})).toEqual({});
        });

        it('parses limit, cursor and since', () => {
            expect(parseKeyRecordListQuery({
                limit: '50',
                cursor: '1234:r0001',
                since: '1000',
            })).toEqual({
                limit: 50,
                cursor: '1234:r0001',
                since: 1000,
            });
        });

        it('accepts a zero since', () => {
            expect(parseKeyRecordListQuery({ since: '0' })).toEqual({ since: 0 });
        });

        it('rejects a non-numeric limit', () => {
            expect(() => parseKeyRecordListQuery({ limit: 'abc' })).toThrow(BadRequestError);
        });

        it('rejects a limit below 1', () => {
            expect(() => parseKeyRecordListQuery({ limit: '0' })).toThrow(BadRequestError);
        });

        it('rejects a limit above the maximum page size', () => {
            expect(() => parseKeyRecordListQuery({ limit: '501' })).toThrow(BadRequestError);
        });

        it('rejects an empty cursor', () => {
            expect(() => parseKeyRecordListQuery({ cursor: '  ' })).toThrow(BadRequestError);
        });

        it('rejects a non-numeric since', () => {
            expect(() => parseKeyRecordListQuery({ since: 'yesterday' })).toThrow(BadRequestError);
        });

        it('rejects a non-integer since', () => {
            expect(() => parseKeyRecordListQuery({ since: '1.5' })).toThrow(BadRequestError);
        });

        it('rejects a negative since', () => {
            expect(() => parseKeyRecordListQuery({ since: '-1' })).toThrow(BadRequestError);
        });
    });

    describe('parseSavePushTokenRequest', () => {
        it('returns pushToken and deviceId', () => {
            expect(parseSavePushTokenRequest({ pushToken: ' ExpoPushToken[test] ' }, ' device-1 ')).toEqual({
                pushToken: ' ExpoPushToken[test] ',
                deviceId: ' device-1 ',
            });
        });

        it('throws when pushToken is not a string', () => {
            expect(() => parseSavePushTokenRequest({ pushToken: 1 }, 'dev')).toThrow(BadRequestError);
        });

        it('throws when deviceId is empty or whitespace', () => {
            expect(() => parseSavePushTokenRequest({ pushToken: 'tok' }, '   ')).toThrow(BadRequestError);
        });
    });

    describe('parseDeletePushTokenRequest', () => {
        it('returns pushToken', () => {
            expect(parseDeletePushTokenRequest({ pushToken: 'tok' })).toBe('tok');
        });

        it('throws when pushToken is missing', () => {
            expect(() => parseDeletePushTokenRequest({})).toThrow(BadRequestError);
        });
    });
});
