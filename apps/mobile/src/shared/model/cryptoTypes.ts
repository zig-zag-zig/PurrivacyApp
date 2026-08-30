export type { EncryptedPayload } from '@purrivacy/shared';

export type EncryptionBase = EncryptedPayload;

export interface Encryption extends EncryptionBase {
    salt: string;
}

export interface PublicAndPrivateKey {
    publicKey: string;
    privateKey: string;
}

export interface PrivateKeyAndPassphrase {
    privateKey: string;
    passphrase: string;
}

export interface DecryptionResult {
    decrypted: string;
    verified?: boolean;
}
