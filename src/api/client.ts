import {
    UserEncrypted,
    UserCreatePayload,
    Encryption,
    EncryptedKeyRecordWithId,
    MfaSetupResponse,
    RecoveryCodeRegenerateResponse,
    RecoveryCodeRemainingResponse,
    SessionResponse,
    MfaState,
    RecoveryChallengeResponse,
    RecoveryTokenResponse,
    UserKeyRecordsResponse,
} from '../types/types';
import { getUserId } from '../features/auth/domain/authUtils';
import { createApiRequester } from './core/apiRequestFactory';
import { createRecoveryApi } from './auth/recoveryApi';
import { createMfaApi } from './mfa/mfaApi';
import { createUserApi } from './user/userApi';
import { SessionManager } from './session/sessionManager';

export class ApiClient {
    static async storeSessionResponse(response: SessionResponse, userId: string): Promise<void> {
        await getSm().storeSessionResponse(response, userId);
    }

    static clearInMemoryAccessToken(): void {
        getSm().clearInMemoryAccessToken();
    }

    static async syncRemoteMfaState(mfaState: MfaState): Promise<void> {
        await getSm().syncRemoteMfaState(mfaState);
    }

    static async create(user: UserCreatePayload) {
        return getUa().create(user);
    }

    static async getKeyRecords(): Promise<UserKeyRecordsResponse> {
        return getUa().getKeyRecords();
    }

    static async addKeyRecord(key: Omit<EncryptedKeyRecordWithId, 'recordId'>): Promise<EncryptedKeyRecordWithId> {
        return getUa().addKeyRecord(key);
    }

    static async updateKeyRecord(
        recordId: string,
        key: Omit<EncryptedKeyRecordWithId, 'recordId'>,
    ): Promise<EncryptedKeyRecordWithId> {
        return getUa().updateKeyRecord(recordId, key);
    }

    static async deleteKeyRecord(recordId: string): Promise<void> {
        await getUa().deleteKeyRecord(recordId);
    }

    static async changeDekPassword(dekPassword: Encryption) {
        return getUa().changeDekPassword(dekPassword);
    }

    static async getRecoveryChallenge(username: string): Promise<RecoveryChallengeResponse> {
        return getRa().getRecoveryChallenge(username);
    }

    static async createRecoveryToken(username: string, recoveryVerifier: string): Promise<RecoveryTokenResponse> {
        return getRa().createRecoveryToken(username, recoveryVerifier);
    }

    static async get(): Promise<UserEncrypted | null> {
        return getUa().get();
    }

    static async delete() {
        return getUa().deleteUser();
    }

    static async savePushToken(pushToken: string) {
        await getUa().savePushToken(pushToken);
    }

    static async deletePushToken(pushToken: string) {
        await getUa().deletePushToken(pushToken);
    }

    static async setupMfa(): Promise<MfaSetupResponse> {
        return getMa().setupMfa();
    }

    static async enableMfa(): Promise<SessionResponse> {
        return getMa().enableMfa();
    }

    static async disableMfa(): Promise<SessionResponse> {
        return getMa().disableMfa();
    }

    static async trustSession(
        mfaTrusted: boolean,
    ): Promise<{ mfaTrusted: boolean }> {
        return getMa().trustSession(mfaTrusted);
    }

    static async regenerateRecoveryCodes(): Promise<RecoveryCodeRegenerateResponse> {
        return getMa().regenerateRecoveryCodes();
    }

    static async getRemainingRecoveryCodes(): Promise<RecoveryCodeRemainingResponse> {
        return getMa().getRemainingRecoveryCodes();
    }

    static async createSession(
        retryOnFailure: boolean,
        mfaCode?: string,
        forceNewSession = false
    ): Promise<SessionResponse> {
        return getSm().createSession(retryOnFailure, mfaCode, forceNewSession);
    }

    static async revokeAllSessions(): Promise<void> {
        return getSm().revokeAllSessions();
    }

    static async signOut(): Promise<void> {
        return getSm().signOut();
    }
}

// Lazy-initialized singletons — not created at import time so they can be
// overridden in tests via the test-only setter functions.

type SessionManagerSingleton = SessionManager;
type UserApiSingleton = ReturnType<typeof createUserApi>;
type RecoveryApiSingleton = ReturnType<typeof createRecoveryApi>;
type MfaApiSingleton = ReturnType<typeof createMfaApi>;

let _sessionManager: SessionManagerSingleton | null = null;
let _request: ReturnType<typeof createApiRequester> | null = null;
let _userApi: UserApiSingleton | null = null;
let _recoveryApi: RecoveryApiSingleton | null = null;
let _mfaApi: MfaApiSingleton | null = null;

const ensureInitialized = (): void => {
    if (_request) return;

    const request = createApiRequester((retryOnFailure, mfaCode, forceNewSession) =>
        _sessionManager!.createSession(retryOnFailure, mfaCode, forceNewSession),
    );
    const sm = new SessionManager(request);
    const ua = createUserApi(request);
    const ra = createRecoveryApi(request);
    const ma = createMfaApi(request, async (response) => {
        await sm.storeSessionResponse(response, getUserId());
    });

    _sessionManager = sm;
    _request = request;
    _userApi = ua;
    _recoveryApi = ra;
    _mfaApi = ma;
};

function getSm(): SessionManagerSingleton { ensureInitialized(); return _sessionManager!; }
function getUa(): UserApiSingleton { ensureInitialized(); return _userApi!; }
function getRa(): RecoveryApiSingleton { ensureInitialized(); return _recoveryApi!; }
function getMa(): MfaApiSingleton { ensureInitialized(); return _mfaApi!; }

/** Reset all singletons — intended for testing only. */
export const __testResetApiClient = (): void => {
    _sessionManager = null;
    _request = null;
    _userApi = null;
    _recoveryApi = null;
    _mfaApi = null;
};

/** Override the session manager — intended for testing only. */
export const __testSetSessionManager = (mock: SessionManager): void => {
    _sessionManager = mock;
    _request ??= (() => { }) as unknown as ReturnType<typeof createApiRequester>;
};

/** Override the user API — intended for testing only. */
export const __testSetUserApi = (mock: UserApiSingleton): void => {
    _userApi = mock;
    _request ??= (() => { }) as unknown as ReturnType<typeof createApiRequester>;
};

/** Override the recovery API — intended for testing only. */
export const __testSetRecoveryApi = (mock: RecoveryApiSingleton): void => {
    _recoveryApi = mock;
    _request ??= (() => { }) as unknown as ReturnType<typeof createApiRequester>;
};

/** Override the MFA API — intended for testing only. */
export const __testSetMfaApi = (mock: MfaApiSingleton): void => {
    _mfaApi = mock;
    _request ??= (() => { }) as unknown as ReturnType<typeof createApiRequester>;
};
