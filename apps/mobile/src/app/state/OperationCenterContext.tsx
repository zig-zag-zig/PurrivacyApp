import React, {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useReducer,
    useRef,
} from 'react';
import { AppState } from 'react-native';

import {
    countRunning,
    countUnseenFinished,
    latestByKind,
    newOperationId,
    prunedOperationCenterReducer,
    initialOperationCenterState,
    type OperationKind,
    type OperationRecord,
} from './operationCenterState';
import { logger } from '../../utils/logger';

/**
 * App-wide registry for long-running operations (file encrypt/decrypt, key
 * generation, …). The provider owns each operation's async work, so it
 * continues regardless of navigation and its outcome stays visible and
 * restorable:
 *
 *  - Screens call `beginOperation` instead of owning the busy/result state
 *    for long ops. The `run` callback receives an api to report phase and
 *    progress and to settle the record; it must not reference component
 *    state or setters (the closure outlives the screen).
 *  - `useLatestOperation(kind)` lets a screen restore a result after
 *    remount (e.g. returning to the Encrypt tab).
 *  - A compact status surface (rendered by `OperationCenterUI`) keeps
 *    pending/finished operations visible from anywhere — no blocking
 *    full-screen spinner for these ops.
 *  - AppState changes never cancel work: JS keeps running while the process
 *    is alive; finishing in the background posts a best-effort local
 *    notification. If the OS kills the process, the registry dies with it —
 *    surfaced honestly as "nothing running" on next launch rather than a
 *    fake resume.
 */

export interface OperationRunApi {
    /** Update the current phase label (e.g. "Streaming ciphertext"). */
    setPhase: (phase: string) => void;
    /** Report progress units (bytes for file ops). */
    setProgress: (done: number, total?: number) => void;
    /** Mark the operation successful and attach a restorable payload. */
    succeed: (result?: Record<string, unknown>, resultSummary?: string) => void;
}

export interface BeginOperationInput<T = void> {
    kind: OperationKind;
    title: string;
    detail?: string;
    /**
     * The operation itself. Resolving normally (after calling
     * `api.succeed`) records success; throwing records failure and
     * rethrows so the caller keeps its existing error handling. The
     * resolved value is returned by `beginOperation` to the caller.
     */
    run: (api: OperationRunApi) => Promise<T>;
}

interface OperationCenterContextValue {
    operations: OperationRecord[];
    runningCount: number;
    unseenFinishedCount: number;
    beginOperation: <T>(input: BeginOperationInput<T>) => Promise<T>;
    markSeen: (id: string) => void;
    dismiss: (id: string) => void;
    clearFinished: () => void;
}

const OperationCenterContext = createContext<OperationCenterContextValue | null>(null);

const OP_NOTIFICATION_ID_PREFIX = 'purrivacy-op-';

/** Best-effort local notification when an operation finishes in background. */
const notifyFinishedInBackground = async (record: OperationRecord): Promise<void> => {
    try {
        // Imported lazily so the notification module (and its native/expo
        // runtime requirements) is not pulled into every importer of the
        // operation center — e.g. unit tests that only exercise the reducer.
        const Notifications = await import('expo-notifications');
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') return;
        await Notifications.scheduleNotificationAsync({
            content: {
                title: record.title,
                body: record.status === 'succeeded'
                    ? `Finished — ${record.resultSummary ?? 'done'}`
                    : `Failed — ${record.error ?? 'error'}`,
            },
            trigger: null, // fire immediately
            identifier: `${OP_NOTIFICATION_ID_PREFIX}${record.id}`,
        });
    } catch (error) {
        logger.warn('operation notification failed', { error });
    }
};

export const OperationCenterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(prunedOperationCenterReducer, initialOperationCenterState);
    const appStateRef = useRef(AppState.currentState);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            appStateRef.current = nextAppState;
        });
        return () => subscription.remove();
    }, []);

    const beginOperation = useCallback(async <T,>(input: BeginOperationInput<T>): Promise<T> => {
        const id = newOperationId(input.kind);
        const record: OperationRecord = {
            id,
            kind: input.kind,
            title: input.title,
            detail: input.detail,
            startedAt: Date.now(),
            status: 'running',
        };
        dispatch({ type: 'started', record });

        let settled = false;
        let successSummary: string | undefined;
        const patch = (p: Partial<OperationRecord>) => dispatch({ type: 'updated', id, patch: p });
        const api: OperationRunApi = {
            setPhase: phase => patch({ phase }),
            setProgress: (done, total) => patch({ progress: { done, total } }),
            succeed: (result, resultSummary) => {
                settled = true;
                successSummary = resultSummary;
                patch({
                    status: 'succeeded',
                    finishedAt: Date.now(),
                    result,
                    resultSummary,
                    phase: undefined,
                });
            },
        };

        try {
            const value = await input.run(api);
            if (!settled) {
                // Run resolved without an explicit succeed — record success
                // anyway so the registry never shows a phantom running op.
                patch({ status: 'succeeded', finishedAt: Date.now(), phase: undefined });
            }
            if (appStateRef.current.match(/inactive|background/)) {
                void notifyFinishedInBackground({
                    ...record,
                    status: 'succeeded',
                    resultSummary: successSummary,
                });
            }
            return value;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            patch({ status: 'failed', finishedAt: Date.now(), phase: undefined, error: message });
            if (appStateRef.current.match(/inactive|background/)) {
                void notifyFinishedInBackground({
                    ...record,
                    status: 'failed',
                    error: message,
                });
            }
            throw error;
        }
    }, []);

    const markSeen = useCallback((id: string) => dispatch({ type: 'seen', id }), []);
    const dismiss = useCallback((id: string) => dispatch({ type: 'dismiss', id }), []);
    const clearFinished = useCallback(() => dispatch({ type: 'clearFinished' }), []);

    const value = useMemo<OperationCenterContextValue>(() => ({
        operations: state.operations,
        runningCount: countRunning(state.operations),
        unseenFinishedCount: countUnseenFinished(state.operations),
        beginOperation,
        markSeen,
        dismiss,
        clearFinished,
    }), [state.operations, beginOperation, markSeen, dismiss, clearFinished]);

    return (
        <OperationCenterContext.Provider value={value}>
            {children}
        </OperationCenterContext.Provider>
    );
};

export const useOperationCenter = (): OperationCenterContextValue => {
    const context = useContext(OperationCenterContext);
    if (!context) {
        throw new Error('useOperationCenter must be used within OperationCenterProvider');
    }
    return context;
};

/** Latest record of a kind — screens use it to restore progress/results. */
export const useLatestOperation = (kind: OperationKind): OperationRecord | undefined => {
    const { operations } = useOperationCenter();
    return latestByKind(operations, kind);
};
