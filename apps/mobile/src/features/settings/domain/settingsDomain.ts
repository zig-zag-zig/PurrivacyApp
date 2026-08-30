export function getMfaDescription(mfaEnabled: boolean): string {
  return mfaEnabled
    ? 'Two-factor authentication is enabled. Your account is protected with an additional security layer.'
    : 'Add an extra layer of security to your account. Requires an authenticator app.';
}
