// src/config/feature-flags.ts
// Centralized feature flags configuration

export const FEATURE_FLAGS = {
  /**
   * Enable/disable screen time functionality
   * When disabled, screen time components and database queries are hidden/skipped
   */
  ENABLE_SCREEN_TIME: true,
  /**
   * Enable/disable Typeform integration for device registration
   * When enabled, clicking "Add Device" will show a Typeform instead of the regular form
   */
  ENABLE_TYPEFORM: true,
  /**
   * When true, use Clerk's built-in SignInButton/SignUpButton (modal) on the landing page.
   * When false, use the custom SignInSignUpModal component.
   */
  USE_LEGACY_AUTH_UI: false
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

/**
 * Get a feature flag value
 */
export function getFeatureFlag(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag];
}

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return getFeatureFlag(flag) === true;
}
