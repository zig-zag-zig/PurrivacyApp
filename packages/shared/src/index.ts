export interface EncryptedPayload {
    encryptedData: string;
    iv: string;
    tag: string;
}

export interface SaltedEncryptedPayload extends EncryptedPayload {
    salt: string;
}
