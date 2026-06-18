import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLogger = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('../utils/logger', () => ({
    logger: mockLogger,
}));

import { pgpCryptoService } from '../services/pgpCryptoService';
import type { PGPExecutor } from '../services/pgpCryptoService';

beforeEach(() => {
    vi.clearAllMocks();
    pgpCryptoService.clearExecutor();
});

function createMockExecutor(): PGPExecutor {
    return {
        // Return a non-falsy value for ping so health check passes
        executePGPOperation: vi.fn(async (op: string) => {
            if (op === 'ping') return { ok: true };
            return undefined;
        }),
    };
}

describe('pgpCryptoService', () => {
    describe('setExecutor / clearExecutor', () => {
        it('sets ready state when executor is set', () => {
            const status = pgpCryptoService.getServiceStatus();
            expect(status.isReady).toBe(false);
            expect(status.hasExecutor).toBe(false);

            pgpCryptoService.setExecutor(createMockExecutor());

            const after = pgpCryptoService.getServiceStatus();
            expect(after.isReady).toBe(true);
            expect(after.hasExecutor).toBe(true);
        });

        it('clears ready state when executor is cleared', () => {
            pgpCryptoService.setExecutor(createMockExecutor());
            pgpCryptoService.clearExecutor();

            const status = pgpCryptoService.getServiceStatus();
            expect(status.isReady).toBe(false);
            expect(status.hasExecutor).toBe(false);
        });
    });

    describe('getServiceStatus', () => {
        it('reports correct status without executor', () => {
            expect(pgpCryptoService.getServiceStatus()).toEqual({
                isReady: false,
                hasExecutor: false,
                pendingCallbacks: 0,
            });
        });

        it('reports correct status with executor', () => {
            pgpCryptoService.setExecutor(createMockExecutor());

            expect(pgpCryptoService.getServiceStatus()).toMatchObject({
                isReady: true,
                hasExecutor: true,
            });
        });
    });

    describe('operation delegation', () => {
        it('generateKeyPair delegates to executor', async () => {
            const executor = createMockExecutor();
            const mockFn = executor.executePGPOperation as ReturnType<typeof vi.fn>;
            // First call is ping, second is generateKeyPair
            mockFn.mockResolvedValueOnce({ ok: true });
            mockFn.mockResolvedValueOnce({ publicKey: 'pk', privateKey: 'sk' });
            pgpCryptoService.setExecutor(executor);

            const result = await pgpCryptoService.generateKeyPair({ type: 'RSA' } as any);

            expect(mockFn).toHaveBeenCalledWith('generateKeyPair', { type: 'RSA' });
            expect(result).toEqual({ publicKey: 'pk', privateKey: 'sk' });
        });

        it('encryptMessage delegates to executor', async () => {
            const executor = createMockExecutor();
            const mockFn = executor.executePGPOperation as ReturnType<typeof vi.fn>;
            mockFn.mockResolvedValueOnce({ ok: true });
            mockFn.mockResolvedValueOnce('encrypted-armor');
            pgpCryptoService.setExecutor(executor);

            const result = await pgpCryptoService.encryptMessage(['pubkey'], 'hello');

            expect(mockFn).toHaveBeenCalledWith(
                'encryptMessage',
                { publicKeys: ['pubkey'], content: 'hello', signOptions: undefined },
            );
            expect(result).toBe('encrypted-armor');
        });

        it('decryptMessage delegates to executor', async () => {
            const executor = createMockExecutor();
            const mockFn = executor.executePGPOperation as ReturnType<typeof vi.fn>;
            mockFn.mockResolvedValueOnce({ ok: true });
            mockFn.mockResolvedValueOnce({ clearText: 'decrypted' });
            pgpCryptoService.setExecutor(executor);

            const result = await pgpCryptoService.decryptMessage(
                'encrypted-data', 'privkey', 'passphrase', 'pubkey',
            );

            expect(mockFn).toHaveBeenCalledWith('decryptMessage', {
                encryptedData: 'encrypted-data',
                privateKey: 'privkey',
                passphrase: 'passphrase',
                publicKeyForVerification: 'pubkey',
            });
            expect(result).toEqual({ clearText: 'decrypted' });
        });

        it('changePassphrase delegates to executor', async () => {
            const executor = createMockExecutor();
            const mockFn = executor.executePGPOperation as ReturnType<typeof vi.fn>;
            mockFn.mockResolvedValueOnce({ ok: true });
            mockFn.mockResolvedValueOnce('new-armored-key');
            pgpCryptoService.setExecutor(executor);

            const result = await pgpCryptoService.changePassphrase('armored', 'old', 'new');

            expect(mockFn).toHaveBeenCalledWith('changePassphrase', {
                armoredPrivateKey: 'armored', oldPassphrase: 'old', newPassphrase: 'new',
            });
            expect(result).toBe('new-armored-key');
        });

        it('extractKeyMetadata delegates to executor', async () => {
            const executor = createMockExecutor();
            const mockFn = executor.executePGPOperation as ReturnType<typeof vi.fn>;
            mockFn.mockResolvedValueOnce({ ok: true });
            mockFn.mockResolvedValueOnce({ fingerprint: 'fp' });
            pgpCryptoService.setExecutor(executor);

            const result = await pgpCryptoService.extractKeyMetadata('armored-key');

            expect(mockFn).toHaveBeenCalledWith('extractKeyMetadata', { armoredKey: 'armored-key' });
            expect(result).toEqual({ fingerprint: 'fp' });
        });

        it('changeExpiration delegates to executor', async () => {
            const executor = createMockExecutor();
            const mockFn = executor.executePGPOperation as ReturnType<typeof vi.fn>;
            mockFn.mockResolvedValueOnce({ ok: true });
            mockFn.mockResolvedValueOnce({ publicKey: 'pk', privateKey: 'sk' });
            pgpCryptoService.setExecutor(executor);

            const result = await pgpCryptoService.changeExpiration('armored', 'pass', '365');

            expect(mockFn).toHaveBeenCalledWith('changeExpiration', {
                armoredPrivateKey: 'armored', passphrase: 'pass', days: '365',
            });
            expect(result).toEqual({ publicKey: 'pk', privateKey: 'sk' });
        });

        it('createDetachedSignature delegates to executor', async () => {
            const executor = createMockExecutor();
            const mockFn = executor.executePGPOperation as ReturnType<typeof vi.fn>;
            mockFn.mockResolvedValueOnce({ ok: true });
            mockFn.mockResolvedValueOnce('signature');
            pgpCryptoService.setExecutor(executor);

            const result = await pgpCryptoService.createDetachedSignature('msg', 'privkey', 'pass');

            expect(mockFn).toHaveBeenCalledWith('createDetachedSignature', {
                message: 'msg', privateKey: 'privkey', passphrase: 'pass',
            });
            expect(result).toBe('signature');
        });

        it('verifyDetachedSignature delegates to executor', async () => {
            const executor = createMockExecutor();
            const mockFn = executor.executePGPOperation as ReturnType<typeof vi.fn>;
            mockFn.mockResolvedValueOnce({ ok: true });
            mockFn.mockResolvedValueOnce(true);
            pgpCryptoService.setExecutor(executor);

            const result = await pgpCryptoService.verifyDetachedSignature('sig', 'msg', 'pubkey');

            expect(mockFn).toHaveBeenCalledWith('verifyDetachedSignature', {
                signature: 'sig', message: 'msg', publicKey: 'pubkey',
            });
            expect(result).toBe(true);
        });
    });
});
