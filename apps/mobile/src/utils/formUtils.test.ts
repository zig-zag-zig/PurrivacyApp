import { describe, expect, it } from 'vitest';
import { ALGORITHM_OPTIONS, RSA_BITS_OPTIONS } from './formUtils';

describe('ALGORITHM_OPTIONS', () => {
    it('contains RSA, ECDSA, and EDDSA', () => {
        expect(ALGORITHM_OPTIONS).toHaveLength(3);
        expect(ALGORITHM_OPTIONS.map(o => o.value)).toEqual(['RSA', 'ECDSA', 'EDDSA']);
    });

    it('has matching label and value for all options', () => {
        for (const option of ALGORITHM_OPTIONS) {
            expect(option.label).toBe(option.value);
        }
    });
});

describe('RSA_BITS_OPTIONS', () => {
    it('contains 2048, 3072, and 4096', () => {
        expect(RSA_BITS_OPTIONS).toHaveLength(3);
        expect(RSA_BITS_OPTIONS.map(o => o.value)).toEqual([2048, 3072, 4096]);
    });

    it('has string labels matching the numeric values', () => {
        for (const option of RSA_BITS_OPTIONS) {
            expect(option.label).toBe(String(option.value));
        }
    });
});
