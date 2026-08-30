import { createLogger } from '../../../utils/logger';
import { deletePagedQueryResults } from '../../../infrastructure/firebase/chunkedWrites';
import { sessionCollections } from './sessionCollections';

const logger = createLogger('features.session.cleanup');

/**
 * Delete all expired session records (sessions, refresh tokens, refresh
 * token families). Expired records are swept in bounded, chunked pages; if
 * more records exist than the per-run page budget, the remainder is left for
 * the next maintenance run (the loop is resumable because it re-queries
 * until empty).
 */
export const cleanupExpiredSessionRecords = async (): Promise<number> => {
    try {
        const now = new Date();
        const queries = [
            sessionCollections.sessions.where('expiresAt', '<', now),
            sessionCollections.refreshTokens.where('expiresAt', '<', now),
            sessionCollections.refreshTokenFamilies.where('expiresAt', '<', now),
        ];

        let count = 0;
        let truncated = false;

        for (const query of queries) {
            const result = await deletePagedQueryResults(query);
            count += result.deletedCount;
            truncated = truncated || result.truncated;
        }

        logger.info('expired session records cleaned up', { count, truncated });
        return count;
    } catch (error) {
        logger.error('failed to clean up expired session records', { error });
        throw error;
    }
};
