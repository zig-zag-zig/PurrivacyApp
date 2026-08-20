import { describe, expect, it, vi, beforeEach } from 'vitest';

// The ErrorBoundary must report the caught error (one-shot) without leaking
// props/state into the report. We drive the lifecycle methods directly instead
// of rendering React.

vi.mock('react-native', () => ({
    View: () => null,
    StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock('expo-updates', () => ({ reloadAsync: vi.fn() }));

const captureAppError = vi.fn();
const loggerError = vi.fn();

vi.mock('../services/monitoring/sentry', () => ({
    captureAppError: (...args: unknown[]) => captureAppError(...args),
}));
vi.mock('../utils/logger', () => ({
    logger: { error: (...args: unknown[]) => loggerError(...args) },
}));

import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary error reporting (APP-QUALITY-001)', () => {
    beforeEach(() => {
        captureAppError.mockClear();
        loggerError.mockClear();
    });

    it('reports the error with the component stack exactly once', () => {
        const boundary = new ErrorBoundary({ children: null });
        const error = new Error('boom');
        const componentStack = '\n    at SeedVerification\n    at SignupSeedVerificationScreen\n';

        boundary.componentDidCatch(error, { componentStack });

        expect(captureAppError).toHaveBeenCalledTimes(1);
        expect(captureAppError).toHaveBeenCalledWith(error, {
            source: 'ErrorBoundary',
            componentStack,
        });
        expect(loggerError).toHaveBeenCalledTimes(1);

        // Second catch on the same boundary instance must not double-report.
        boundary.componentDidCatch(new Error('second'), { componentStack: null });
        expect(captureAppError).toHaveBeenCalledTimes(1);
        expect(loggerError).toHaveBeenCalledTimes(1);
    });

    it('tolerates a missing component stack', () => {
        const boundary = new ErrorBoundary({ children: null });

        boundary.componentDidCatch(new Error('boom'), { componentStack: undefined });

        expect(captureAppError).toHaveBeenCalledWith(expect.any(Error), {
            source: 'ErrorBoundary',
            componentStack: null,
        });
    });

    it('does not include props or state in the report', () => {
        const boundary = new ErrorBoundary({ children: null });

        boundary.componentDidCatch(new Error('boom'), { componentStack: 'at X' });

        const context = captureAppError.mock.calls[0][1] as Record<string, unknown>;
        expect(Object.keys(context).sort()).toEqual(['componentStack', 'source']);
    });
});
