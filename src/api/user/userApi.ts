import type {
  EncryptedKeyRecordWithId,
  Encryption,
  EncryptionBase,
  UserCreatePayload,
  UserEncrypted,
  UserKeyRecordsResponse,
} from '../../types/types';
import type { ApiRequestFn } from '../core/apiRequestFactory';
import { getUser } from '../../features/auth/domain/authUtils';
import { ApiRequestError } from '../apiError';
import { buildApiUrl } from '../core/buildApiUrl';

async function parseJsonResponse(response: Response): Promise<Record<string, any>> {
  const responseText = await response.text().catch(() => '');
  if (!responseText) {
    return {};
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return {
      error: response.ok
        ? responseText
        : responseText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
          || `Request failed with status ${response.status}`,
    };
  }
}

async function createUserWithFirebaseAuth(user: UserCreatePayload): Promise<any> {
  const currentUser = getUser();
  const token = await currentUser?.getIdToken(true);
  if (!token) {
    throw new ApiRequestError('User is not authenticated', 401, { bearerHeaderMissing: true });
  }

  let response: Response;
  try {
    response = await fetch(buildApiUrl('/user'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userData: user }),
    });
  } catch {
    throw new ApiRequestError('Could not reach the server. Check your connection and try again.', 0, {
      networkUnavailable: true,
    });
  }

  const data = await parseJsonResponse(response);
  const requestId = response.headers.get('x-request-id');
  if (requestId) {
    data.requestId = data.requestId || requestId;
  }

  if (!response.ok) {
    throw new ApiRequestError(data.error || `Request failed with status ${response.status}`, response.status, data);
  }

  return data;
}

export function createUserApi(request: ApiRequestFn) {
  return {
    create(user: UserCreatePayload) {
      return createUserWithFirebaseAuth(user);
    },

    getKeyRecords(): Promise<UserKeyRecordsResponse> {
      return request('/user/key-records', 'GET', undefined, true);
    },

    addKeyRecord(key: EncryptionBase): Promise<EncryptedKeyRecordWithId> {
      return request('/user/key-records', 'POST', { key }, true);
    },

    updateKeyRecord(recordId: string, key: EncryptionBase): Promise<EncryptedKeyRecordWithId> {
      return request(`/user/key-records/${encodeURIComponent(recordId)}`, 'PUT', { key }, true);
    },

    async deleteKeyRecord(recordId: string): Promise<void> {
      await request(`/user/key-records/${encodeURIComponent(recordId)}`, 'DELETE', undefined, true);
    },

    changeDekPassword(dekPassword: Encryption) {
      return request('/user/change-password', 'POST', { dekPassword }, true);
    },

    async get(): Promise<UserEncrypted | null> {
      try {
        return await request('/user', 'GET', undefined, true);
      } catch (error) {
        if ((error as any)?.status === 404) {
          return null;
        }
        throw error;
      }
    },

    deleteUser() {
      return request('/user', 'DELETE', undefined, true);
    },

    async savePushToken(pushToken: string): Promise<void> {
      await request('/user/save-push-token', 'POST', { pushToken }, true, { includeDeviceId: true });
    },

    async deletePushToken(pushToken: string): Promise<void> {
      await request('/user/delete-push-token', 'POST', { pushToken }, true, { useSessionAuth: false });
    },
  };
}
