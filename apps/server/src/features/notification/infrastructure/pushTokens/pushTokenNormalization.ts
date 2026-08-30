import { BadRequestError } from '../../../../utils/errors';
import { MAX_PUSH_TOKEN_LENGTH } from '../../../../core/constants';

const MAX_DEVICE_ID_LENGTH = 256;

export const normalizePushToken = (pushToken: string): string | null => {
  const trimmed = pushToken.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.length > MAX_PUSH_TOKEN_LENGTH) {
    throw new BadRequestError('pushToken is too long');
  }

  return trimmed;
};

export const normalizePushTokens = (pushTokens: string[]): string[] => (
  Array.from(new Set(pushTokens.flatMap((token) => {
    const normalized = normalizePushToken(token);
    return normalized ? [normalized] : [];
  })))
);

export const requireDeviceId = (deviceId: string): string => {
  const normalized = deviceId.trim();
  if (!normalized) {
    throw new BadRequestError('deviceId is required');
  }

  if (normalized.length > MAX_DEVICE_ID_LENGTH) {
    throw new BadRequestError('deviceId is too long');
  }

  return normalized;
};
