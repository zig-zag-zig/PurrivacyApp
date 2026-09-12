# Purrivacy — Roadmap Ideas

Approved roadmap distilled from a codebase survey plus a design discussion. Each item
carries its agreed scope and the files it was verified against — treat references as a
starting point, not gospel, if the code has moved.

- Captured: 2026-09-08
- Branch surveyed: `main` @ `3c7e052` (`chore(mobile): align expo SDK-57 patch versions (#11)`)
- Mobile version at survey time: `1.2.0` (server release tag `server-v*`)

---

## Product direction (the guardrail)

**Purrivacy is a keyring and a cipher tool — gpg for your pocket.** Everything lands in the
keyring; nothing creates conversations, contacts, or relationships between users.

- **Manual armor import stays the primary, always-present path.** Every other input method
  (file pickers, share intents, hypothetical links/lookups) is additive — a new way for a key
  to land in the same keyring, never a replacement and never a requirement.
- **Litmus test for any proposal:** does it manipulate keys/ciphertext, or does it create
  messages, threads, or relationships? The latter is out of scope — permanently.
- **Explicitly out of scope:** message history/threads, contact lists, friending, discovery
  feeds, password-manager features (autofill overlays for other apps, TOTP generators,
  breach alerts). These are the Signal-clone / password-manager cliffs and are rejected by
  identity, not by cost.

---

## Baseline (what exists today)

- OpenPGP.js **v5.11.3** bundled into a hidden WebView (`assets/pgp/openpgp.bundle.js`,
  `src/components/HiddenPGPWebView.tsx`); RN ↔ WebView ops are JSON payloads through
  `injectJavaScript` / `postMessage` (`src/shared/hooks/useHiddenPgpExecutor.ts:73-104`)
- Ops present: `generateKey, readKey, readPrivateKey, readSignature, readMessage,
  createMessage, encrypt, decrypt, encryptKey, decryptKey, reformatKey, sign, verify`
- Text-centric encrypt/decrypt with embedded **and detached** signatures; file pickers for
  `.txt` in and `.asc`/`.pgp`/`.gpg` out; `KEY_ARMOR_MAX_LENGTH = 200_000`
- Key ops: generate, import, delete, set default, change passphrase, change expiry
  (`src/features/keys/services/keyMutationService.ts`)
- Recipient picker already has search, sort pills, popularity ranking
  (`keySelectionModal/useKeySelectionList.ts`); the Keys tab does not
- No `FlatList`/`SectionList`/`FlashList` anywhere in `src/` — all lists are `.map()` in a
  ScrollView
- Auth/security: Firebase auth, MFA (TOTP + recovery codes + trusted sessions), BIP-39
  recovery seeds, biometrics, inactivity lock, screen-capture protection, per-class
  clipboard TTLs, signed in-app APK updates (pinned ECDSA P-256 manifest)
- Sync: user records + key records encrypted to account DEK, via `/user/key-records`;
  passphrase sync is consent-gated (`keyRepository.ts:34-42`)
- `SECURITY_ARCHITECTURE_REVIEW.md` findings APP-SEC-001…006 are remediated — verified, do
  not re-open.

---

## Phase 1 — UX & keyring hygiene (small/medium, mostly independent)

Ordered so early items unblock later ones.

### 1. List virtualization

Every list is `.map()` inside a ScrollView; each expanded `KeyItem` mounts native
`IsolatedTextInput` plus autofill-suppression machinery. Adopt `FlashList` (or `FlatList`)
for key lists first. Foundation for the notes list in item 8 and any long keyrings.

### 2. Search + filters on the Keys tab

`KeyScreen.tsx:63` renders `sortedKeys.map(...)` with no search and no way to narrow to
complete pairs vs. public-only vs. expiring vs. revoked. Reuse the picker's filtering
approach (`useKeySelectionList.ts`); add filter chips, not just a text box.

### 3. Outbound share-sheet completeness

Results are copy-only today (`SecureTextDisplay`, `CopyableResultBlock`). Add `Share`/file
share for: ciphertext results, exported public keys, and (later) revocation certificates.
Also serves the clipboard-review guidance: prefer share/export to trusted destinations over
clipboard for secret material.

### 4. Revocation certificates

`openpgp.revokeKey` is never called — the only crypto op the bundle lacks usage of.

- **Generate:** at key-creation time where possible, plus on-demand "Generate revocation"
  per key. Capture it while the private key + passphrase are available — the real-world
  failure mode is losing the passphrase first and being unable to ever revoke.
- **Merge + represent:** revocation signature merges into the public key certificate;
  store/display revoked state on the key record.
- **Inbound:** importing a revoked key (or a revocation for an existing key) marks it
  revoked; encrypt-to-revoked is refused or loudly warned.
- **Distribution is manual, same as keys today:** "export/share revocation" produces an
  armored blob the user hands over by whatever channel they already use. No server, no
  contacts system.
- **Semantics:** revoking ≠ deleting. The private key stays so historical ciphertexts and
  old signatures still verify; the key just stops being offered for new encryptions.

Storage decision still open — see Open questions.

### 5. Expiry dashboard + warnings

Expiry is parsed, displayed, and changeable, but nothing proactive exists.

- **Phase A (client-only):** expiring-soon pills in the key list + a dismissible banner
  ("key X expires in N days"). No server work.
- **Phase B (optional):** scheduled push via `maintenanceJobs` + device-scoped push tokens.

### 6. Draft persistence

A failed decrypt (wrong passphrase), interrupted compose, or backgrounding mid-edit loses
the text. Persist drafts through the existing `encryptedSqliteValueStore` — **never
plaintext to disk**, which would undo the app's own threat model. Encrypt/decrypt compose
screens only.

---

## Phase 2 — Capability (the big lifts)

### 7. Binary / file encryption — chunked WebView bridge (option A)

Encrypt and decrypt arbitrary files (photos, PDFs, anything) to `.pgp`. **Approved
approach: chunked transfer through the existing WebView bridge — no native module, no
moving openpgp into the JS thread.**

Mechanics (verified against the bundled v5.11.3 API):

- **Encrypt:** read file bytes → feed to the WebView as base64/hex chunks over repeated
  `injectJavaScript` calls → assemble `Uint8Array` inside →
  `openpgp.createMessage({ binary, filename, date })` → `encrypt({ format: 'binary' })` →
  return ciphertext in chunks → write `.pgp` via `expo-file-system` → share via
  `expo-sharing` (item 3).
- **Decrypt:** ciphertext in chunks → `readMessage` + `decrypt` → the literal-data packet
  carries the original `filename` + `date` → write bytes to disk under the recovered name →
  open/share. User gets the actual file back; base64 is plumbing only, never a user
  artifact.
- `format: 'binary'` (not `armored`) — ~33% smaller output for files; armor remains for the
  text path.

**Required first step — spike:** measure `injectJavaScript` chunk throughput and the WebView
memory ceiling to pick chunk size and confirm viability before building the real flow. The
bridge currently assumes JSON-string payloads (`useHiddenPgpExecutor.ts:73-104`); file ops
need a chunking protocol on top. `KEY_ARMOR_MAX_LENGTH` is armor-text-only and must not
apply to files.

### 8. Secure notes (scoped down — notes only)

Private notes encrypted to the account DEK, stored and synced through the same
encrypted-record pipeline as key records (new record type). Server only ever holds
ciphertext.

- Flat list + editor + delete. Nothing more.
- **Explicitly not:** a message-history view, password/username/site fields, autofill for
  other apps, or any password-manager surface. If it can't be described as "a note
  encrypted for myself," it's out.

---

## Phase 3 — Optional trust layer (small, deferrable)

### 9. Fingerprint verification utility (opt-in)

- "Copy fingerprint" on any key.
- A Verify screen: paste whatever the counterparty sent through *any* channel the user
  chooses (email, SMS, phone call readout) — the app string-compares instead of the user's
  eyes.
- On match, a `verified` flag stored on the key record. Pure local metadata; no gate, no
  requirement to import or encrypt; works with non-Purrivacy PGP users since fingerprints
  are spec-standard.
- **QR scanning explicitly deferred** — camera dependency not justified for rare in-person
  exchange. Revisit only if wanted later.

### 10. Trust status on decrypt results

Depends on the `verified` flag from item 9: signature results show "signed by X —
verified ✓ / unverified." If the user never verifies anyone, results honestly say
unverified — correct behavior, not a gap. Scope is deliberately small: read the flag,
render the label on `DecryptionResult`.

---

## Deferred / not planned (recorded so the reasoning isn't lost)

| Idea | Status | Why |
|---|---|---|
| Per-device session list + individual revoke (server `GET/DELETE /auth/sessions`) | Deferred | Server primitives exist (session families, device-scoped push tokens); real security value; wasn't selected |
| Shareable key links (`purrivacy://key/<fingerprint>` deep link → import) | Deferred | Cheapest key-exchange aid; would land in the keyring like a manual import. Revisit if wanted — it is *not* a contacts system |
| Opt-in exact-match directory / WKSD keyserver lookup | Deferred | Borderline under the guardrail — first thing that smells like discovery. If ever built: opt-in publish, exact-match only, no browse/list, auth + rate-limited |
| QR fingerprint scanning | Deferred | Camera dep not justified; paste-compare covers remote verification |
| i18n / localization | Deferred | All strings inline JSX; gets more expensive as features land — worth doing before Phase 2 adds strings if reach ever becomes a goal |
| Light mode / follow system theme | Deferred | `theme.ts` is hardcoded dark; `useColorScheme` unused |
| Tablet / landscape two-pane | Deferred | `supportsTablet: true` declared; layout is single-column |
| First-run onboarding | Deferred | Empty state assumes PGP literacy; a demo-keypair self-round-trip would teach the model |
| Accessibility audit | Deferred | `testID` coverage is good; Dynamic Type / screen readers / 44dp targets / reduce-motion unverified, especially inside `IsolatedTextInput` wrappers |
| Message history / threads, contacts, password-manager features | **Out of scope** | Rejected by the product-direction rule — creates relationships, not a keyring |

---

## Open questions to settle before building

- **File-bridge spike (gates item 7):** what chunk size and throughput does
  `injectJavaScript` sustain before the WebView OOMs or janks? Decide the chunking
  protocol from measurement, not a guess.
- **Revocation cert storage:** does the cert live inside the encrypted key record (syncs to
  backend and all devices, DEK-encrypted)? Precedent: `keyRepository.ts:34-42` already
  syncs `privateKeyPassphrase` under consent — same pattern, and APP-SEC-004 is the
  warning about getting the disclosure wording exactly right.
- **`verified` flag location:** same question, lower stakes — a field on the key record
  would sync it across devices; a device-local flag keeps verification
  per-device (arguably more correct, since verification is about *this* user's channel).
- **iOS parity:** update install, autofill suppression, and share handling are
  Android-first today. Does each new feature need an iOS design before acceptance?
- **Notes recordType plumbing:** confirm the DEK record pipeline accepts a new record type
  without schema surgery (`UserKeyRepository` / `EncryptedUserDataValidator` are the likely
  touch points server-side).
