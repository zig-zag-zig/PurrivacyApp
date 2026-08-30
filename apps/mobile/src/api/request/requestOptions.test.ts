import { describe, expect, it } from 'vitest';
import { RequestOptions } from './requestOptions';

describe('RequestOptions', () => {
    it('creates options with useSessionAuth defaulting to true', () => {
        const opts = new RequestOptions();
        expect(opts.mfaCode).toBeUndefined();
        expect(opts.useSessionAuth).toBe(true);
        expect(opts.includeDeviceId).toBeUndefined();
    });

    it('accepts mfaCode as a property', () => {
        const opts = new RequestOptions();
        opts.mfaCode = '123456';
        expect(opts.mfaCode).toBe('123456');
    });

    it('accepts useSessionAuth as a property', () => {
        const opts = new RequestOptions();
        opts.useSessionAuth = false;
        expect(opts.useSessionAuth).toBe(false);
    });

    it('accepts includeDeviceId as a property', () => {
        const opts = new RequestOptions();
        opts.includeDeviceId = true;
        expect(opts.includeDeviceId).toBe(true);
    });

    it('can be used as a plain object with spread', () => {
        const opts = new RequestOptions();
        opts.mfaCode = '999';
        const spread = { ...opts, extra: 'value' };
        expect(spread.mfaCode).toBe('999');
        expect(spread.extra).toBe('value');
    });
});
