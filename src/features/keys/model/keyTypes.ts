export interface KeyPair extends KeyMetadata, KeyPairBase { }

export type KeyPairWithRecordId = KeyPair & {
    recordId: string;
};

export interface KeyPairBase {
    privateKey: string | null;
    publicKey: string;
    isDefault: boolean;
    privateKeyPassphrase?: string | null;
}

export type PgpAlgorithm = 'RSA' | 'ECDSA' | 'EDDSA';

export interface KeyGenerationOptions {
    algorithm: PgpAlgorithm;
    bitStrength: 2048 | 3072 | 4096;
    name: string;
    email: string;
    comment: string;
    passphrase: string;
    days?: number;
}

export interface KeyMetadata {
    fingerprint: string;
    algorithm: string;
    bitStrength?: number;
    curve?: string;
    expiry: string;
    userId: string;
    privateKeyIsUnlocked?: boolean;
}
