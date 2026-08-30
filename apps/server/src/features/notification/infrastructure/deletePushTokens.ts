import { assertRtdbKey, decodeRtdbKeySegment, encodeRtdbKeySegment } from '../../../infrastructure/firebase/rtdbKeys.js';
import {
  getDevicePushTokenAssignment,
  getPushTokenAssignment,
  readUserDevicePushTokenEntries,
  removeDevicePushTokenAssignmentIfMatches,
  removePushTokenAssignmentIfMatches,
  removeUserPushDeviceIndexIfMatches,
} from './pushTokens/pushTokenAssignments';
import { requireDeviceId, normalizePushTokens } from './pushTokens/pushTokenNormalization';
import { getUserPushDeviceRef, getUserPushDevicesRef } from './pushTokens/pushTokenRefs';

const deleteDevicePushTokenFromDb = async (
  userId: string,
  deviceId: string,
): Promise<void> => {
  assertRtdbKey('userId', userId);

  const normalizedDeviceId = requireDeviceId(deviceId);
  const encodedDeviceId = encodeRtdbKeySegment(normalizedDeviceId);
  const deviceAssignment = await getDevicePushTokenAssignment(encodedDeviceId);
  const userDeviceSnapshot = await getUserPushDeviceRef(userId, encodedDeviceId).get();
  const indexedPushToken = typeof userDeviceSnapshot.val() === 'string'
    ? userDeviceSnapshot.val()
    : undefined;
  const encodedPushToken = deviceAssignment?.userId === userId
    ? deviceAssignment.pushToken
    : indexedPushToken;

  if (!encodedPushToken) {
    return;
  }

  if (!decodeRtdbKeySegment(encodedPushToken)) {
    await removeUserPushDeviceIndexIfMatches(userId, encodedDeviceId, encodedPushToken);
    return;
  }

  await Promise.all([
    removePushTokenAssignmentIfMatches(encodedPushToken, {
      userId,
      deviceId: normalizedDeviceId,
    }),
    removeDevicePushTokenAssignmentIfMatches(encodedDeviceId, {
      userId,
      pushToken: encodedPushToken,
    }),
    removeUserPushDeviceIndexIfMatches(userId, encodedDeviceId, encodedPushToken),
  ]);
};

export const deletePushTokensFromDb = async (
  userId: string,
  pushTokens: string[],
): Promise<void> => {
  assertRtdbKey('userId', userId);

  const normalizedPushTokens = normalizePushTokens(pushTokens);
  if (normalizedPushTokens.length === 0) {
    return;
  }

  await Promise.all(
    normalizedPushTokens.map(async (pushToken) => {
      const encodedPushToken = encodeRtdbKeySegment(pushToken);
      const pushTokenAssignment = await getPushTokenAssignment(encodedPushToken);
      if (pushTokenAssignment?.userId !== userId) {
        return;
      }

      const encodedDeviceId = encodeRtdbKeySegment(pushTokenAssignment.deviceId);
      await Promise.all([
        removePushTokenAssignmentIfMatches(encodedPushToken, pushTokenAssignment),
        removeDevicePushTokenAssignmentIfMatches(encodedDeviceId, {
          userId,
          pushToken: encodedPushToken,
        }),
        removeUserPushDeviceIndexIfMatches(userId, encodedDeviceId, encodedPushToken),
      ]);
    }),
  );
};

export const deleteUserPushTokensFromDb = async (userId: string): Promise<void> => {
  assertRtdbKey('userId', userId);

  const entries = await readUserDevicePushTokenEntries(userId);
  await Promise.all(
    entries.map(async ({ encodedDeviceId }) => {
      const deviceId = decodeRtdbKeySegment(encodedDeviceId);
      if (deviceId) {
        await deleteDevicePushTokenFromDb(userId, deviceId);
      }
    }),
  );

  await getUserPushDevicesRef(userId).remove();
};
