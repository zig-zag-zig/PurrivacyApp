import * as Crypto from 'expo-crypto';

import {
    PASSPHRASE_GENERATOR_DEFAULT_LENGTH,
    PASSPHRASE_MAX_LENGTH,
    PASSPHRASE_MIN_LENGTH,
} from '../../../config/inputLimits';
import { PASSPHRASE_GENERATOR_SETTINGS_KEY } from '../domain/secureStorageUtils';
import { getNonSensitiveValue, setNonSensitiveValue } from './biometricSecureStorage';

export type PassphraseGeneratorSettings = {
    length: number;
    includeNumbers: boolean;
    includeSymbols: boolean;
    includeUppercase: boolean;
};

export const DEFAULT_PASSPHRASE_GENERATOR_SETTINGS: PassphraseGeneratorSettings = {
    length: PASSPHRASE_GENERATOR_DEFAULT_LENGTH,
    includeNumbers: true,
    includeSymbols: true,
    includeUppercase: true,
};

const LOWERCASE_CHARS = 'abcdefghijkmnopqrstuvwxyz';
const UPPERCASE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const NUMBER_CHARS = '23456789';
const SYMBOL_CHARS = '!@#$%^&*()-_=+[]{};:,.?';

const clampLength = (length: number): number => (
    Math.min(PASSPHRASE_MAX_LENGTH, Math.max(PASSPHRASE_MIN_LENGTH, Math.round(length)))
);

export function normalizePassphraseGeneratorSettings(
    settings: Partial<PassphraseGeneratorSettings> | null | undefined,
): PassphraseGeneratorSettings {
    return {
        ...DEFAULT_PASSPHRASE_GENERATOR_SETTINGS,
        ...settings,
        length: clampLength(settings?.length ?? DEFAULT_PASSPHRASE_GENERATOR_SETTINGS.length),
        includeNumbers: settings?.includeNumbers ?? DEFAULT_PASSPHRASE_GENERATOR_SETTINGS.includeNumbers,
        includeSymbols: settings?.includeSymbols ?? DEFAULT_PASSPHRASE_GENERATOR_SETTINGS.includeSymbols,
        includeUppercase: settings?.includeUppercase ?? DEFAULT_PASSPHRASE_GENERATOR_SETTINGS.includeUppercase,
    };
}

export async function getPassphraseGeneratorSettings(): Promise<PassphraseGeneratorSettings> {
    const raw = await getNonSensitiveValue(PASSPHRASE_GENERATOR_SETTINGS_KEY);
    if (!raw) return DEFAULT_PASSPHRASE_GENERATOR_SETTINGS;

    try {
        return normalizePassphraseGeneratorSettings(JSON.parse(raw));
    } catch {
        return DEFAULT_PASSPHRASE_GENERATOR_SETTINGS;
    }
}

export async function setPassphraseGeneratorSettings(
    settings: PassphraseGeneratorSettings,
): Promise<PassphraseGeneratorSettings> {
    const normalized = normalizePassphraseGeneratorSettings(settings);
    await setNonSensitiveValue(PASSPHRASE_GENERATOR_SETTINGS_KEY, JSON.stringify(normalized));
    return normalized;
}

const pickChar = (chars: string, byte: number): string => chars[byte % chars.length];

export async function generatePassphrase(
    settings: PassphraseGeneratorSettings,
): Promise<string> {
    const normalized = normalizePassphraseGeneratorSettings(settings);
    const requiredPools = [
        LOWERCASE_CHARS,
        normalized.includeUppercase ? UPPERCASE_CHARS : '',
        normalized.includeNumbers ? NUMBER_CHARS : '',
        normalized.includeSymbols ? SYMBOL_CHARS : '',
    ].filter(Boolean);
    const allChars = requiredPools.join('');
    const bytes = await Crypto.getRandomBytesAsync(normalized.length * 2 + requiredPools.length);
    const chars: string[] = [];
    let byteIndex = 0;

    for (const pool of requiredPools) {
        chars.push(pickChar(pool, bytes[byteIndex] ?? 0));
        byteIndex += 1;
    }

    while (chars.length < normalized.length) {
        chars.push(pickChar(allChars, bytes[byteIndex] ?? 0));
        byteIndex += 1;
    }

    for (let i = chars.length - 1; i > 0; i -= 1) {
        const swapIndex = (bytes[byteIndex] ?? 0) % (i + 1);
        byteIndex += 1;
        [chars[i], chars[swapIndex]] = [chars[swapIndex], chars[i]];
    }

    return chars.join('');
}
