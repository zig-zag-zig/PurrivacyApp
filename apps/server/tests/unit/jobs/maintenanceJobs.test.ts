jest.mock('../../../src/features/session/application/expiredSessionCleanup', () => ({
    cleanupExpiredSessionRecords: jest.fn().mockResolvedValue(0),
}));

jest.mock('../../../src/features/mfa/application/expiredMfaSetupCleanup', () => ({
    cleanupExpiredMfaSetups: jest.fn().mockResolvedValue(0),
}));

const loadJobs = (): typeof import('../../../src/jobs/maintenanceJobs') => (
    require('../../../src/jobs/maintenanceJobs')
);

const mockSessionCleanup = (): jest.Mock => (
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../../../src/features/session/application/expiredSessionCleanup').cleanupExpiredSessionRecords as jest.Mock
);

const mockMfaCleanup = (): jest.Mock => (
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../../../src/features/mfa/application/expiredMfaSetupCleanup').cleanupExpiredMfaSetups as jest.Mock
);

const HOUR_MS = 60 * 60 * 1000;

describe('maintenanceJobs', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        // Re-apply the module-default implementations after any test overrides.
        mockSessionCleanup().mockResolvedValue(0);
        mockMfaCleanup().mockResolvedValue(0);
        // Reset module state: stop any interval left by a previous test so
        // startMaintenanceJobs always performs its immediate first run.
        loadJobs().stopMaintenanceJobs();
    });

    afterEach(() => {
        loadJobs().stopMaintenanceJobs();
        jest.useRealTimers();
    });

    it('starts the maintenance interval', () => {
        const { startMaintenanceJobs } = loadJobs();
        startMaintenanceJobs();
        // verify the interval was set (1 hour in ms)
        expect(jest.getTimerCount()).toBe(1);
    });

    it('calling startMaintenanceJobs twice does not crash', () => {
        const { startMaintenanceJobs } = loadJobs();
        startMaintenanceJobs();
        expect(() => startMaintenanceJobs()).not.toThrow();
    });

    it('stopMaintenanceJobs clears the interval', () => {
        const { startMaintenanceJobs, stopMaintenanceJobs } = loadJobs();
        startMaintenanceJobs();
        stopMaintenanceJobs();
        expect(jest.getTimerCount()).toBe(0);
    });

    it('runs both jobs once immediately at startup', async () => {
        const { startMaintenanceJobs } = loadJobs();

        startMaintenanceJobs();

        // Flush the microtasks of the immediate fire-and-forget run.
        await Promise.resolve();
        await Promise.resolve();

        expect(mockSessionCleanup()).toHaveBeenCalledTimes(1);
        expect(mockMfaCleanup()).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(1);
    });

    it('does not start a job again while its previous run is still in progress', async () => {
        const { startMaintenanceJobs } = loadJobs();

        let releaseSessions!: () => void;
        const sessionsGate = new Promise<void>(resolve => { releaseSessions = resolve; });
        mockSessionCleanup().mockImplementation(() => sessionsGate.then(() => 7));
        mockMfaCleanup().mockResolvedValue(3);

        startMaintenanceJobs();

        // Let the immediate run start: sessions job is now pending on the gate,
        // mfa job resolves immediately.
        await Promise.resolve();

        expect(mockSessionCleanup()).toHaveBeenCalledTimes(1);
        expect(mockMfaCleanup()).toHaveBeenCalledTimes(1);

        // First interval tick while the sessions job is still in flight: it must
        // be skipped, while the completed mfa job runs again.
        await jest.advanceTimersByTimeAsync(HOUR_MS);
        expect(mockSessionCleanup()).toHaveBeenCalledTimes(1);
        expect(mockMfaCleanup()).toHaveBeenCalledTimes(2);

        // Release the sessions job; once it finishes, the next tick runs it again.
        releaseSessions();
        await Promise.resolve();
        await Promise.resolve();

        await jest.advanceTimersByTimeAsync(HOUR_MS);
        expect(mockSessionCleanup()).toHaveBeenCalledTimes(2);
        expect(mockMfaCleanup()).toHaveBeenCalledTimes(3);
    });
});
