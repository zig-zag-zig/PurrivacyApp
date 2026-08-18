import type {
  EncryptedKeyRecordWithId,
  Encryption,
  EncryptionBase,
  UserCreatePayload,
  UserEncrypted,
  UserKeyRecordsResponse,
} from '../../types/types';
import type { ApiRequestFn } from '../core/apiRequestFactory';
import { getApiRuntime } from '../runtime';
import { ApiRequestError } from '../apiError';
import { buildApiUrl } from '../core/buildApiUrl';
import { isJsonObject } from '../request/errorData';
import { parseResponseBody } from '../request/parseResponseBody';
import { parseCreateUserResponse, parseUserEncrypted, CreateUserResponse } from '../request/responseSchema';

async function createUserWithFirebaseAuth(user: UserCreatePayload): Promise<CreateUserResponse> {
  const currentUser = getApiRuntime().identity.getUser();
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

  const data: unknown = await parseResponseBody(response);
  const requestId = response.headers.get('x-request-id');
  if (requestId && isJsonObject(data)) {
    data.requestId = data.requestId || requestId;
  }

  if (!response.ok) {
    const errorBody = isJsonObject(data) ? data : null;
    const rawMessage = errorBody?.error;
    const message = rawMessage ? String(rawMessage) : `Request failed with status ${response.status}`;
    throw new ApiRequestError(message, response.status, isJsonObject(data) ? data : {});
  }

  // LANE M: this direct-fetch path bypasses processResponse, so the response
  // is runtime-validated here instead of being cast through. The backend's
  // POST /user returns { success: boolean } (verified against the API source),
  // NOT the UserEncrypted shape that GET /user returns.
  return parseCreateUserResponse(data, '/user', 'POST');
}

export function createUserApi(request: ApiRequestFn) {
  return {
    create(user: UserCreatePayload) {
      return createUserWithFirebaseAuth(user);
    },

    getKeyRecords(options?: { limit?: number; cursor?: string; since?: number }): Promise<UserKeyRecordsResponse> {
      const params = new URLSearchParams();
      if (options?.limit !== undefined) {
        params.set('limit', String(options.limit));
      }
      if (options?.cursor) {
        params.set('cursor', options.cursor);
      }
      if (options?.since !== undefined) {
        params.set('since', String(options.since));
      }
      const query = params.toString();
      return request(`/user/key-records${query ? `?${query}` : ''}`, 'GET', undefined, true) as Promise<UserKeyRecordsResponse>;
    },

    /**
     * Fetches ALL key records, following pagination cursors (the backend pages
     * at 200 by default, max 500). Without this, accounts with more than one
     * page silently show only the oldest records.
     */
    async fetchAllKeyRecords(
      options: { limit?: number; since?: number } = {},
    ): Promise<UserKeyRecordsResponse['keys']> {
      const PAGE_SIZE = 500;
      const keys: UserKeyRecordsResponse['keys'] = [];
      let cursor: string | undefined;

      do {
        const page = await this.getKeyRecords({
          limit: options.limit ?? PAGE_SIZE,
          cursor,
          since: options.since,
        });
        keys.push(...page.keys);
        cursor = page.nextCursor;
      } while (cursor !== undefined);

      return keys;
    },

    addKeyRecord(key: EncryptionBase): Promise<EncryptedKeyRecordWithId> {
      return request('/user/key-records', 'POST', { key }, true) as Promise<EncryptedKeyRecordWithId>;
    },

    updateKeyRecord(recordId: string, key: EncryptionBase): Promise<EncryptedKeyRecordWithId> {
      return request(`/user/key-records/${encodeURIComponent(recordId)}`, 'PUT', { key }, true) as Promise<EncryptedKeyRecordWithId>;
    },

    async deleteKeyRecord(recordId: string): Promise<void> {
      await request(`/user/key-records/${encodeURIComponent(recordId)}`, 'DELETE', undefined, true);
    },

    changeDekPassword(dekPassword: Encryption) {
      return request('/user/change-password', 'POST', { dekPassword }, true);
    },

    async get(): Promise<UserEncrypted | null> {
      try {
        return (await request('/user', 'GET', undefined, true)) as UserEncrypted;
      } catch (error) {
        if (isJsonObject(error) && error.status === 404) {
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

    async setPassphraseStorage(enabled: boolean): Promise<void> {
      await request('/user/passphrase-storage', 'POST', { enabled }, true, { includeDeviceId: true });
    },

  };
}
