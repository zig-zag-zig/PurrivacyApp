import { BadRequestError } from '../../../../src/utils/errors';
import {
    getBodyValue,
    getBearerToken,
    requireBodyValue,
    requireBodyString,
    parseOptionalTrimmedString,
} from '../../../../src/api/http/requestParsing';

describe('requestParsing', () => {
    describe('getBodyValue', () => {
        it('extracts a field from a plain object body', () => {
            expect(getBodyValue({ field: 'value' }, 'field')).toBe('value');
        });

        it('returns undefined for missing fields', () => {
            expect(getBodyValue({}, 'field')).toBeUndefined();
        });

        it('returns undefined when body is null', () => {
            expect(getBodyValue(null, 'field')).toBeUndefined();
        });

        it('returns undefined when body is an array', () => {
            expect(getBodyValue([1, 2], 'field')).toBeUndefined();
        });

        it('returns undefined when body is a primitive', () => {
            expect(getBodyValue('string', 'field')).toBeUndefined();
        });
    });

    describe('getBearerToken', () => {
        it('extracts token from a valid Bearer header', () => {
            expect(getBearerToken('Bearer my-token')).toBe('my-token');
        });

        it('trims whitespace around token', () => {
            expect(getBearerToken('Bearer  my-token  ')).toBe('my-token');
        });

        it('returns undefined for undefined header', () => {
            expect(getBearerToken(undefined)).toBeUndefined();
        });

        it('returns undefined for non-Bearer auth schemes', () => {
            expect(getBearerToken('Basic my-token')).toBeUndefined();
        });

        it('returns undefined when Bearer prefix is missing', () => {
            expect(getBearerToken('my-token')).toBeUndefined();
        });

        it('returns undefined when token after Bearer is only whitespace', () => {
            expect(getBearerToken('Bearer   ')).toBeUndefined();
        });

        it('returns undefined for empty string', () => {
            expect(getBearerToken('')).toBeUndefined();
        });
    });

    describe('requireBodyValue', () => {
        it('returns value when present and truthy', () => {
            expect(requireBodyValue({ field: 'val' }, 'field')).toBe('val');
        });

        it('throws for falsy non-null values (false)', () => {
            expect(() => requireBodyValue({ field: false }, 'field')).toThrow(BadRequestError);
        });

        it('throws for falsy non-null values (0)', () => {
            expect(() => requireBodyValue({ field: 0 }, 'field')).toThrow(BadRequestError);
        });

        it('throws for empty string', () => {
            expect(() => requireBodyValue({ field: '' }, 'field')).toThrow(BadRequestError);
        });

        it('throws BadRequestError for undefined value', () => {
            expect(() => requireBodyValue({}, 'field')).toThrow(BadRequestError);
        });

        it('throws BadRequestError for null value', () => {
            expect(() => requireBodyValue({ field: null }, 'field')).toThrow(BadRequestError);
        });

        it('includes the field name in the error message', () => {
            expect(() => requireBodyValue({}, 'username')).toThrow('username is required');
        });
    });

    describe('requireBodyString', () => {
        it('returns trimmed string when trim option is true', () => {
            expect(requireBodyString({ field: '  hello  ' }, 'field', { trim: true })).toBe('hello');
        });

        it('returns untrimmed string when no options provided', () => {
            expect(requireBodyString({ field: ' hello ' }, 'field')).toBe(' hello ');
        });

        it('throws when value is not a string', () => {
            expect(() => requireBodyString({ field: 123 }, 'field')).toThrow(/must be a string/);
        });

        it('throws when value is missing', () => {
            expect(() => requireBodyString({}, 'field')).toThrow(/is required/);
        });
    });

    describe('parseOptionalTrimmedString', () => {
        it('returns undefined for undefined value', () => {
            expect(parseOptionalTrimmedString({}, 'field', 100)).toBeUndefined();
        });

        it('returns undefined for null value', () => {
            expect(parseOptionalTrimmedString({ field: null }, 'field', 100)).toBeUndefined();
        });

        it('returns trimmed string for valid input', () => {
            expect(parseOptionalTrimmedString({ field: '  hello  ' }, 'field', 100)).toBe('hello');
        });

        it('returns undefined for whitespace-only string', () => {
            expect(parseOptionalTrimmedString({ field: '   ' }, 'field', 100)).toBeUndefined();
        });

        it('throws when value is not a string', () => {
            expect(() => parseOptionalTrimmedString({ field: 123 }, 'field', 100)).toThrow(/must be a string/);
        });

        it('throws when string exceeds maxLength', () => {
            expect(() => parseOptionalTrimmedString({ field: 'abcdef' }, 'field', 3)).toThrow(/too long/);
        });

        it('accepts string exactly at maxLength', () => {
            expect(parseOptionalTrimmedString({ field: 'abc' }, 'field', 3)).toBe('abc');
        });
    });
});
