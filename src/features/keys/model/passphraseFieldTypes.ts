/**
 * Shared passphrase-field banner mode.
 *
 * Lives in the feature model (not the controller facade) so the passphrase
 * subhooks can depend on it without creating a type-only import cycle
 * facade <-> subhooks.
 */
export type PassphraseBannerMode = 'stored' | 'generate' | 'none';
