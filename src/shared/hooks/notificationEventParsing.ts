/**
 * Pure parsing/normalization helpers for remote-notification payloads.
 *
 * Notification data crosses an untrusted boundary (push payloads can be
 * forged or malformed), so every field is validated before an event is
 * emitted. Invalid payloads are dropped — no event is dispatched.
 */

import type { AppEventPayloadMap } from '../../services/eventService';
import { isRecord } from '../../shared/errors/errorGuards';

/**
 * Extracts the notification envelope. Supports both a direct payload object
 * and the legacy `dataString`/`body` JSON-string convention:
 * - `{ data: { ... } }` → the inner object
 * - `{ data: { dataString: '<json>' } }` → the parsed JSON (must be an object)
 * - `{ data: { body: '<json>' } }` → same, legacy key
 * Anything that does not resolve to an object yields `{}`.
 */
export const parseNotificationData = (data: unknown): Record<string, unknown> => {
    const outer = isRecord(data);
    const innerData = outer && isRecord(data.data) ? data.data : {};
    const payloadString =
        typeof innerData.dataString === 'string' ? innerData.dataString : innerData.body;
    if (typeof payloadString !== 'string' || payloadString.length === 0) {
        return innerData;
    }

    try {
        const parsed: unknown = JSON.parse(payloadString);
        return isRecord(parsed) ? parsed : innerData;
    } catch {
        return innerData;
    }
};

/** Guarded parser for `clearMfaCode` payloads. */
export const parseClearMfaCodePayload = (
    raw: unknown,
): AppEventPayloadMap['clearMfaCode'] => {
    if (!isRecord(raw)) {
        return undefined;
    }
    return {
        isWrongMfaCode: typeof raw.isWrongMfaCode === 'boolean' ? raw.isWrongMfaCode : undefined,
    };
};

/**
 * Guarded parser for `closeMfaModal` payloads. `delayMs` accepts numbers and
 * numeric strings (push payloads are often stringified); anything else is
 * treated as absent, matching `Number(payload?.delayMs ?? 0)` consumers.
 */
export const parseCloseMfaModalPayload = (
    raw: unknown,
): AppEventPayloadMap['closeMfaModal'] => {
    if (!isRecord(raw)) {
        return undefined;
    }
    const delayMsRaw = raw.delayMs;
    let delayMs: number | undefined;
    if (typeof delayMsRaw === 'number' && Number.isFinite(delayMsRaw)) {
        delayMs = delayMsRaw;
    } else if (typeof delayMsRaw === 'string' && delayMsRaw.trim() !== '' && Number.isFinite(Number(delayMsRaw))) {
        delayMs = Number(delayMsRaw);
    }
    return {
        delayMs,
        force: typeof raw.force === 'boolean' ? raw.force : undefined,
    };
};

/** Guarded parser for `mfaState` payloads (source always `remoteNotification`). */
export const normalizeMfaStatePayload = (
    raw: unknown,
): AppEventPayloadMap['mfaState'] | undefined => {
    const payload = isRecord(raw) ? raw : null;
    // Mirrors the historic `payload?.mfaState ?? payload` access.
    const mfaState = payload ? (payload.mfaState ?? payload) : null;
    if (!isRecord(mfaState)) {
        return undefined;
    }
    if (typeof mfaState.mfaEnabled !== 'boolean' || typeof mfaState.mfaTrusted !== 'boolean') {
        return undefined;
    }

    return {
        mfaState: {
            mfaEnabled: mfaState.mfaEnabled,
            mfaTrusted: mfaState.mfaTrusted,
        },
        source: 'remoteNotification',
    };
};

/** Guarded parser for `newRecoveryCodes` payloads. */
export const parseNewRecoveryCodesPayload = (
    raw: unknown,
): AppEventPayloadMap['newRecoveryCodes'] | undefined => {
    if (!isRecord(raw) || !Array.isArray(raw.recoveryCodes)) {
        return undefined;
    }
    if (!raw.recoveryCodes.every((code): code is string => typeof code === 'string')) {
        return undefined;
    }
    return { recoveryCodes: raw.recoveryCodes };
};

/** Guarded parser for `passphraseStorageChanged` payloads. */
export const parsePassphraseStorageChangedPayload = (
    raw: unknown,
): AppEventPayloadMap['passphraseStorageChanged'] | undefined => {
    if (!isRecord(raw) || typeof raw.enabled !== 'boolean') {
        return undefined;
    }
    return { enabled: raw.enabled };
};

/** Guarded parser for `passphraseSynced` payloads. */
export const parsePassphraseSyncedPayload = (
    raw: unknown,
): AppEventPayloadMap['passphraseSynced'] | undefined => {
    if (!isRecord(raw) || typeof raw.fingerprint !== 'string' || typeof raw.passphrase !== 'string') {
        return undefined;
    }
    return { fingerprint: raw.fingerprint, passphrase: raw.passphrase };
};

/** Guarded parser for `passphraseDeleted` payloads. */
export const parsePassphraseDeletedPayload = (
    raw: unknown,
): AppEventPayloadMap['passphraseDeleted'] | undefined => {
    if (!isRecord(raw) || typeof raw.fingerprint !== 'string') {
        return undefined;
    }
    return { fingerprint: raw.fingerprint };
};
