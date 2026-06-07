import { describe, expect, it } from 'vitest';
import { getFirebaseAuthEmulatorUrl } from './firebaseEmulator';

describe('Firebase Auth emulator env parsing', () => {
  it('normalizes host and port values to an http origin', () => {
    expect(getFirebaseAuthEmulatorUrl('127.0.0.1:9099', 'e2e-test')).toBe('http://127.0.0.1:9099');
    expect(getFirebaseAuthEmulatorUrl('http://localhost:9099', 'development')).toBe('http://localhost:9099');
  });

  it('requires a port and keeps emulator config out of production builds', () => {
    expect(getFirebaseAuthEmulatorUrl('', 'e2e-test')).toBeNull();
    expect(() => getFirebaseAuthEmulatorUrl('127.0.0.1', 'e2e-test')).toThrow(/host and port/);
    expect(() => getFirebaseAuthEmulatorUrl('127.0.0.1:9099', 'production')).toThrow(/production/);
  });
});
