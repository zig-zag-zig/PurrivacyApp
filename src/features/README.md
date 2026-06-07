Feature-first structure

- `auth`
  - Authentication lifecycle, auth state, auth pages, and auth services.
- `keys`
  - PGP key management pages/components/domain/services.
- `encrypt`
  - Encrypt workflow page + encrypt-specific rendering.
- `decrypt`
  - Decrypt workflow page + decrypt-specific rendering.
- `settings`
  - Settings page and settings-focused UI components.
- `security`
  - Sensitive account actions, security hooks, and secure-storage services.
- `mfa`
  - MFA setup flow, MFA modal UI, and MFA orchestration utilities.

Notes

- Import app-level modules from `src/app/*`.
- Import feature modules from `src/features/*`.
