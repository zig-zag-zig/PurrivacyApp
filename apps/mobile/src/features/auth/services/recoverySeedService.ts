import * as Crypto from 'expo-crypto';
import { generateMnemonic } from 'bip39';

import { AUTH_SALT_LENGTH, deriveKey, randomHex } from './authCrypto';

export function generateSeed(): string {
  return generateMnemonic(256);
}

export function normalizeSeedPhrase(seedPhrase: string): string {
  return seedPhrase.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getThreeUniqueRandomIndices(seed: string): number[] {
  const words = seed.split(' ');
  if (words.length < 3) {
    throw new Error('Seed must have at least 3 words');
  }

  const unique = new Set<number>();
  while (unique.size < 3) {
    unique.add(Math.floor(Math.random() * words.length) + 1);
  }

  return Array.from(unique);
}

export function verifySeed(
  seed: string,
  answers: Record<number, string>,
  positions: number[],
): boolean {
  const words = seed.split(' ');
  return positions.every(pos => answers[pos]?.trim() === words[pos - 1]);
}

export async function deriveRecoveryVerifier(
  seedPhrase: string,
  recoveryVerifierSalt: string,
): Promise<string> {
  return deriveKey(normalizeSeedPhrase(seedPhrase), recoveryVerifierSalt);
}

export async function generateRecoveryVerifier(
  seedPhrase: string,
): Promise<{ recoveryVerifierSalt: string; recoveryVerifierHash: string }> {
  const recoveryVerifierSalt = await randomHex(AUTH_SALT_LENGTH);
  const recoveryVerifier = await deriveRecoveryVerifier(seedPhrase, recoveryVerifierSalt);
  const recoveryVerifierHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    recoveryVerifier.toLowerCase(),
  );

  return { recoveryVerifierSalt, recoveryVerifierHash };
}
