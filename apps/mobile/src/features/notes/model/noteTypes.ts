export const NOTE_RECORD_TYPE = 'note';
export const NOTE_TITLE_MAX_LENGTH = 200;
export const NOTE_BODY_MAX_LENGTH = 20_000;

export interface SecureNote {
  /** Server key-record id; canonical note identifier. */
  id: string;
  title: string;
  body: string;
  /** epoch ms */
  updatedAt: number;
  /**
   * When true, opening the note (and therefore copying it — the list preview
   * is never selectable) requires fresh proof of identity: the account
   * password via Firebase re-authentication, or biometrics. Same policy as
   * revealing a private key; the unlocked vault alone is not sufficient.
   *
   * Optional rather than defaulted so legacy notes — written before this
   * flag existed — stay exactly as accessible as they were, instead of being
   * silently upgraded to protected.
   */
  requireReauth?: boolean;
}

/** True when a note must pass the re-authentication gate before it can open. */
export const isNoteProtected = (note: Pick<SecureNote, 'requireReauth'>): boolean =>
  note.requireReauth === true;
