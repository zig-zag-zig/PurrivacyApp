import { getUserId } from '../../features/auth/domain/authUtils';
import { securityService } from '../../features/security/services/securityService';
import { logger } from '../../utils/logger';

const SENSITIVE_ENDPOINTS = [
    '/user/change-password',
    { endpoint: '/user', method: 'DELETE' },
    '/mfa/disable',
    '/mfa/enable',
    '/mfa/session/trust',
    '/mfa/recovery-codes/regenerate',
    '/auth/revoke-all-sessions',
];

export async function isSensitiveAndRequiresMfa(endpoint: string, method: string): Promise<boolean> {
    try {
        const userId = getUserId();
        const session = await securityService.getStoredSession(userId);

        if (session && (session.mfaEnabled || endpoint === '/mfa/enable')) {
            for (const sensitiveEndpoint of SENSITIVE_ENDPOINTS) {
                if (typeof sensitiveEndpoint === 'string') {
                    if (sensitiveEndpoint === endpoint) {
                        return true;
                    }
                } else if (sensitiveEndpoint.endpoint === endpoint && sensitiveEndpoint.method === method) {
                    return true;
                }
            }
        }

        return false;
    } catch (error) {
        logger.warn('failed to check mfa requirement', { error });
        return false;
    }
}
