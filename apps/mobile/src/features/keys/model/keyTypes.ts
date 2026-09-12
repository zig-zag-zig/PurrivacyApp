export interface KeyPair extends KeyMetadata, KeyPairBase { }

export type KeyPairWithRecordId = KeyPair & {
    recordId: string;
};

export interface KeyPairBase {
    privateKey: string | null;
    publicKey: string;
    isDefault: boolean;
    privateKeyPassphrase?: string | null;
    /** Standalone armored revocation certificate for this key, if generated/imported. */
    revocationCertificate?: string | null;
    /**
     * True once the user has compared this public key's fingerprint against a
     * trusted source (the contact's own out-of-band channel). It's a device
     * claim stored on the record, not derivable from the armor, so it travels
     * with the encrypted payload like revocationCertificate.
     */
    verified?: boolean;
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
    /** True when the key's primary is revoked (self-signature revocation). */
    revoked?: boolean;
}
