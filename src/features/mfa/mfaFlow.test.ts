import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const securityServiceMock = vi.hoisted(() => ({
    storeSession: vi.fn(),
}));

vi.mock('../security/services/securityService', () => ({
    securityService: securityServiceMock,
}));

vi.mock('../auth/domain/authUtils', () => ({
    getUserId: vi.fn(() => 'user-123'),
}));

import { setMfaModalHandler } from '../../api/modalHandler';
import { MfaUtils } from './domain/mfaUtils';
import { EventService } from '../../services/eventService';

const clearPendingEvents = () => {
    EventService.getPendingEvents().forEach((_payload, eventName) => {
        EventService.consumeEvent(eventName);
    });
};

beforeEach(() => {
    clearPendingEvents();
    setMfaModalHandler(null);
    vi.clearAllMocks();
});

afterEach(() => {
    clearPendingEvents();
    setMfaModalHandler(null);
});

describe('MFA retry flow', () => {
    it('keeps login MFA open until the authenticated UI handoff', async () => {
        const events: Array<{ name: string; payload: unknown; }> = [];
        const unsubscribe = EventService.addListener((name, payload) => {
            events.push({ name, payload });
        });
        const modalHandler = vi.fn().mockResolvedValueOnce({ code: '123456' });
        const onMfaCode = vi.fn(async (code: string) => `accepted:${code}`);

        setMfaModalHandler(modalHandler);

        try {
            await expect(MfaUtils.executeMfaFlow({
                isSensitive: false,
                isLoginFlow: true,
                onMfaCode,
            })).resolves.toBe('accepted:123456');
        } finally {
            unsubscribe();
        }

        expect(modalHandler).toHaveBeenCalledTimes(1);
        expect(onMfaCode).toHaveBeenCalledWith('123456');
        expect(events).not.toContainEqual({
            name: 'closeMfaModal',
            payload: undefined,
        });
    });

    it('closes non-login MFA after a successful submission', async () => {
        const events: Array<{ name: string; payload: unknown; }> = [];
        const unsubscribe = EventService.addListener((name, payload) => {
            events.push({ name, payload });
        });
        const modalHandler = vi.fn().mockResolvedValueOnce({ code: '123456' });

        setMfaModalHandler(modalHandler);

        try {
            await MfaUtils.executeMfaFlow({
                isSensitive: true,
                isLoginFlow: false,
                onMfaCode: async code => `accepted:${code}`,
            });
        } finally {
            unsubscribe();
        }

        expect(events).toContainEqual({
            name: 'closeMfaModal',
            payload: undefined,
        });
    });

    it('clears the modal loading state before retrying after a wrong code', async () => {
        const events: Array<{ name: string; payload: unknown; }> = [];
        const unsubscribe = EventService.addListener((name, payload) => {
            events.push({ name, payload });
        });
        const modalHandler = vi.fn()
            .mockResolvedValueOnce({ code: '111111' })
            .mockResolvedValueOnce({ code: '222222' });
        const onMfaCode = vi.fn(async (code: string) => {
            if (code === '111111') {
                throw { wrongMfaCode: true };
            }
            return `accepted:${code}`;
        });

        setMfaModalHandler(modalHandler);

        try {
            await expect(MfaUtils.executeMfaFlow({
                isSensitive: false,
                isLoginFlow: true,
                onMfaCode,
            })).resolves.toBe('accepted:222222');
        } finally {
            unsubscribe();
        }

        expect(modalHandler).toHaveBeenCalledTimes(2);
        expect(onMfaCode).toHaveBeenCalledWith('111111');
        expect(onMfaCode).toHaveBeenCalledWith('222222');
        expect(events).toContainEqual({
            name: 'clearMfaCode',
            payload: { isWrongMfaCode: true },
        });
        expect(events).not.toContainEqual({
            name: 'closeMfaModal',
            payload: { force: true },
        });
    });

    it('passes allowRecoveryCode through to the modal handler', async () => {
        const modalHandler = vi.fn().mockResolvedValueOnce({ code: '123456' });
        setMfaModalHandler(modalHandler);

        await MfaUtils.executeMfaFlow({
            isSensitive: true,
            isLoginFlow: false,
            allowRecoveryCode: false,
            onMfaCode: async () => 'ok',
        });

        expect(modalHandler).toHaveBeenCalledWith({
            isSensitive: true,
            isLoginFlow: false,
            allowRecoveryCode: false,
        });
    });

    it('omits allowRecoveryCode when not provided (default behaviour preserved)', async () => {
        const modalHandler = vi.fn().mockResolvedValueOnce({ code: '123456' });
        setMfaModalHandler(modalHandler);

        await MfaUtils.executeMfaFlow({
            isSensitive: false,
            isLoginFlow: true,
            onMfaCode: async () => 'ok',
        });

        expect(modalHandler).toHaveBeenCalledWith({
            isSensitive: false,
            isLoginFlow: true,
        });
    });

    it('keeps a sensitive-flow modal open on a 400 code rejection and surfaces the server message', async () => {
        const events: Array<{ name: string; payload: unknown; }> = [];
        const unsubscribe = EventService.addListener((name, payload) => {
            events.push({ name, payload });
        });
        // Recovery code entered in the TOTP-only MFA-enable verification:
        // the server rejects it with a 400 format error, not a wrong-code
        // flag. The modal must stay open so the user can retry with TOTP.
        const modalHandler = vi.fn()
            .mockResolvedValueOnce({ code: 'ABCDEF123456' })
            .mockResolvedValueOnce({ code: '123456' });
        const onMfaCode = vi.fn(async (code: string) => {
            if (code === 'ABCDEF123456') {
                throw {
                    status: 400,
                    message: 'Invalid code format. Please use a 6-digit TOTP code from your authenticator app. Recovery codes cannot be used to enable MFA.',
                };
            }
            return `accepted:${code}`;
        });

        setMfaModalHandler(modalHandler);

        try {
            await expect(MfaUtils.executeMfaFlow({
                isSensitive: true,
                isLoginFlow: false,
                onMfaCode,
            })).resolves.toBe('accepted:123456');
        } finally {
            unsubscribe();
        }

        expect(modalHandler).toHaveBeenCalledTimes(2);
        expect(onMfaCode).toHaveBeenCalledWith('ABCDEF123456');
        expect(onMfaCode).toHaveBeenCalledWith('123456');
        expect(events).toContainEqual({
            name: 'clearMfaCode',
            payload: {
                isWrongMfaCode: true,
                message: 'Invalid code format. Please use a 6-digit TOTP code from your authenticator app. Recovery codes cannot be used to enable MFA.',
            },
        });
        expect(events).not.toContainEqual({
            name: 'closeMfaModal',
            payload: { force: true },
        });
    });
});
