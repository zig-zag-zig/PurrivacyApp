import {
  DevicePushTokenAssignment,
  PushTokenAssignment,
} from './pushTokenTypes';
import {
  getDevicePushTokenAssignmentRef,
  getPushTokenAssignmentRef,
  getUserPushDeviceRef,
} from './pushTokenRefs';
import {
  isDevicePushTokenAssignment,
  isPushTokenAssignment,
} from './pushTokenAssignmentGuards';

const pushTokenAssignmentMatches = (
  assignment: unknown,
  expected: PushTokenAssignment,
): boolean => (
  isPushTokenAssignment(assignment)
  && assignment.userId === expected.userId
  && assignment.deviceId === expected.deviceId
);

const devicePushTokenAssignmentMatches = (
  assignment: unknown,
  expected: DevicePushTokenAssignment,
): boolean => (
  isDevicePushTokenAssignment(assignment)
  && assignment.userId === expected.userId
  && assignment.pushToken === expected.pushToken
);

export const removePushTokenAssignmentIfMatches = async (
  encodedPushToken: string,
  expected: PushTokenAssignment,
): Promise<void> => {
  await getPushTokenAssignmentRef(encodedPushToken).transaction((current: unknown) => (
    pushTokenAssignmentMatches(current, expected) ? null : current
  ));
};

export const removeDevicePushTokenAssignmentIfMatches = async (
  encodedDeviceId: string,
  expected: DevicePushTokenAssignment,
): Promise<void> => {
  await getDevicePushTokenAssignmentRef(encodedDeviceId).transaction((current: unknown) => (
    devicePushTokenAssignmentMatches(current, expected) ? null : current
  ));
};

export const removeUserPushDeviceIndexIfMatches = async (
  userId: string,
  encodedDeviceId: string,
  encodedPushToken: string,
): Promise<void> => {
  await getUserPushDeviceRef(userId, encodedDeviceId).transaction((current: unknown) => (
    current === encodedPushToken ? null : current
  ));
};

