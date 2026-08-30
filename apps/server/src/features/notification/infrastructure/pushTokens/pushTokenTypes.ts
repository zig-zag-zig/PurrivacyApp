export type PushTokenAssignment = {
  userId: string;
  deviceId: string;
};

export type DevicePushTokenAssignment = {
  userId: string;
  pushToken: string;
};

export type UserDevicePushTokenEntry = {
  encodedDeviceId: string;
  encodedPushToken: string;
};

