# @purrivacy/shared

Shared wire-contract types for Purrivacy API (`apps/server`) and Purrivacy App (`apps/mobile`).

Currently carries the encrypted payload envelope (`EncryptedPayload`, `SaltedEncryptedPayload`) — the primitive every encrypted record and API payload is built on.

## Development Notes

- Wire-contract types only: anything that differs between the server's internal representation and the app's client-side view does **not** belong here.
- Keep both consumers compiling when changing shapes — the API and app versions of a contract type can drift silently; update them together.
- Known drift to reconcile (tracked separately, not yet shared): `SessionResponse` (app missing `sessionFamilyId`), `EncryptedKeyRecordWithId` (server nests under `key`, app flattens), MFA/recovery response types.
