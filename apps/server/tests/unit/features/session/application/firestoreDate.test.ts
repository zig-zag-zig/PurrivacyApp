import { toDate, isValidDate } from '../../../../../src/features/session/application/firestoreDate';

describe('toDate', () => {
    it('extracts Date from a Firestore Timestamp-like object', () => {
        const expected = new Date('2025-01-15T10:00:00Z');
        const timestamp = { toDate: () => expected };
        expect(toDate(timestamp)).toBe(expected);
    });

    it('passes through a raw Date object', () => {
        const date = new Date('2025-06-01T12:00:00Z');
        expect(toDate(date)).toBe(date);
    });

    it('handles an object that happens to have a toDate property that returns a Date', () => {
        const expected = new Date('2024-12-25T00:00:00Z');
        const fake = { toDate: () => expected, extra: 'data' };
        expect(toDate(fake)).toBe(expected);
    });
});

describe('isValidDate', () => {
    it('returns true for a valid Date', () => {
        expect(isValidDate(new Date('2025-01-01'))).toBe(true);
    });

    it('returns false for Invalid Date', () => {
        expect(isValidDate(new Date('not-a-date'))).toBe(false);
    });

    it('returns false for null', () => {
        expect(isValidDate(null)).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(isValidDate(undefined)).toBe(false);
    });
});
