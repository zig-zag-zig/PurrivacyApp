import { ApiClient } from '../../../api/client';
import { AuthService } from '../../auth/services/authService';
import { securityService } from '../../security/services/securityService';
import type { EncryptionBase } from '../../../types/types';
import { NOTE_BODY_MAX_LENGTH, NOTE_RECORD_TYPE, NOTE_TITLE_MAX_LENGTH } from '../model/noteTypes';
import type { SecureNote } from '../model/noteTypes';

/**
 * Secure notes. A note is stored as an ordinary encrypted key-record whose
 * decrypted payload carries `{type:'note'}` instead of a key pair — so it rides
 * the same per-user DEK + key-records pipeline, the same device-side AES-GCM,
 * and the same server "store ciphertext" contract, with zero server schema
 * change. The keyring loader (`getUserDecrypted`) skips these payloads.
 *
 * Scope is deliberately narrow per the roadmap: flat list + editor + delete.
 */

/** Encrypted-payload shape written into the record. */
interface NotePayload extends SecureNote {
  type: typeof NOTE_RECORD_TYPE;
}

const getAvailableDek = async (userId: string): Promise<string> => {
  const dek = await securityService.getDek(userId);
  if (!dek || dek.trim().length === 0) {
    throw new Error('Data encryption key not found in secure storage');
  }
  return dek;
};

const newId = (): string =>
  `note-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const encryptNote = async (userId: string, payload: NotePayload): Promise<EncryptionBase> => {
  const dek = await getAvailableDek(userId);
  return AuthService.encrypt(payload, dek);
};

/**
 * Notes are decrypted in the same sweep as keys — `getUserDecrypted` already
 * decrypts every record and splits out `type === 'note'` payloads into
 * `userDecrypted.notes`. Consumers read that list (via useAuth) rather than a
 * second fetch+decrypt, and call `loadUser()` to refresh after a mutation.
 *
 * This helper exists only to refresh on demand; the list itself comes from
 * `userDecrypted.notes`.
 */
export function sortNotes(notes: SecureNote[]): SecureNote[] {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
}

const validateNote = (note: { title: string; body: string }): void => {
  if (!note.title.trim()) throw new Error('Note title is required');
  if (note.title.length > NOTE_TITLE_MAX_LENGTH) throw new Error('Note title is too long');
  if (note.body.length > NOTE_BODY_MAX_LENGTH) throw new Error('Note body is too long');
};

export async function createNote(
  userId: string,
  note: { title: string; body: string },
): Promise<SecureNote> {
  if (userId.trim() === '') throw new Error('userId cannot be empty');
  validateNote(note);

  const payload: NotePayload = {
    type: NOTE_RECORD_TYPE,
    id: newId(),
    title: note.title,
    body: note.body,
    updatedAt: Date.now(),
  };
  const encrypted = await encryptNote(userId, payload);
  const saved = await ApiClient.addKeyRecord(encrypted);
  return { ...payload, id: saved.recordId };
}

export async function updateNote(
  userId: string,
  note: SecureNote,
): Promise<void> {
  if (userId.trim() === '') throw new Error('userId cannot be empty');
  validateNote(note);

  const payload: NotePayload = {
    type: NOTE_RECORD_TYPE,
    id: note.id,
    title: note.title,
    body: note.body,
    updatedAt: Date.now(),
  };
  const encrypted = await encryptNote(userId, payload);
  await ApiClient.updateKeyRecord(note.id, encrypted);
}

export async function deleteNote(recordId: string): Promise<void> {
  await ApiClient.deleteKeyRecord(recordId);
}
