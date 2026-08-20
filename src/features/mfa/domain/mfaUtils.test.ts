import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/modalHandler', () => ({
    getMfaModalHandler: vi.fn(),
}));
vi.mock('../../../services/eventService', () => ({
    EventService: { addEvent: vi.fn() },
}));
vi.mock('../../security/services/securityService', () => ({
    securityService: { storeSession: vi.fn(async () => {}) },
}));
vi.mock('../../auth/domain/authUtils', () => ({
    getUserId: () => 'user',
}));

import { getMfaModalHandler } from '../../../api/modalHandler';
import { EventService } from '../../../services/eventService';
import { MfaUtils } from './mfaUtils';

const modalHandlerMock = vi.mocked(getMfaModalHandler);
const addEventMock = vi.mocked(EventService.addEvent);

describe('MfaUtils.executeMfaFlow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('resubmits the SAME code once when the backend transition is retryable', async () => {
        const code = '123456';
        modalHandlerMock.mockReturnValueOnce(async () => ({ code }) as never);

        const onMfaCode = vi
            .fn()
            .mockRejectedValueOnce({ errorData: { retryable: true }, status: 500 })
            .mockResolvedValueOnce({ ok: true });

        const result = await MfaUtils.executeMfaFlow({
            isSensitive: true,
            isLoginFlow: false,
            onMfaCode,
        });

        expect(result).toEqual({ ok: true });
        expect(onMfaCode).toHaveBeenCalledTimes(2);
        expect(onMfaCode.mock.calls[0][0]).toBe(code);
        expect(onMfaCode.mock.calls[1][0]).toBe(code);
        // The modal is only closed after the successful (retried) submission
        expect(addEventMock).toHaveBeenCalledWith('closeMfaModal');
    });

    it('resubmits once when the first submission timed out client-side', async () => {
        const code = '654321';
        modalHandlerMock.mockReturnValueOnce(async () => ({ code }) as never);

        const onMfaCode = vi
            .fn()
            .mockRejectedValueOnce({ mfaTimedOut: true })
            .mockResolvedValueOnce({ ok: true });

        const result = await MfaUtils.executeMfaFlow({
            isSensitive: true,
            isLoginFlow: true,
            onMfaCode,
        });

        expect(result).toEqual({ ok: true });
        expect(onMfaCode).toHaveBeenCalledTimes(2);
        // Login flow: no closeMfaModal event (the auth flow owns the modal)
        expect(addEventMock).not.toHaveBeenCalledWith('closeMfaModal');
    });

    it('does NOT retry wrong codes — clears the modal input and loops for re-entry', async () => {
        // getMfaModalHandler() is called once; the returned handler is invoked
        // on every loop iteration and must yield a FRESH code each time (like
        // the real modal, which resolves with what the user just typed).
        modalHandlerMock.mockReturnValueOnce(
            vi.fn()
                .mockResolvedValueOnce({ code: '111111' } as never)
                .mockResolvedValueOnce({ code: '222222' } as never),
        );

        const onMfaCode = vi
            .fn()
            .mockRejectedValueOnce({ wrongMfaCode: true, status: 403 })
            .mockResolvedValueOnce({ ok: true });

        const result = await MfaUtils.executeMfaFlow({
            isSensitive: true,
            isLoginFlow: false,
            onMfaCode,
        });

        expect(result).toEqual({ ok: true });
        expect(onMfaCode).toHaveBeenCalledTimes(2);
        expect(onMfaCode.mock.calls[0][0]).toBe('111111');
        expect(onMfaCode.mock.calls[1][0]).toBe('222222');
        expect(addEventMock).toHaveBeenCalledWith('clearMfaCode', { isWrongMfaCode: true });
    });

    it('gives up after the single retry — propagates the retryable error', async () => {
        modalHandlerMock.mockReturnValueOnce(async () => ({ code: '123456' }) as never);

        const retryableError = { errorData: { retryable: true }, status: 500 };
        const onMfaCode = vi.fn().mockRejectedValue(retryableError);

        await expect(MfaUtils.executeMfaFlow({
            isSensitive: true,
            isLoginFlow: false,
            onMfaCode,
        })).rejects.toBe(retryableError);

        expect(onMfaCode).toHaveBeenCalledTimes(2);
        // The modal is force-closed after the final failure
        expect(addEventMock).toHaveBeenCalledWith('closeMfaModal', { force: true });
    });
});
