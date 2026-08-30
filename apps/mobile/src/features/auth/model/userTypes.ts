import type { Encryption, EncryptionBase } from '../../../shared/model/cryptoTypes';
import type { KeyPairWithRecordId } from '../../keys/model/keyTypes';

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
    passphraseStorageEnabled?: boolean;
}

export interface LastSignedInUser {
    uid: string;
    username: string | null;
}
