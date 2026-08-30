import { assertUserKeyRecordId, USER_KEY_ITEMS_CHILD } from '../../../../../../src/features/user/infrastructure/userKeys/userKeyRefs';
import { BadRequestError } from '../../../../../../src/utils/errors';

// Need this mock because userKeyRefs imports rtdb from firebase index
jest.mock('../../../../../../src/infrastructure/firebase/index.js', () => ({
    rtdb: { ref: jest.fn() },
}), { virtual: true });

describe('userKeyRefs', () => {
    describe('assertUserKeyRecordId', () => {
        it('accepts valid alphanumeric key', () => {
            expect(() => assertUserKeyRecordId('validKey123')).not.toThrow();
        });

        it('accepts key with hyphens and underscores', () => {
            expect(() => assertUserKeyRecordId('my-key_name')).not.toThrow();
        });

        it('throws for key with dot', () => {
            expect(() => assertUserKeyRecordId('bad.key')).toThrow(BadRequestError);
        });

        it('throws for key with dollar sign', () => {
            expect(() => assertUserKeyRecordId('bad$key')).toThrow(BadRequestError);
        });

        it('throws for key with hash', () => {
            expect(() => assertUserKeyRecordId('bad#key')).toThrow(BadRequestError);
        });

        it('throws for key with square brackets', () => {
            expect(() => assertUserKeyRecordId('bad[key]')).toThrow(BadRequestError);
        });

        it('throws for key with slash', () => {
            expect(() => assertUserKeyRecordId('bad/key')).toThrow(BadRequestError);
        });

        it('throws for empty string', () => {
            expect(() => assertUserKeyRecordId('')).toThrow(BadRequestError);
        });

        it('throws for whitespace-only', () => {
            expect(() => assertUserKeyRecordId('   ')).toThrow(BadRequestError);
        });

        it('includes recordId in error message', () => {
            expect(() => assertUserKeyRecordId('bad.key')).toThrow('not a valid key record id');
        });
    });

    describe('USER_KEY_ITEMS_CHILD', () => {
        it('is "items"', () => {
            expect(USER_KEY_ITEMS_CHILD).toBe('items');
        });
    });
});
