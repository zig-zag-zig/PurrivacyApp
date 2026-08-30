import { decodeRtdbKeySegment } from '../../../../infrastructure/firebase/rtdbKeys.js';
import { isPlainObject } from '../../../../infrastructure/firebase/utils.js';
import {
  DevicePushTokenAssignment,
  PushTokenAssignment,
  UserDevicePushTokenEntry,
} from './pushTokenTypes';
import {
  assertEncodedDeviceId,
  getDevicePushTokenAssignmentRef,
  getPushTokenAssignmentRef,
  getUserPushDevicesRef,
} from './pushTokenRefs';
import {
  isDevicePushTokenAssignment,
  isPushTokenAssignment,
} from './pushTokenAssignmentGuards';

export const getPushTokenAssignment = async (
  encodedPushToken: string,
): Promise<PushTokenAssignment | null> => {
  const snapshot = await getPushTokenAssignmentRef(encodedPushToken).get();
  const assignment = snapshot.val();
  return isPushTokenAssignment(assignment) ? assignment : null;
};

export const getDevicePushTokenAssignment = async (
  encodedDeviceId: string,
): Promise<DevicePushTokenAssignment | null> => {
  const snapshot = await getDevicePushTokenAssignmentRef(encodedDeviceId).get();
  const assignment = snapshot.val();
  return isDevicePushTokenAssignment(assignment) ? assignment : null;
};

export const readUserDevicePushTokenEntries = async (
  userId: string,
): Promise<UserDevicePushTokenEntry[]> => {
  const snapshot = await getUserPushDevicesRef(userId).get();
  const value = snapshot.val();
  if (!isPlainObject(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([encodedDeviceId, encodedPushToken]) => {
    assertEncodedDeviceId(encodedDeviceId);
    if (typeof encodedPushToken !== 'string') {
      return [];
    }

    return [{ encodedDeviceId, encodedPushToken }];
  });
};

export const isCurrentAssignment = async (
  userId: string,
  encodedDeviceId: string,
  encodedPushToken: string,
): Promise<boolean> => {
  const deviceId = decodeRtdbKeySegment(encodedDeviceId);
  if (!deviceId) {
    return false;
  }

  const [pushTokenAssignment, deviceAssignment] = await Promise.all([
    getPushTokenAssignment(encodedPushToken),
    getDevicePushTokenAssignment(encodedDeviceId),
  ]);

  return pushTokenAssignment?.userId === userId
    && pushTokenAssignment.deviceId === deviceId
    && deviceAssignment?.userId === userId
    && deviceAssignment.pushToken === encodedPushToken;
};

