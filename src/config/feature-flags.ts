// src/config/feature-flags.ts
// Centralized feature flags configuration

export const FEATURE_FLAGS = {
  /**
   * Enable/disable screen time functionality
   * When disabled, screen time components and database queries are hidden/skipped
   */
  ENABLE_SCREEN_TIME: true
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
