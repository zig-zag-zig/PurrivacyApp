import { describe, expect, it, vi, beforeEach } from 'vitest';

const securityServiceMock = vi.hoisted(() => ({
    getStoredSession: vi.fn(),
}));

vi.mock('../../features/auth/domain/authUtils', () => ({
    getUserId: () => 'user-id',
}));

vi.mock('../../features/security/services/securityService', () => ({
    securityService: securityServiceMock,
}));

vi.mock('../../utils/logger', () => ({
    logger: { warn: vi.fn() },
}));

import { isSensitiveAndRequiresMfa } from './mfaSensitivity';

describe('isSensitiveAndRequiresMfa', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns true for sensitive endpoint with MFA enabled', async () => {
        securityServiceMock.getStoredSession.mockResolvedValue({ mfaEnabled: true, mfaTrusted: false });
        expect(await isSensitiveAndRequiresMfa('/user/change-password', 'POST')).toBe(true);
    });

    it('returns false for non-sensitive endpoint', async () => {
        securityServiceMock.getStoredSession.mockResolvedValue({ mfaEnabled: true, mfaTrusted: false });
        expect(await isSensitiveAndRequiresMfa('/user', 'GET')).toBe(false);
    });

    it('returns false when session check fails', async () => {
        securityServiceMock.getStoredSession.mockRejectedValue(new Error('no session'));
        expect(await isSensitiveAndRequiresMfa('/user/change-password', 'POST')).toBe(false);
    });

    it('returns false for /mfa/enable when no stored session exists', async () => {
        securityServiceMock.getStoredSession.mockResolvedValue(null);
        expect(await isSensitiveAndRequiresMfa('/mfa/enable', 'POST')).toBe(false);
    });

    it('returns true for method-specific sensitive endpoint', async () => {
        securityServiceMock.getStoredSession.mockResolvedValue({ mfaEnabled: true, mfaTrusted: false });
        expect(await isSensitiveAndRequiresMfa('/user', 'DELETE')).toBe(true);
    });

    it('returns false when MFA is not enabled', async () => {
        securityServiceMock.getStoredSession.mockResolvedValue({ mfaEnabled: false, mfaTrusted: false });
        expect(await isSensitiveAndRequiresMfa('/user/change-password', 'POST')).toBe(false);
    });
});
