import { describe, expect, it } from 'vitest'
import { onboardingAction } from '../src/lib/onboarding'

describe('onboardingAction', () => {
  it('shows onboarding for a brand-new account', () => {
    expect(onboardingAction(false, false)).toBe('show')
  })

  it('skips it when the account already has a diary (new device, migrated diary)', () => {
    expect(onboardingAction(true, false)).toBe('skip')
  })

  it('does nothing once this device is onboarded', () => {
    expect(onboardingAction(false, true)).toBe('none')
    expect(onboardingAction(true, true)).toBe('none')
  })
})
