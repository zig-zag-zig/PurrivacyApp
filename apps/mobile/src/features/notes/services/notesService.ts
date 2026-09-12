import { ApiClient } from '../../../api/client';
import { AuthService } from '../../auth/services/authService';
import { securityService } from '../../security/services/securityService';
import type { EncryptionBase } from '../../../types/types';

/**
 * Secure notes. A note is stored as an ordinary encrypted key-record whose
 * decrypted payload carries `{type:'note'}` instead of a key pair — so it rides
 * the same per-user DEK + key-records pipeline, the same device-side AES-GCM,
 * and the same server "store ciphertext" contract, with zero server schema
 * change. The keyring loader (`getUserDecrypted`) skips these payloads.
 *
 * Scope is deliberately narrow per the roadmap: flat list + editor + delete.
 */

export const NOTE_RECORD_TYPE = 'note';

export interface SecureNote {
  /** Stable id we generate; also the `recordId` once persisted. */
  id: string;
  title: string;
  body: string;
  /** epoch ms */
  updatedAt: number;
}

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
 * Fetch all records and decrypt only the notes. Note records coexist with key
 * records in the same per-user store; this decrypts the same set the keyring
 * does but keeps only `type === 'note'` payloads.
 */
export async function fetchNotes(userId: string): Promise<SecureNote[]> {
  if (userId.trim() === '') return [];

  const keyRecords = await ApiClient.fetchAllKeyRecords();
  const dek = await getAvailableDek(userId);
  const notes: SecureNote[] = [];

  for (const record of keyRecords) {
    let decrypted: { type?: string } & Partial<SecureNote>;
    try {
      decrypted = JSON.parse(
        await AuthService.decrypt(userId, record.encryptedData, dek, record.iv, false, record.tag),
      );
    } catch {
      // A record that fails to decrypt isn't a note — the keyring path will
      // surface genuine key-record corruption separately.
      continue;
    }
    if (decrypted.type !== NOTE_RECORD_TYPE) continue;
    notes.push({
      id: record.recordId,
      title: decrypted.title ?? '',
      body: decrypted.body ?? '',
      updatedAt: decrypted.updatedAt ?? 0,
    });
  }

  // Newest first.
  return notes.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createNote(
  userId: string,
  note: { title: string; body: string },
): Promise<SecureNote> {
  if (userId.trim() === '') throw new Error('userId cannot be empty');

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
