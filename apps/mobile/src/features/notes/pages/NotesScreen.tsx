import React, { useCallback, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';

import { AppScreenHeader } from '../../../components/AppScreenHeader';
import { Button } from '../../../components/Button';
import { CustomText } from '../../../components/CustomText';
import { InputField } from '../../../components/InputField';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { ConfirmationDialog } from '../../settings/components/ConfirmationDialog';
import { SecureTextDisplay } from '../../keys/components/SecureTextDisplay';
import { useToast } from '../../../app/state/ToastContext';
import { useAuth } from '../../auth/state/AuthContext';
import { theme } from '../../../styles/theme';
import { createNote, deleteNote, sortNotes, updateNote } from '../services/notesService';
import type { SecureNote } from '../model/noteTypes';
import { getUserFacingErrorMessage } from '../../../utils/errorHandling';

/**
 * Secure notes — flat list + editor + delete only. Notes are encrypted
 * key-records (type:'note') riding the same per-user DEK pipeline as keys; the
 * server only ever stores ciphertext. The list comes from `userDecrypted.notes`
 * — decrypted in the same sweep as keys — so no second decrypt pass happens
 * here; `loadUser()` refreshes after a mutation.
 */
export const NotesScreen = () => {
  const { user, userDecrypted, loadUser } = useAuth();
  const { showToast } = useToast();
  const userId = user?.uid ?? '';

  const notes = sortNotes(userDecrypted?.notes ?? []);
  const [editing, setEditing] = useState<{ id: string | null; title: string; body: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SecureNote | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    await loadUser();
  }, [loadUser]);

  const startNew = () => setEditing({ id: null, title: '', body: '' });
  const startEdit = (note: SecureNote) => setEditing({ id: note.id, title: note.title, body: note.body });

  const handleSave = async () => {
    if (!editing || !editing.title.trim()) {
      showToast('A title is required', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editing.id) {
        await updateNote(userId, {
          id: editing.id,
          title: editing.title.trim(),
          body: editing.body,
          updatedAt: Date.now(),
        });
      } else {
        await createNote(userId, { title: editing.title.trim(), body: editing.body });
      }
      setEditing(null);
      await load();
      showToast('Note saved', 'success');
    } catch (error) {
      showToast(getUserFacingErrorMessage(error, 'Failed to save note'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteNote(deleteTarget.id);
      setDeleteTarget(null);
      await load();
      showToast('Note deleted', 'success');
    } catch (error) {
      showToast(getUserFacingErrorMessage(error, 'Failed to delete note'), 'error');
    }
  };

  if (editing) {
    return (
      <ScreenContainer testID="purrivacy.notes.screen">
        <AppScreenHeader eyebrow="Secure notes" icon="note-edit-outline" title={editing.id ? 'Edit note' : 'New note'} />
        <InputField
          label="Title"
          value={editing.title}
          onChangeText={title => setEditing(e => e && { ...e, title })}
          testID="purrivacy.notes.title"
        />
        <InputField
          label="Body"
          value={editing.body}
          onChangeText={body => setEditing(e => e && { ...e, body })}
          multiline
          largeText
          isIsolated
          allowPasteOverride
          testID="purrivacy.notes.body"
        />
        {/* Editing must stay visible while typing, so the editor shows the
            body in the clear; the list view is where masking matters. */}
        <Button label="Save" onPress={handleSave} loading={saving} testID="purrivacy.notes.save" />
        <Button label="Cancel" onPress={() => setEditing(null)} variant="secondary" testID="purrivacy.notes.cancel" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer testID="purrivacy.notes.screen">
      <AppScreenHeader eyebrow="Encrypted vault" icon="note-text-outline" title="Secure notes" />
      <Button label="New note" onPress={startNew} icon={<Icon name="add" size={20} color={theme.colors.onPrimary} />} testID="purrivacy.notes.new" />

      {notes.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="note-add" size={40} color={theme.colors.textMuted} />
          <CustomText style={styles.emptyText}>No notes yet. Notes are end-to-end encrypted like your keys.</CustomText>
        </View>
      ) : (
        notes.map((note, index) => (
          <TouchableOpacity key={note.id} style={styles.noteCard} onPress={() => startEdit(note)} testID={`purrivacy.notes.item.${index}`}>
            <View style={styles.noteText}>
              <CustomText style={styles.noteTitle} numberOfLines={1}>{note.title}</CustomText>
              {note.body ? (
                // Bodies are decrypted in memory while the vault is unlocked, so
                // they are masked by default and revealed on demand (same
                // pattern as private keys) — a shoulder-surfer or a screenshot
                // of the list no longer exposes note contents. Delete rides in
                // the same row as the reveal button so the two icons align.
                <SecureTextDisplay
                  text={note.body}
                  secure
                  revealDuration={20000}
                  testID={`purrivacy.notes.preview.${index}`}
                  extraActions={(
                    <TouchableOpacity
                      onPress={() => setDeleteTarget(note)}
                      hitSlop={8}
                      accessibilityLabel="Delete note"
                      testID={`purrivacy.notes.delete.${index}`}
                    >
                      <Icon name="delete-outline" size={24} color={theme.colors.error} />
                    </TouchableOpacity>
                  )}
                />
              ) : (
                <View style={styles.noteActionsRow}>
                  <TouchableOpacity
                    onPress={() => setDeleteTarget(note)}
                    hitSlop={8}
                    accessibilityLabel="Delete note"
                    testID={`purrivacy.notes.delete.${index}`}
                  >
                    <Icon name="delete-outline" size={24} color={theme.colors.error} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))
      )}

      <ConfirmationDialog
        visible={Boolean(deleteTarget)}
        title="Delete note?"
        message={deleteTarget ? 'This note will be permanently deleted.' : ''}
        itemName={deleteTarget?.title}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        confirmLabel="Delete"
        itemType="data"
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  meta: { color: theme.colors.textSecondary },
  empty: { alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xl },
  emptyText: { color: theme.colors.textSecondary, textAlign: 'center', fontSize: 14, lineHeight: 20 },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  noteText: { flex: 1, minWidth: 0 },
  noteTitle: { color: theme.colors.text, fontWeight: '600', marginBottom: theme.spacing.xs },
  noteActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  notePreview: { color: theme.colors.textSecondary, fontSize: 13, marginTop: 4 },
});
