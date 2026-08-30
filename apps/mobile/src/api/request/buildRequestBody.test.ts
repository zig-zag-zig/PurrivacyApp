import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-application', () => ({}));
vi.mock('../../features/auth/domain/authUtils', () => ({}));
vi.mock('../apiError', () => ({}));
vi.mock('./requestOptions', () => ({}));

import { buildRequestBody } from './authHeaders';

describe('buildRequestBody', () => {
    it('returns empty object for undefined body', () => {
        expect(buildRequestBody(undefined)).toEqual({});
    });

    it('copies body properties', () => {
        expect(buildRequestBody({ foo: 'bar' })).toEqual({ foo: 'bar' });
    });

    it('adds mfaCode from options', () => {
        expect(buildRequestBody({}, { mfaCode: '123456' })).toEqual({ mfaCode: '123456' });
    });

    it('merges mfaCode with existing body', () => {
        expect(buildRequestBody({ key: 'value' }, { mfaCode: '123456' })).toEqual({ key: 'value', mfaCode: '123456' });
    });
});
