import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const securityServiceMock = vi.hoisted(() => ({
  storeSession: vi.fn(),
}));

vi.mock('../src/features/security/services/securityService', () => ({
  securityService: securityServiceMock,
}));

vi.mock('../src/features/auth/domain/authUtils', () => ({
  getUserId: vi.fn(() => 'user-123'),
}));

import { setMfaModalHandler } from '../src/api/modalHandler';
import { MfaUtils } from '../src/features/mfa/domain/mfaUtils';
import { EventService } from '../src/services/eventService';

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
  it('closes the modal after a successful MFA submission', async () => {
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
  });
});
