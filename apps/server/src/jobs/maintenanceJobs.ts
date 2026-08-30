import { cleanupExpiredMfaSetups } from '../features/mfa/application/expiredMfaSetupCleanup';
import { cleanupExpiredSessionRecords } from '../features/session/application/expiredSessionCleanup';
import { createLogger } from '../utils/logger';

const logger = createLogger('jobs.maintenance');

const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;

let maintenanceInterval: NodeJS.Timeout | null = null;

/** Names of maintenance jobs whose previous run has not finished yet. */
const inFlight = new Set<string>();

const runMaintenanceJob = async (name: string, job: () => Promise<number>): Promise<void> => {
    if (inFlight.has(name)) {
        logger.warn('maintenance job skipped: previous run still in progress', { job: name });
        return;
    }

    inFlight.add(name);
    const startedAt = Date.now();
    try {
        const count = await job();
        logger.info('maintenance job completed', {
            job: name,
            count,
            durationMs: Date.now() - startedAt,
        });
    } catch (error) {
        logger.error('maintenance job failed', {
            job: name,
            error,
            durationMs: Date.now() - startedAt,
        });
    } finally {
        inFlight.delete(name);
    }
};

const runMaintenance = (): void => {
    void runMaintenanceJob('expiredSessionRecords', cleanupExpiredSessionRecords);
    void runMaintenanceJob('expiredMfaSetups', cleanupExpiredMfaSetups);
};

export const startMaintenanceJobs = (): void => {
    if (maintenanceInterval) {
        return;
    }

    // Run once immediately so a restart does not leave expired records for
    // another full interval. Errors are logged by runMaintenanceJob.
    runMaintenance();

    maintenanceInterval = setInterval(runMaintenance, MAINTENANCE_INTERVAL_MS);
    logger.info('maintenance jobs started');
};

export const stopMaintenanceJobs = (): void => {
    if (maintenanceInterval) {
        clearInterval(maintenanceInterval);
        maintenanceInterval = null;
        logger.info('maintenance jobs stopped');
    }
};
