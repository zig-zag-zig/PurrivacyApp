import { createLogger } from '../../../utils/logger';
import { deletePagedQueryResults } from '../../../infrastructure/firebase/chunkedWrites';
import { getMfaSetupCollection, getMfaSetupNonceCollection } from './mfaRefs';

const logger = createLogger('features.mfa.cleanup');

/**
 * Delete all expired MFA setup records and setup nonces in bounded, chunked
 * pages. If more expired records exist than the per-run page budget, the
 * remainder is left for the next maintenance run (the loop is resumable
 * because it re-queries until empty).
 */
export const cleanupExpiredMfaSetups = async (): Promise<number> => {
    try {
        const [setupsResult, noncesResult] = await Promise.all([
            deletePagedQueryResults(
                getMfaSetupCollection().where('expiresAt', '<', new Date()),
            ),
            deletePagedQueryResults(
                getMfaSetupNonceCollection().where('expiresAt', '<', new Date()),
            ),
        ]);

        const count = setupsResult.deletedCount + noncesResult.deletedCount;
        logger.info('expired mfa setup records cleaned up', {
            count,
            truncated: setupsResult.truncated || noncesResult.truncated,
        });
        return count;
    } catch (error) {
        logger.error('failed to clean up expired mfa setups', { error });
        throw error;
    }
};
