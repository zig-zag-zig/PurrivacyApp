# Spinner Fix Plan

## Problem 1: Global opaque spinner used for local operations

[`GlobalSpinnerProvider`](src/app/state/GlobalSpinnerContext.tsx:55) renders a full-screen opaque overlay (`theme.colors.background`) with a spinner whenever any source is active. Several screens feed local operations into this global spinner, blocking the entire UI unnecessarily.

## Problem 2: Spinner hides before UI updates (stale UI flicker)

React state updates are batched asynchronously. When a spinner is turned off immediately after a state change (e.g., `setLoading(false)` right after `setKeys(newKeys)`), the spinner disappears in the same render cycle as (or before) the new UI, showing the old UI for a frame.

## Solution overview

A. Make `useGlobalSpinner` accept an optional `backgroundMode` (`'opaque' | 'transparent'`) so same-context callers can choose.

B. Move local operations off the global spinner onto per-control inline spinners (button `loading` props, `SettingsOption` `loading` prop).

C. Add a `MIN_SPINNER_DELAY_MS` (default 200ms) to `executeWithLoading` so the loading state persists at least that long, giving React time to render the updated UI before the spinner disappears.

---

## Changes

### 1. [`src/app/state/GlobalSpinnerContext.tsx`](src/app/state/GlobalSpinnerContext.tsx)

- Change `useGlobalSpinner(active: boolean)` signature to `useGlobalSpinner(active: boolean, options?: { backgroundMode?: 'opaque' | 'transparent' })`.
- Track per-source background modes in a `Map<string, 'opaque' | 'transparent'>`.
- When _any_ active source has `opaque`, render the current opaque overlay.
- When all active sources are `transparent`, render a semi-transparent overlay instead (`rgba(0,0,0,0.4)` with blur if feasible, otherwise `theme.colors.background` at 60% opacity).
- Preserve the existing elevation/zIndex so the overlay still blocks touches.

### 2. [`src/features/settings/pages/SettingsScreen.tsx`](src/features/settings/pages/SettingsScreen.tsx)

- **Remove** `useGlobalSpinner(settingsPage.isPageLoading)` entirely.
- **Remove** `isPageLoading` from `useSettingsPage` return value.
- For **biometric toggle**: The [`SettingsOption`](src/features/settings/components/SettingsOption.tsx:21) already supports a `loading` prop for the switch. Pass `state.biometricToggleLoading` to it via `loading={settingsPage.state.biometricToggleLoading}`.
- For **passphrase storage toggle**: Same — pass `loading={settingsPage.state.passphraseStorageLoading}`.
- For **MFA operations** (`isLoading` from `useMfa`): Already handled by per-action flows (dialog buttons); no spinner needed.
- For **logout**: Use `loading={settingsPage.state.logoutLoading}` on the `SettingsOption` (it already has the `loading` prop for non-switch options).
- For **revoke sessions**: Already uses `loading={settingsPage.state.revokeSessionsLoading}` on the `ConfirmationDialog` — keep.

### 3. [`src/features/keys/pages/KeyScreen.tsx`](src/features/keys/pages/KeyScreen.tsx:29)

- **Remove** `isLoadingOverlay` (`state.isDeleting`) from the global spinner call.
- Change `useGlobalSpinner(keyScreen.isResolvingKeys || keyScreen.isLoadingOverlay)` → `useGlobalSpinner(keyScreen.isResolvingKeys)`.
- Key deletion already shows a `ConfirmationDialog` in [`KeyItem.tsx`](src/features/keys/components/KeyItem.tsx:322). Add a `loading` state to that dialog by:
  - In `useKeyOperations.onDeleteKey`, pass a `loading` flag back through state.
  - The `KeyItem` confirmation dialog already accepts `loading` (no changes needed to the dialog itself). Just wire `state.isDeleting` to the dialog's `loading` prop instead of the global spinner.

### 4. [`src/features/keys/hooks/useKeyScreen.ts`](src/features/keys/hooks/useKeyScreen.ts:67)

- Remove `isLoadingOverlay: state.isDeleting` from the return value.

### 5. [`src/features/encrypt/pages/EncryptScreen.tsx`](src/features/encrypt/pages/EncryptScreen.tsx:19)

- Change `useGlobalSpinner(encryptPage.shouldRedirectToKeys || encryptPage.isLoadingOverlay)` → `useGlobalSpinner(encryptPage.isLoadingOverlay)`.
- The redirect already renders a blank `ScreenContainer` immediately (line 32); the spinner is redundant.

### 6. [`src/features/encrypt/hooks/useEncryptPage.ts`](src/features/encrypt/hooks/useEncryptPage.ts)

- Remove `shouldRedirectToKeys` from the `isLoadingOverlay` composition.
- `isLoadingOverlay` should only be `!userDecrypted || isAuthLoading`.

### 7. [`src/features/decrypt/pages/DecryptScreen.tsx`](src/features/decrypt/pages/DecryptScreen.tsx:21)

- Same as EncryptScreen: remove `shouldRedirectToKeys` from spinner.
- Change `useGlobalSpinner(decryptPage.shouldRedirectToKeys || decryptPage.isLoadingOverlay)` → `useGlobalSpinner(decryptPage.isLoadingOverlay)`.

### 8. [`src/features/decrypt/hooks/useDecryptPage.ts`](src/features/decrypt/hooks/useDecryptPage.ts)

- Same as EncryptScreen's hook: remove `shouldRedirectToKeys` from `isLoadingOverlay`.

### 9. [`src/utils/errorHandling.ts`](src/utils/errorHandling.ts:70) — `executeWithLoading`

- Add a `MIN_SPINNER_DELAY_MS = 200` constant.
- Inside `executeWithLoading`:
  ```
  const startedAt = Date.now();
  setLoading(true);
  const result = await operation();
  // wait for minimum duration before hiding spinner
  const elapsed = Date.now() - startedAt;
  if (elapsed < MIN_SPINNER_DELAY_MS) {
    await new Promise(r => setTimeout(r, MIN_SPINNER_DELAY_MS - elapsed));
  }
  ```
- This ensures React has time to paint the new UI state before the spinner disappears, preventing the stale-UI flicker. 200ms is human-imperceptible as a delay but gives React at least 1-2 render cycles.

### 10. [`src/features/settings/hooks/useSettingsPage.ts`](src/features/settings/hooks/useSettingsPage.ts:187)

- Remove `isPageLoading` from the return value entirely.
- Keep all individual loading states (`biometricToggleLoading`, `passphraseStorageLoading`, `logoutLoading`).

### 11. [`src/features/keys/components/KeyItem.tsx`](src/features/keys/components/KeyItem.tsx:322)

- The `ConfirmationDialog` already accepts a `loading` prop.
- Add `deleting: boolean` prop to `KeyItemProps`.
- Pass `deleting` to `ConfirmationDialog` `loading` prop.

### 12. [`src/features/keys/components/KeyItem.tsx`](src/features/keys/components/KeyItem.tsx:23) — KeyItemProps

- Add `deleting?: boolean`.

### 13. [`src/features/keys/pages/KeyScreen.tsx`](src/features/keys/pages/KeyScreen.tsx:66)

- Pass `deleting={keyScreen.state.isDeleting}` to each `KeyItem`.

### 14. [`src/features/keys/hooks/useKeyOperations.ts`](src/features/keys/hooks/useKeyOperations.ts:209)

- `onDeleteKey` already manages `isDeleting` state via dispatch. No changes needed — the confirmation dialog in `KeyItem` will now consume it.

---

## Summary of changes

| File | Change |
|------|--------|
| `src/app/state/GlobalSpinnerContext.tsx` | Add `backgroundMode` option support |
| `src/features/settings/pages/SettingsScreen.tsx` | Remove global spinner; add per-control `loading` props |
| `src/features/settings/hooks/useSettingsPage.ts` | Remove `isPageLoading` |
| `src/features/keys/pages/KeyScreen.tsx` | Remove `isDeleting` from global spinner; pass to KeyItem |
| `src/features/keys/hooks/useKeyScreen.ts` | Remove `isLoadingOverlay` |
| `src/features/keys/components/KeyItem.tsx` | Accept and wire `deleting` prop to ConfirmationDialog |
| `src/features/encrypt/pages/EncryptScreen.tsx` | Remove `shouldRedirectToKeys` from spinner |
| `src/features/encrypt/hooks/useEncryptPage.ts` | Remove `shouldRedirectToKeys` from `isLoadingOverlay` |
| `src/features/decrypt/pages/DecryptScreen.tsx` | Remove `shouldRedirectToKeys` from spinner |
| `src/features/decrypt/hooks/useDecryptPage.ts` | Remove `shouldRedirectToKeys` from `isLoadingOverlay` |
| `src/utils/errorHandling.ts` | Add `MIN_SPINNER_DELAY_MS` to `executeWithLoading` |
| `src/features/settings/state/settingsReducer.test.ts` | Update if needed |

---

## Verification

1. Run full test suite: `npx vitest run`
2. Run full test suite: `cd ../Purrivacy && npx jest --no-coverage tests/passphraseStorage.test.ts`
3. Manual: Go to Settings and toggle biometric, passphrase storage, MFA — verify per-control spinners appear inline
4. Manual: Go to Settings and logout — verify loading appears on the row
5. Manual: Delete a key — verify loading appears on the confirmation dialog, not fullscreen
6. Manual: Navigate to encrypt/decrypt with no keys — verify no fullscreen flash
7. Manual: Create/import a key — verify no stale UI flicker after spinner disappears

---

## Risks & assumptions

- `SettingsOption` already supports `loading` prop for switches AND non-switch modes — confirmed at [`SettingsOption.tsx:21`](src/features/settings/components/SettingsOption.tsx:21) and line 99 (non-switch loading overlay).
- `ConfirmationDialog` already accepts `loading` prop — confirmed at [`KeyItem.tsx`](src/features/keys/components/KeyItem.tsx:322).
- The `backgroundMode` addition to `GlobalSpinnerContext` is backward-compatible — default stays `'opaque'` so all existing callers continue as-is.
- The 200ms minimum delay in `executeWithLoading` applies only to the loading flag duration, not to the actual operation — results are returned immediately, only the spinner stays visible for the minimum time.
