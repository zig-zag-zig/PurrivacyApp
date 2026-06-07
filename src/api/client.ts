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
        await sessionManager.storeSessionResponse(response, userId);
    }

    static clearInMemoryAccessToken(): void {
        sessionManager.clearInMemoryAccessToken();
    }

    static async syncRemoteMfaState(mfaState: MfaState): Promise<void> {
        await sessionManager.syncRemoteMfaState(mfaState);
    }

    static async create(user: UserCreatePayload) {
        return userApi.create(user);
    }

    static async getKeyRecords(): Promise<UserKeyRecordsResponse> {
        return userApi.getKeyRecords();
    }

    static async addKeyRecord(key: Omit<EncryptedKeyRecordWithId, 'recordId'>): Promise<EncryptedKeyRecordWithId> {
        return userApi.addKeyRecord(key);
    }

    static async updateKeyRecord(
        recordId: string,
        key: Omit<EncryptedKeyRecordWithId, 'recordId'>,
    ): Promise<EncryptedKeyRecordWithId> {
        return userApi.updateKeyRecord(recordId, key);
    }

    static async deleteKeyRecord(recordId: string): Promise<void> {
        await userApi.deleteKeyRecord(recordId);
    }

    static async changeDekPassword(dekPassword: Encryption) {
        return userApi.changeDekPassword(dekPassword);
    }

    static async getRecoveryChallenge(username: string): Promise<RecoveryChallengeResponse> {
        return recoveryApi.getRecoveryChallenge(username);
    }

    static async createRecoveryToken(username: string, recoveryVerifier: string): Promise<RecoveryTokenResponse> {
        return recoveryApi.createRecoveryToken(username, recoveryVerifier);
    }

    static async get(): Promise<UserEncrypted | null> {
        return userApi.get();
    }

    static async delete() {
        return userApi.deleteUser();
    }

    static async savePushToken(pushToken: string) {
        await userApi.savePushToken(pushToken);
    }

    static async deletePushToken(pushToken: string) {
        await userApi.deletePushToken(pushToken);
    }

    static async setupMfa(): Promise<MfaSetupResponse> {
        return mfaApi.setupMfa();
    }

    static async enableMfa(): Promise<SessionResponse> {
        return mfaApi.enableMfa();
    }

    static async disableMfa(): Promise<SessionResponse> {
        return mfaApi.disableMfa();
    }

    static async trustSession(
        mfaTrusted: boolean,
    ): Promise<{ mfaTrusted: boolean }> {
        return mfaApi.trustSession(mfaTrusted);
    }

    static async regenerateRecoveryCodes(): Promise<RecoveryCodeRegenerateResponse> {
        return mfaApi.regenerateRecoveryCodes();
    }

    static async getRemainingRecoveryCodes(): Promise<RecoveryCodeRemainingResponse> {
        return mfaApi.getRemainingRecoveryCodes();
    }

    static async createSession(
        retryOnFailure: boolean,
        mfaCode?: string,
        forceNewSession = false
    ): Promise<SessionResponse> {
        return sessionManager.createSession(retryOnFailure, mfaCode, forceNewSession);
    }

    static async revokeAllSessions(): Promise<void> {
        return sessionManager.revokeAllSessions();
    }

    static async signOut(): Promise<void> {
        return sessionManager.signOut();
    }
}

let sessionManager: SessionManager;
const request = createApiRequester((retryOnFailure, mfaCode, forceNewSession) => (
    sessionManager.createSession(retryOnFailure, mfaCode, forceNewSession)
));
sessionManager = new SessionManager(request);
const userApi = createUserApi(request);
const recoveryApi = createRecoveryApi(request);
const mfaApi = createMfaApi(request, async response => {
    await sessionManager.storeSessionResponse(response, getUserId());
});
