import { captureError, flushErrorMonitoring } from './infrastructure/monitoring/sentry';
import app from './app';
import { closeRateLimitStore } from './api/rate-limit/rateLimitStoreFactory';
import { env } from './config/env';
import { startMaintenanceJobs, stopMaintenanceJobs } from './jobs/maintenanceJobs';
import { createLogger } from './utils/logger';

const logger = createLogger('server');

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10_000;

const server = app.listen(env.port, () => {
    logger.info('server started', { port: env.port, nodeEnv: env.nodeEnv });
});

startMaintenanceJobs();

let shuttingDown = false;

const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    logger.info('graceful shutdown initiated', { signal });

    stopMaintenanceJobs();

    const forceExitTimer = setTimeout(() => {
        logger.error('graceful shutdown timed out; forcing exit', { signal });
        void flushErrorMonitoring().finally(() => process.exit(1));
    }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    server.close((closeError) => {
        if (closeError) {
            logger.error('error while closing http server', { error: closeError, signal });
        }

        void (async () => {
            try {
                await closeRateLimitStore();
            } catch (error) {
                logger.error('failed to close rate limit store', { error, signal });
            }
            await flushErrorMonitoring();
            logger.info('graceful shutdown complete', { signal });
            process.exit(0);
        })();
    });
    server.closeIdleConnections();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
    logger.error('unhandled promise rejection', { reason });
    captureError(reason, { source: 'unhandledRejection' });
});

process.on('uncaughtException', (error) => {
    logger.error('uncaught exception', { message: error.message, stack: error.stack });
    captureError(error, { source: 'uncaughtException' });
    void flushErrorMonitoring().finally(() => {
        process.exit(1);
    });
});
