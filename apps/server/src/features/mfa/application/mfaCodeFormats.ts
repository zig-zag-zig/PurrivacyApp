type MfaCodeKind = 'recovery' | 'totp' | 'invalid';

const RECOVERY_CODE_RE = /^[A-Z0-9]{12}$/;
const TOTP_CODE_RE = /^\d{6}$/;

export const getMfaCodeKind = (code: string): MfaCodeKind => {
    if (RECOVERY_CODE_RE.test(code)) {
        return 'recovery';
    }

    if (TOTP_CODE_RE.test(code)) {
        return 'totp';
    }

    return 'invalid';
};

