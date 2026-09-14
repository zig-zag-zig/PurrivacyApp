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
}
