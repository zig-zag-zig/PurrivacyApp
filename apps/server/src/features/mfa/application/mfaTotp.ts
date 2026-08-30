import { Secret, TOTP } from 'otpauth';

export const createMfaTotp = (label: string): TOTP => {
    return new TOTP({
        issuer: 'Purrivacy',
        label,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
    });
};

export const verifyMfaTotp = (secret: string, code: string): boolean => {
    const totp = new TOTP({ secret: Secret.fromBase32(secret) });
    return totp.validate({ token: code, window: 1 }) !== null;
};

