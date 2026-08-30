import { isPlainObject } from '../../../../infrastructure/firebase/utils.js';
import {
  DevicePushTokenAssignment,
  PushTokenAssignment,
} from './pushTokenTypes';

export const isPushTokenAssignment = (value: unknown): value is PushTokenAssignment => (
  isPlainObject(value)
  && typeof value.userId === 'string'
  && value.userId.trim().length > 0
  && typeof value.deviceId === 'string'
  && value.deviceId.trim().length > 0
);

export const isDevicePushTokenAssignment = (value: unknown): value is DevicePushTokenAssignment => (
  isPlainObject(value)
  && typeof value.userId === 'string'
  && value.userId.trim().length > 0
  && typeof value.pushToken === 'string'
  && value.pushToken.trim().length > 0
);

