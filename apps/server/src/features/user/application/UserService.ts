import {
    EncryptedPayload,
    KeyRecordListOptions,
    User,
    UserEncryptedData,
    UserEncryptedKeyRecordsResponse,
} from '../../../core/types';
import {
    changeDekPassword,
    createUser,
    deleteUser,
    queueUserMfaEnabledUpdate,
    setPassphraseStorage,
} from './userWrites';
import { deleteUserPushToken, saveUserPushToken } from './userPushTokens';
import { getEncryptedUser, getUser, getUserMfaState } from './userReads';
import {
    addUserEncryptedKeyRecord,
    deleteUserEncryptedKeyRecord,
    readUserEncryptedKeyRecordSet,
    updateUserEncryptedKeyRecord,
} from '../infrastructure/UserKeyRepository';

const flattenKeyRecord = (
    record: { recordId: string; key: EncryptedPayload },
): EncryptedPayload & { recordId: string } => ({
    recordId: record.recordId,
    ...record.key,
});

/**
 * Public facade for user feature use cases.
 */
export class UserService {
    static async getUser(userId: string): Promise<User> {
        return getUser(userId);
    }

    static async getUserMfaState(userId: string): Promise<{ mfaEnabled: boolean }> {
        return getUserMfaState(userId);
    }

    static async getEncryptedUser(userId: string): Promise<UserEncryptedData> {
        return getEncryptedUser(userId);
    }

    static async createUser(user: unknown, userId: string): Promise<{ success: boolean }> {
        return createUser(user, userId);
    }

    static async changeDekPassword(
        userId: string,
        value: unknown,
    ): Promise<{ success: boolean }> {
        return changeDekPassword(userId, value);
    }

    static queueMfaEnabledUpdate(
        batch: FirebaseFirestore.WriteBatch,
        userId: string,
        mfaEnabled: boolean,
    ): void {
        queueUserMfaEnabledUpdate(batch, userId, mfaEnabled);
    }

    static async deleteUser(userId: string): Promise<void> {
        await deleteUser(userId);
    }

    static async savePushToken(
        userId: string,
        deviceId: string,
        pushToken: string,
    ): Promise<void> {
        await saveUserPushToken(userId, deviceId, pushToken);
    }

    static async deletePushToken(
        userId: string,
        pushToken: string,
    ): Promise<void> {
        await deleteUserPushToken(userId, pushToken);
    }

    static async getEncryptedKeyRecords(
        userId: string,
        options: KeyRecordListOptions = {},
    ): Promise<UserEncryptedKeyRecordsResponse> {
        const recordSet = await readUserEncryptedKeyRecordSet(userId, options);
        return {
            keys: recordSet.keys.map(flattenKeyRecord),
            nextCursor: recordSet.nextCursor,
        };
    }

    static async addEncryptedKeyRecord(
        userId: string,
        key: EncryptedPayload,
    ): Promise<EncryptedPayload & { recordId: string }> {
        return flattenKeyRecord(await addUserEncryptedKeyRecord(userId, key));
    }

    static async updateEncryptedKeyRecord(
        userId: string,
        recordId: string,
        key: EncryptedPayload,
    ): Promise<EncryptedPayload & { recordId: string }> {
        return flattenKeyRecord(await updateUserEncryptedKeyRecord(userId, recordId, key));
    }

    static async deleteEncryptedKeyRecord(
        userId: string,
        recordId: string,
    ): Promise<void> {
        await deleteUserEncryptedKeyRecord(userId, recordId);
    }

    static async setPassphraseStorage(
        userId: string,
        enabled: boolean,
        deviceId?: string,
    ): Promise<void> {
        await setPassphraseStorage(userId, enabled, deviceId);
    }

}
