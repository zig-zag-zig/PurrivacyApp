import { assertRtdbKey, decodeRtdbKeySegment } from '../../../infrastructure/firebase/rtdbKeys.js';
import {
  isCurrentAssignment,
  readUserDevicePushTokenEntries,
  removeUserPushDeviceIndexIfMatches,
} from './pushTokens/pushTokenAssignments';

export const getPushTokensFromDb = async (
  userId: string,
  options: { excludeDeviceId?: string } = {},
): Promise<string[]> => {
  assertRtdbKey('userId', userId);

  const entries = await readUserDevicePushTokenEntries(userId);
  const pushTokens: string[] = [];
  const excludedDeviceId = options.excludeDeviceId?.trim() || null;

  for (const { encodedDeviceId, encodedPushToken } of entries) {
    const deviceId = decodeRtdbKeySegment(encodedDeviceId);
    const pushToken = decodeRtdbKeySegment(encodedPushToken);
    if (!deviceId || !pushToken || !await isCurrentAssignment(userId, encodedDeviceId, encodedPushToken)) {
      await removeUserPushDeviceIndexIfMatches(userId, encodedDeviceId, encodedPushToken);
      continue;
    }

    if (excludedDeviceId && deviceId === excludedDeviceId) {
      continue;
    }

    pushTokens.push(pushToken);
  }

  return Array.from(new Set(pushTokens));
};

