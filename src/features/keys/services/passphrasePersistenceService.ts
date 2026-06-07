import { securityService } from '../../security/services/securityService';
import { PgpKeyService } from './pgpKeyService';

type PersistKeyPassphraseParams = {
    ensureConsent?: () => Promise<boolean>;
    fingerprint: string;
    force?: boolean;
    passphrase: string;
    userId: string;
};

export async function persistKeyPassphrase({
    ensureConsent,
    fingerprint,
    force,
    passphrase,
    userId,
}: PersistKeyPassphraseParams): Promise<boolean> {
    if (!userId || !fingerprint) return false;
    if (passphrase && ensureConsent && !await ensureConsent()) return false;

    await PgpKeyService.storeSyncedPassphrase(userId, fingerprint, passphrase);
    await securityService.storePassphrase(
        userId,
        { [fingerprint]: passphrase },
        fingerprint,
        force === undefined ? undefined : { force },
    );

    return true;
}
