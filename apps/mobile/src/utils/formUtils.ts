/**
 * Common algorithm options for key generation
 */
export const ALGORITHM_OPTIONS = [
    { label: 'RSA', value: 'RSA' },
    { label: 'ECDSA', value: 'ECDSA' },
    { label: 'EDDSA', value: 'EDDSA' },
] as const;

/**
 * RSA key size options
 */
export const RSA_BITS_OPTIONS = [
    { label: '2048', value: 2048 },
    { label: '3072', value: 3072 },
    { label: '4096', value: 4096 },
] as const;