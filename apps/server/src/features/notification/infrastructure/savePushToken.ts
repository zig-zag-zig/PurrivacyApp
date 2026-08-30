import { rtdb } from '../../../infrastructure/firebase/index.js';
import { assertRtdbKey, encodeRtdbKeySegment } from '../../../infrastructure/firebase/rtdbKeys.js';
import {
  cleanupPreviousDeviceAssignment,
  cleanupPreviousTokenAssignment,
  getDevicePushTokenAssignment,
  getPushTokenAssignment,
} from './pushTokens/pushTokenAssignments';
import {
  requireDeviceId,
  normalizePushToken,
} from './pushTokens/pushTokenNormalization';
import {
  DEVICE_PUSH_TOKENS_ROOT,
  PUSH_TOKENS_ROOT,
  USER_PUSH_DEVICES_ROOT,
} from './pushTokens/pushTokenRefs';
import {
  DevicePushTokenAssignment,
  PushTokenAssignment,
} from './pushTokens/pushTokenTypes';

export const savePushTokenToDb = async (
  userId: string,
  deviceId: string,
  pushToken: string,
): Promise<void> => {
  assertRtdbKey('userId', userId);

  const normalizedDeviceId = requireDeviceId(deviceId);
  const normalizedPushToken = normalizePushToken(pushToken);
  if (!normalizedPushToken) {
    return;
  }

  const encodedDeviceId = encodeRtdbKeySegment(normalizedDeviceId);
  const encodedPushToken = encodeRtdbKeySegment(normalizedPushToken);
  const [previousDeviceAssignment, previousTokenAssignment] = await Promise.all([
    getDevicePushTokenAssignment(encodedDeviceId),
    getPushTokenAssignment(encodedPushToken),
  ]);

  await rtdb.ref().update({
    [`${PUSH_TOKENS_ROOT}/${encodedPushToken}`]: {
      userId,
      deviceId: normalizedDeviceId,
    } satisfies PushTokenAssignment,
    [`${DEVICE_PUSH_TOKENS_ROOT}/${encodedDeviceId}`]: {
      userId,
      pushToken: encodedPushToken,
    } satisfies DevicePushTokenAssignment,
    [`${USER_PUSH_DEVICES_ROOT}/${userId}/${encodedDeviceId}`]: encodedPushToken,
  });

  await Promise.all([
    cleanupPreviousDeviceAssignment(
      encodedDeviceId,
      previousDeviceAssignment,
      userId,
      encodedPushToken,
    ),
    cleanupPreviousTokenAssignment(
      encodedPushToken,
      previousTokenAssignment,
      userId,
      normalizedDeviceId,
    ),
  ]);
};

