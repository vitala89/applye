import { shouldAutoOpenOnboarding, shouldShowOnboardingBanner } from './onboarding-gate.util';
import type { Settings } from '@applye/core';
import type { Profile } from '@applye/core';

const settings = (over: Partial<Settings> = {}): Settings =>
  ({ id: 1, onboardingSeen: false, healthCheckSeen: true, ...over }) as Settings;
const profile = (fullMd: string): Profile => ({ id: 1, fullMd, updatedAt: '' }) as Profile;

describe('onboarding-gate.util', () => {
  it('auto-opens when onboarding not yet seen', () => {
    expect(shouldAutoOpenOnboarding(settings({ onboardingSeen: false }))).toBe(true);
  });
  it('does not auto-open once seen', () => {
    expect(shouldAutoOpenOnboarding(settings({ onboardingSeen: true }))).toBe(false);
  });
  it('shows banner when seen but profile empty', () => {
    expect(shouldShowOnboardingBanner(settings({ onboardingSeen: true }), profile('   '))).toBe(
      true,
    );
    expect(shouldShowOnboardingBanner(settings({ onboardingSeen: true }), null)).toBe(true);
  });
  it('hides banner when profile has content', () => {
    expect(shouldShowOnboardingBanner(settings({ onboardingSeen: true }), profile('# Jane'))).toBe(
      false,
    );
  });
  it('hides banner when onboarding not yet seen (overlay will handle it)', () => {
    expect(shouldShowOnboardingBanner(settings({ onboardingSeen: false }), null)).toBe(false);
  });
});
