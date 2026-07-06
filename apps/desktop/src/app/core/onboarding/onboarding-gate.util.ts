import type { Settings, Profile } from '@applye/core';

/** Auto-open the wizard once, on first launch (after health-check). */
export function shouldAutoOpenOnboarding(settings: Settings): boolean {
  return !settings.onboardingSeen;
}

/** After the user skipped, nudge from the dashboard while the profile is empty. */
export function shouldShowOnboardingBanner(settings: Settings, profile: Profile | null): boolean {
  return settings.onboardingSeen && !profile?.fullMd?.trim();
}
