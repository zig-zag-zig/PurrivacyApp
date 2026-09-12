import {
    createDraftService,
    useComposeDraft,
} from '../shared/hooks/useComposeDraft';
import { logger } from '../utils/logger';

/**
 * The bound draft service: the generic draft hook backed by the AES-GCM sqlite
 * value store (key held in SecureStore).
 *
 * The store is imported lazily so importing this module does not pull the
 * expo-crypto → expo-modules-core native chain into the module graph. That
 * chain needs ExpoGlobal (absent under vitest), so an eager import makes every
 * transitively-importing test file explode at load time. Lazy import keeps the
 * dependency runtime-only: the first draft read/write resolves it.
 */

type EncryptedStore = typeof import('../features/security/services/encryptedSqliteValueStore');

let storePromise: Promise<EncryptedStore> | null = null;
const loadStore = (): Promise<EncryptedStore> => {
    if (!storePromise) {
        storePromise = import('../features/security/services/encryptedSqliteValueStore');
    }
    return storePromise;
};

const store = {
    getItem: async (key: string) => (await loadStore()).getEncryptedSqliteValue(key),
    setItem: async (key: string, value: string) => (await loadStore()).setEncryptedSqliteValue(key, value),
    removeItem: async (key: string) => (await loadStore()).deleteEncryptedSqliteValue(key),
};

export const draftService = createDraftService(store);

type EncryptedComposeDraftParams = Omit<
    Parameters<typeof useComposeDraft>[0],
    'service'
>;

/**
 * The app-facing compose-draft hook. Callers get the encrypted store injected
 * and never reference the service or the native chain directly.
 */
export const useEncryptedComposeDraft = (params: EncryptedComposeDraftParams): void =>
    useComposeDraft({ ...params, service: draftService });

// Re-exported for tests that exercise the store binding without the hook.
export const __draftsForTests = { loadStore, logger };
