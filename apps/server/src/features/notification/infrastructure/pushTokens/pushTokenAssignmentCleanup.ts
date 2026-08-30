import { decodeRtdbKeySegment, encodeRtdbKeySegment } from '../../../../infrastructure/firebase/rtdbKeys.js';
import {
  DevicePushTokenAssignment,
  PushTokenAssignment,
} from './pushTokenTypes';
import {
  removeDevicePushTokenAssignmentIfMatches,
  removePushTokenAssignmentIfMatches,
  removeUserPushDeviceIndexIfMatches,
} from './pushTokenAssignmentRemovals';

export const cleanupPreviousDeviceAssignment = async (
  encodedDeviceId: string,
  previousDeviceAssignment: DevicePushTokenAssignment | null,
  nextUserId: string,
  nextEncodedPushToken: string,
): Promise<void> => {
  if (!previousDeviceAssignment) {
    return;
  }

  if (previousDeviceAssignment.pushToken !== nextEncodedPushToken) {
    const previousDeviceId = decodeRtdbKeySegment(encodedDeviceId);
    if (previousDeviceId && decodeRtdbKeySegment(previousDeviceAssignment.pushToken)) {
      await removePushTokenAssignmentIfMatches(previousDeviceAssignment.pushToken, {
        userId: previousDeviceAssignment.userId,
        deviceId: previousDeviceId,
      });
    }
  }

  if (previousDeviceAssignment.userId !== nextUserId) {
    await removeUserPushDeviceIndexIfMatches(
      previousDeviceAssignment.userId,
      encodedDeviceId,
      previousDeviceAssignment.pushToken,
    );
  }
};

export const cleanupPreviousTokenAssignment = async (
  encodedPushToken: string,
  previousTokenAssignment: PushTokenAssignment | null,
  nextUserId: string,
  nextDeviceId: string,
): Promise<void> => {
  if (!previousTokenAssignment) {
    return;
  }

  if (previousTokenAssignment.userId === nextUserId && previousTokenAssignment.deviceId === nextDeviceId) {
    return;
  }

  const previousEncodedDeviceId = encodeRtdbKeySegment(previousTokenAssignment.deviceId);
  await Promise.all([
    removeDevicePushTokenAssignmentIfMatches(previousEncodedDeviceId, {
      userId: previousTokenAssignment.userId,
      pushToken: encodedPushToken,
    }),
    removeUserPushDeviceIndexIfMatches(
      previousTokenAssignment.userId,
      previousEncodedDeviceId,
      encodedPushToken,
    ),
  ]);
};

