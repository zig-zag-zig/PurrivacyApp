import { isPlainObject } from '../../../../src/infrastructure/firebase/utils';

describe('isPlainObject', () => {
    it('returns true for plain objects', () => {
        expect(isPlainObject({})).toBe(true);
        expect(isPlainObject({ a: 1 })).toBe(true);
        expect(isPlainObject(Object.create(null))).toBe(true);
    });

    it('returns false for null', () => {
        expect(isPlainObject(null)).toBe(false);
    });

    it('returns false for arrays', () => {
        expect(isPlainObject([])).toBe(false);
        expect(isPlainObject([1, 2, 3])).toBe(false);
    });

    it('returns false for primitives', () => {
        expect(isPlainObject('string')).toBe(false);
        expect(isPlainObject(123)).toBe(false);
        expect(isPlainObject(true)).toBe(false);
        expect(isPlainObject(undefined)).toBe(false);
    });

    it('treats Date as a plain object (typeof === object and not array)', () => {
        expect(isPlainObject(new Date())).toBe(true);
    });
});
