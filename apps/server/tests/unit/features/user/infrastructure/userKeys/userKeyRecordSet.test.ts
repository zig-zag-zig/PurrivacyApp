import {
    createEmptyUserEncryptedKeyRecordSet,
    decodeKeyRecordCursor,
    encodeKeyRecordCursor,
    paginateUserEncryptedKeyRecords,
    sanitizeUserEncryptedKeyItems,
    sanitizeUserEncryptedKeyRecordSet,
    toEncryptedKeyRecords,
    toUserEncryptedKeyRecordEntries,
} from '../../../../../../src/features/user/infrastructure/userKeys/userKeyRecordSet';
import { BadRequestError } from '../../../../../../src/utils/errors';

// Need this mock because userKeyRecordSet imports userKeyRefs which imports firebase
jest.mock('../../../../../../src/infrastructure/firebase/index.js', () => ({
    rtdb: { ref: jest.fn() },
}), { virtual: true });

const validPayload = (suffix: string) => ({
    encryptedData: Buffer.from(`payload-${suffix}`, 'utf8').toString('base64'),
    iv: 'a'.repeat(24),
    tag: 'b'.repeat(32),
});

const withUpdatedAt = (payload: ReturnType<typeof validPayload>, updatedAt: number) => ({
    ...payload,
    updatedAt,
});

describe('userKeyRecordSet', () => {
    describe('createEmptyUserEncryptedKeyRecordSet', () => {
        it('returns count 0 and empty items', () => {
            const set = createEmptyUserEncryptedKeyRecordSet();
            expect(set.count).toBe(0);
            expect(set.items).toEqual({});
            expect(typeof set.updatedAt).toBe('number');
        });
    });

    describe('sanitizeUserEncryptedKeyItems', () => {
        it('returns empty object for undefined', () => {
            expect(sanitizeUserEncryptedKeyItems(undefined)).toEqual({});
        });

        it('returns empty object for null', () => {
            expect(sanitizeUserEncryptedKeyItems(null)).toEqual({});
        });

        it('throws for non-object values', () => {
            expect(() => sanitizeUserEncryptedKeyItems('string')).toThrow(BadRequestError);
            expect(() => sanitizeUserEncryptedKeyItems(123)).toThrow(BadRequestError);
        });

        it('throws for array values', () => {
            expect(() => sanitizeUserEncryptedKeyItems([1, 2, 3])).toThrow(BadRequestError);
        });

        it('sanitizes valid key records and validates record IDs', () => {
            const items = sanitizeUserEncryptedKeyItems({
                validKey: validPayload('AA'),
            });
            expect(items.validKey).toEqual(validPayload('AA'));
        });

        it('preserves numeric updatedAt metadata', () => {
            const items = sanitizeUserEncryptedKeyItems({
                validKey: withUpdatedAt(validPayload('AA'), 1234),
            });
            expect(items.validKey).toEqual(withUpdatedAt(validPayload('AA'), 1234));
        });

        it('drops non-numeric updatedAt metadata', () => {
            const items = sanitizeUserEncryptedKeyItems({
                validKey: { ...validPayload('AA'), updatedAt: 'garbage' },
            });
            expect(items.validKey).toEqual(validPayload('AA'));
        });

        it('throws for invalid record IDs', () => {
            expect(() => sanitizeUserEncryptedKeyItems({
                'bad.key': validPayload('AA'),
            })).toThrow(BadRequestError);
        });
    });

    describe('sanitizeUserEncryptedKeyRecordSet', () => {
        it('throws for non-object', () => {
            expect(() => sanitizeUserEncryptedKeyRecordSet(null)).toThrow(BadRequestError);
        });

        it('derives count from items length', () => {
            const set = sanitizeUserEncryptedKeyRecordSet({
                items: { k1: validPayload('1'), k2: validPayload('2') },
                updatedAt: 1000,
            });
            expect(set.count).toBe(2);
            expect(set.updatedAt).toBe(1000);
        });

        it('defaults updatedAt to 0 when not a number', () => {
            const set = sanitizeUserEncryptedKeyRecordSet({
                items: {},
                updatedAt: 'invalid',
            });
            expect(set.updatedAt).toBe(0);
        });
    });

    describe('toEncryptedKeyRecords', () => {
        it('converts items record to array of EncryptedKeyRecordWithId', () => {
            const p1 = validPayload('AA');
            const p2 = validPayload('BB');
            const records = toEncryptedKeyRecords({
                k1: p1,
                k2: p2,
            });
            expect(records).toEqual([
                { recordId: 'k1', key: p1 },
                { recordId: 'k2', key: p2 },
            ]);
        });

        it('strips server-side metadata from the API shape', () => {
            const records = toEncryptedKeyRecords({
                k1: withUpdatedAt(validPayload('AA'), 1234),
            });
            expect(records).toEqual([{ recordId: 'k1', key: validPayload('AA') }]);
        });

        it('returns empty array for empty items', () => {
            expect(toEncryptedKeyRecords({})).toEqual([]);
        });
    });

    describe('toUserEncryptedKeyRecordEntries', () => {
        it('keeps updatedAt metadata for internal pagination', () => {
            const entries = toUserEncryptedKeyRecordEntries({
                k1: withUpdatedAt(validPayload('AA'), 1234),
                k2: validPayload('BB'),
            });
            expect(entries).toEqual([
                { recordId: 'k1', key: validPayload('AA'), updatedAt: 1234 },
                { recordId: 'k2', key: validPayload('BB'), updatedAt: undefined },
            ]);
        });
    });

    describe('cursor codec', () => {
        it('encodes updatedAt and recordId', () => {
            expect(encodeKeyRecordCursor({ recordId: 'r0001', updatedAt: 1234 })).toBe('1234:r0001');
        });

        it('encodes legacy records with effective updatedAt 0', () => {
            expect(encodeKeyRecordCursor({ recordId: 'r0001' })).toBe('0:r0001');
        });

        it('decodes a valid cursor', () => {
            expect(decodeKeyRecordCursor('1234:r0001')).toEqual({ updatedAt: 1234, recordId: 'r0001' });
        });

        it('rejects malformed cursors', () => {
            expect(decodeKeyRecordCursor('')).toBeNull();
            expect(decodeKeyRecordCursor(':r0001')).toBeNull();
            expect(decodeKeyRecordCursor('abc:r0001')).toBeNull();
            expect(decodeKeyRecordCursor('1234:')).toBeNull();
            expect(decodeKeyRecordCursor('1234')).toBeNull();
        });
    });

    describe('paginateUserEncryptedKeyRecords', () => {
        const entry = (recordId: string, updatedAt?: number) => ({
            recordId,
            key: validPayload(recordId),
            updatedAt,
        });

        it('returns an empty page for no records', () => {
            expect(paginateUserEncryptedKeyRecords([], { limit: 200 })).toEqual({ records: [] });
        });

        it('sorts by updatedAt then recordId and emits a nextCursor when truncated', () => {
            const records = [
                entry('b', 200),
                entry('a', 100),
                entry('c', 200),
                entry('d', 300),
            ];
            const page = paginateUserEncryptedKeyRecords(records, { limit: 2 });

            expect(page.records.map(record => record.recordId)).toEqual(['a', 'b']);
            expect(page.nextCursor).toBe('200:b');
        });

        it('pages through the whole set with a cursor', () => {
            const records = [entry('a', 100), entry('b', 200), entry('c', 200), entry('d', 300)];
            const first = paginateUserEncryptedKeyRecords(records, { limit: 2 });
            const second = paginateUserEncryptedKeyRecords(records, { limit: 2, cursor: first.nextCursor });

            expect(second.records.map(record => record.recordId)).toEqual(['c', 'd']);
            expect(second.nextCursor).toBeUndefined();
        });

        it('skips forward when the cursor record was deleted', () => {
            const records = [entry('a', 100), entry('c', 200), entry('d', 300)];
            const second = paginateUserEncryptedKeyRecords(records, { limit: 2, cursor: '200:b' });

            expect(second.records.map(record => record.recordId)).toEqual(['c', 'd']);
        });

        it('filters by since and includes legacy records', () => {
            const records = [entry('legacy'), entry('old', 100), entry('new', 300)];
            const page = paginateUserEncryptedKeyRecords(records, { limit: 200, since: 200 });

            expect(page.records.map(record => record.recordId)).toEqual(['legacy', 'new']);
        });

        it('throws for a malformed cursor', () => {
            expect(() => paginateUserEncryptedKeyRecords(
                [entry('a', 100)],
                { limit: 10, cursor: 'garbage' },
            )).toThrow(BadRequestError);
        });

        it('throws for a cursor with an invalid record id', () => {
            expect(() => paginateUserEncryptedKeyRecords(
                [entry('a', 100)],
                { limit: 10, cursor: '100:bad.key' },
            )).toThrow(BadRequestError);
        });
    });
});
