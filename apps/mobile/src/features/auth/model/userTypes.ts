import type { Encryption, EncryptionBase } from '../../../shared/model/cryptoTypes';
import type { KeyPairWithRecordId } from '../../keys/model/keyTypes';
import type { SecureNote } from '../../notes/model/noteTypes';

interface UserBase {
    dekPassword: Encryption;
    dekSeed: Encryption;
}

export interface UserEncrypted extends UserBase {
    keys: EncryptionBase[];
    passphraseStorageEnabled?: boolean;
}

export type EncryptedKeyRecordWithId = EncryptionBase & {
    recordId: string;
};

export interface UserKeyRecordsResponse {
    keys: EncryptedKeyRecordWithId[];
    /** Opaque cursor for the next page; absent when there are no more. */
    nextCursor?: string;
}

export interface RecoveryEncrypted {
    dekSeed: Encryption;
}

export interface UserCreatePayload extends UserEncrypted {
    recoveryVerifierSalt: string;
    recoveryVerifierHash: string;
}

export interface UserDecrypted extends UserBase {
    keys: KeyPairWithRecordId[];
    /**
     * Secure notes decrypted in the same pass as `keys` — note records share
     * the key-records store, so getUserDecrypted already pays the decrypt cost;
     * piggybacking avoids a second fetch/decrypt sweep.
     */
    notes: SecureNote[];
    passphraseStorageEnabled?: boolean;
}

export interface LastSignedInUser {
    uid: string;
    username: string | null;
}
