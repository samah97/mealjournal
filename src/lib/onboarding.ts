/**
 * Version of the privacy summary a new user accepts at sign-up. Stored with the account
 * (user_metadata.privacy_version); bump it when the summary's meaning changes.
 */
export const PRIVACY_VERSION = '2026-11-03'

export type OnboardingAction = 'show' | 'skip' | 'none'

/**
 * What to do once a device is bound to an account. Onboarding is for brand-new accounts
 * only: an account that already had a diary (another device, a migrated diary) is set up,
 * so the device is just marked as onboarded. `onboarded` is a per-device setting.
 */
export function onboardingAction(accountHadData: boolean, onboarded: boolean): OnboardingAction {
  if (onboarded) return 'none'
  return accountHadData ? 'skip' : 'show'
}
