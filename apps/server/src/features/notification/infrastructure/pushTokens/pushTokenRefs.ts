import { rtdb } from '../../../../infrastructure/firebase/index.js';
import { assertRtdbKey } from '../../../../infrastructure/firebase/rtdbKeys.js';

export const PUSH_TOKENS_ROOT = 'pushTokens';
export const DEVICE_PUSH_TOKENS_ROOT = 'devicePushTokens';
export const USER_PUSH_DEVICES_ROOT = 'userPushDevices';

const assertEncodedPushToken = (encodedPushToken: string): void => {
  assertRtdbKey('encodedPushToken', encodedPushToken);
};

export const assertEncodedDeviceId = (encodedDeviceId: string): void => {
  assertRtdbKey('encodedDeviceId', encodedDeviceId);
};

export const getPushTokenAssignmentRef = (encodedPushToken: string) => {
  assertEncodedPushToken(encodedPushToken);
  return rtdb.ref(`${PUSH_TOKENS_ROOT}/${encodedPushToken}`);
};

export const getDevicePushTokenAssignmentRef = (encodedDeviceId: string) => {
  assertEncodedDeviceId(encodedDeviceId);
  return rtdb.ref(`${DEVICE_PUSH_TOKENS_ROOT}/${encodedDeviceId}`);
};

export const getUserPushDevicesRef = (userId: string) => {
  assertRtdbKey('userId', userId);
  return rtdb.ref(`${USER_PUSH_DEVICES_ROOT}/${userId}`);
};

export const getUserPushDeviceRef = (userId: string, encodedDeviceId: string) => {
  assertRtdbKey('userId', userId);
  assertEncodedDeviceId(encodedDeviceId);
  return rtdb.ref(`${USER_PUSH_DEVICES_ROOT}/${userId}/${encodedDeviceId}`);
};
