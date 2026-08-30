import { SessionResponse } from '../../../core/types';
import { AppError, TransitionError } from '../../../utils/errors';
import { createLogger } from '../../../utils/logger';
import { executeTransition, TransitionStep } from '../../../core/transitions/transitionRunner';
import { MfaTransitionStore } from './mfaTransitionStore';
import { verifyMfaCode } from './verifyMfaCode';
import { verifyAndEnableMfa } from './enableMfa';
import { disableMfa } from './disableMfa';
import { UserService } from '../../user/application/UserService';
import { createBackendSession } from '../../session/application/createSession';
import { revokeSessionFamily, setSessionFamilyMfaTrust } from '../../session/application/sessionFamilyMutations';
import { SessionRevocationService } from '../../session/application/SessionRevocationService';
import { CreateSessionOptions } from '../../session/application/sessionTypes';

const logger = createLogger('features.mfa.session');

const ENABLE_TRANSITION_PREFIX = 'mfa-enable:';
const DISABLE_TRANSITION_PREFIX = 'mfa-disable:';

interface MfaTransitionConfig {
    transitionKey: string;
    transitionLabel: string;
    userId: string;
    sessionOptions: CreateSessionOptions;
    /**
     * Apply the MFA state change (idempotent or guarded against re-run).
     * Receives whether the attempt is resuming persisted progress.
     */
    applyMfaState: (context: { isResume: boolean }) => Promise<void>;
}

/**
 * Service for MFA-related session operations.
 *
 * MFA enable/disable are multi-step state transitions (API-SEC-008). Each
 * transition is executed by {@link runTransition} with the following
 * invariants:
 *
 * - The post-transition session is created FIRST, so a failure in any later
 *   step can never leave the user without a working session.
 * - The MFA state change runs second; if it fails, the freshly created
 *   session (which claims the post-transition MFA state) is revoked as
 *   compensation and the caller sees the original error.
 * - Old sessions are revoked LAST, excluding the new session family.
 * - Progress is persisted (encrypted, TTL-bounded) between attempts, so a
 *   client retry resumes instead of re-running completed steps or creating
 *   duplicate sessions.
 */
export class MfaSessionService {
    /**
     * Enable MFA and create a new session for the post-transition state.
     *
     * State machine:
     *   1. createSession    — new family with userHasMfa=true.
     *                         Failure: nothing changed; no compensation.
     *   2. enableMfa        — verify the TOTP code and commit MFA enablement.
     *                         Failure: new family revoked (compensation);
     *                         MFA stays disabled; old sessions remain valid;
     *                         the original error is rethrown. If this is a
     *                         resumed attempt and MFA already committed, the
     *                         code is verified against the current MFA secret
     *                         instead (setup document already consumed).
     *   3. revokeOldSessions — revoke all previous families (excluding the
     *                         new one). Failure: MFA is enabled and the new
     *                         session works; a retryable TransitionError is
     *                         thrown and a retry resumes from this step,
     *                         returning the same stored session.
     */
    static async enableMfaAndCreateSession(
        userId: string,
        mfaCode: string,
        mfaTrusted: boolean = false,
        currentDeviceId?: string,
    ): Promise<SessionResponse> {
        return MfaSessionService.runTransition({
            transitionKey: `${ENABLE_TRANSITION_PREFIX}${userId}`,
            transitionLabel: 'enable',
            userId,
            sessionOptions: {
                userHasMfa: true,
                mfaTrusted,
                deviceId: currentDeviceId,
            },
            applyMfaState: async ({ isResume }) => {
                const { mfaEnabled } = await UserService.getUserMfaState(userId);
                if (isResume && mfaEnabled) {
                    // Resumed attempt whose enable committed before the
                    // process died: prove current MFA possession instead of
                    // re-running setup-based verification (the setup
                    // document is already consumed). Fresh attempts never
                    // take this path — setupMfa rejects enabled accounts,
                    // so a fresh double-enable keeps failing with the
                    // original setup error.
                    await verifyMfaCode(userId, true, mfaCode);
                    return;
                }
                await verifyAndEnableMfa(userId, mfaCode, currentDeviceId);
            },
        });
    }

    /**
     * Disable MFA and create a new session for the post-transition state.
     *
     * State machine:
     *   1. createSession    — new family with userHasMfa=false.
     *                         Failure: nothing changed; no compensation.
     *   2. disableMfa       — commit MFA disablement (idempotent; safe to
     *                         re-run on resume). Failure: new family revoked
     *                         (compensation); the original error is rethrown.
     *   3. revokeOldSessions — revoke all previous families (excluding the
     *                         new one). Failure: MFA is disabled and the new
     *                         session works; a retryable TransitionError is
     *                         thrown and a retry resumes from this step,
     *                         returning the same stored session.
     */
    static async disableMfaAndCreateSession(
        userId: string,
        currentDeviceId?: string,
    ): Promise<SessionResponse> {
        return MfaSessionService.runTransition({
            transitionKey: `${DISABLE_TRANSITION_PREFIX}${userId}`,
            transitionLabel: 'disable',
            userId,
            sessionOptions: {
                userHasMfa: false,
                mfaTrusted: false,
                deviceId: currentDeviceId,
            },
            applyMfaState: async () => {
                await disableMfa(userId, currentDeviceId);
            },
        });
    }

    /**
     * Manage MFA trust for the current refresh-token family.
     */
    static async manageSessionTrust(
        userId: string,
        sessionFamilyId: string,
        mfaTrusted: boolean
    ): Promise<{ mfaTrusted: boolean }> {
        return setSessionFamilyMfaTrust(sessionFamilyId, userId, mfaTrusted);
    }

    private static async runTransition(config: MfaTransitionConfig): Promise<SessionResponse> {
        const { transitionKey, transitionLabel, userId, sessionOptions, applyMfaState } = config;
        const store = new MfaTransitionStore(transitionKey, userId);

        const progress = await store.read();
        const isResume = progress !== null;
        let sessionResponse = progress?.steps?.createSession?.result as SessionResponse | undefined;

        const steps: TransitionStep[] = [
            {
                name: 'createSession',
                run: async () => {
                    // sweepStaleFamilies: false — this step runs BEFORE the
                    // MFA code is verified. Sweeping the user's current
                    // family here would leave them sessionless after a wrong
                    // code (the new family gets revoked by compensation and
                    // the old one is gone). revokeOldSessions cleans up old
                    // families on success.
                    const response = await createBackendSession(userId, {
                        ...sessionOptions,
                        sweepStaleFamilies: false,
                    });
                    sessionResponse = response;
                    return response;
                },
            },
            {
                name: `applyMfa${transitionLabel}`,
                run: () => applyMfaState({ isResume }),
            },
            {
                name: 'revokeOldSessions',
                run: async () => {
                    if (!sessionResponse?.sessionFamilyId) {
                        throw new Error(`MFA ${transitionLabel} transition: created session is missing sessionFamilyId`);
                    }
                    await SessionRevocationService.revokeAllUserSessions(userId, false, {
                        excludeFamilyId: sessionResponse.sessionFamilyId,
                    });
                },
            },
        ];

        const execution = await executeTransition(steps, { store });

        if (execution.status === 'completed') {
            if (!sessionResponse) {
                throw new TransitionError(`MFA ${transitionLabel} transition completed without a session`, {
                    transition: transitionKey,
                    completedSteps: execution.completedSteps,
                });
            }
            return sessionResponse;
        }

        const failedStep = execution.failedStep!;
        const originalError = execution.error;

        // Compensation applies only when the MFA state change itself failed:
        // the created session claims the post-transition state that never
        // materialized. A revokeOldSessions failure must NOT revoke the new
        // session — it is the safe state and the transition is retryable.
        if (failedStep === `applyMfa${transitionLabel}` && sessionResponse?.sessionFamilyId) {
            // Compensation: the new session claims the post-transition MFA
            // state that never materialized. Revoke it so no orphan session
            // remains, and clear the progress so a retry starts fresh.
            try {
                await revokeSessionFamily(sessionResponse.sessionFamilyId, userId);
                await store.clear();
            } catch (compensationError) {
                logger.error('mfa transition compensation revocation failed', {
                    userId,
                    transition: transitionKey,
                    failedStep,
                    compensationError,
                });
            }
        }

        if (failedStep === 'revokeOldSessions') {
            // The MFA state and the new session are consistent; only the
            // old-session cleanup failed. The transition is retryable: the
            // progress store lets a retry skip the completed steps and
            // deliver the same session.
            throw new TransitionError(
                `MFA ${transitionLabel} completed, but old session revocation failed. Retry the request to finish.`,
                {
                    transition: transitionKey,
                    failedStep,
                    completedSteps: execution.completedSteps,
                    retryable: true,
                },
            );
        }

        if (originalError instanceof AppError) {
            throw originalError;
        }

        throw new TransitionError(`MFA ${transitionLabel} transition failed`, {
            transition: transitionKey,
            failedStep,
            completedSteps: execution.completedSteps,
            retryable: true,
        });
    }
}
