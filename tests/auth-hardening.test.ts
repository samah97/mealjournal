import { beforeEach, describe, expect, it, vi } from 'vitest'

const signInWithOtp = vi.fn()
const verifyOtp = vi.fn()

vi.mock('../src/lib/share/supabase', () => ({
  supabaseConfig: { url: 'https://abc.supabase.co', key: 'sb_publishable_test' },
  isSharingConfigured: () => true,
  getSupabase: async () => ({ auth: { signInWithOtp, verifyOtp } }),
}))

const { sendSignInCode, sendSignUpCode, verifySignInCode, isUnknownAccountError } = await import('../src/lib/share/api')

beforeEach(() => {
  signInWithOtp.mockReset()
  verifyOtp.mockReset()
})

describe('sign-in hardening', () => {
  it('never creates users', async () => {
    signInWithOtp.mockResolvedValue({ error: null })
    await sendSignInCode('me@example.com')
    expect(signInWithOtp.mock.calls[0]![0].options.shouldCreateUser).toBe(false)
  })

  it('treats an unknown address exactly like a known one', async () => {
    signInWithOtp.mockResolvedValue({ error: null })
    const known = await sendSignInCode('known@example.com').then(() => 'ok', (e: Error) => e.message)
    for (const error of [
      { code: 'otp_disabled', message: 'Signups not allowed for otp', status: 422 },
      { code: 'signup_disabled', message: 'Signups not allowed for this instance', status: 422 },
      { code: 'user_not_found', message: 'User not found', status: 400 },
    ]) {
      signInWithOtp.mockResolvedValue({ error })
      expect(await sendSignInCode('stranger@example.com').then(() => 'ok', (e: Error) => e.message)).toBe(known)
    }
  })

  it('still reports rate limits and network failures', async () => {
    signInWithOtp.mockResolvedValue({ error: { code: 'over_email_send_rate_limit', message: 'rate limit', status: 429 } })
    await expect(sendSignInCode('a@example.com')).rejects.toThrow(/Too many attempts/)
    signInWithOtp.mockResolvedValue({ error: { message: 'Failed to fetch', status: 0 } })
    await expect(sendSignInCode('a@example.com')).rejects.toThrow(/Could not send/)
  })

  it('gives one generic message for wrong or expired codes', async () => {
    verifyOtp.mockResolvedValue({ error: { code: 'otp_expired', message: 'Token has expired or is invalid' } })
    await expect(verifySignInCode('a@example.com', '123456')).rejects.toThrow('That code is wrong or has expired. Request a new one.')
  })

  it('recognises the server\'s unknown-account responses', () => {
    expect(isUnknownAccountError({ code: 'otp_disabled' })).toBe(true)
    expect(isUnknownAccountError({ message: 'Signups not allowed for otp' })).toBe(true)
    expect(isUnknownAccountError({ code: 'over_email_send_rate_limit', message: 'rate limit' })).toBe(false)
  })
})

describe('sign-up', () => {
  it('creates the user and records the accepted privacy notice', async () => {
    signInWithOtp.mockResolvedValue({ error: null })
    await sendSignUpCode('new@example.com', '2026-11-03')
    const { email, options } = signInWithOtp.mock.calls[0]![0]
    expect(email).toBe('new@example.com')
    expect(options.shouldCreateUser).toBe(true)
    expect(options.data.privacy_version).toBe('2026-11-03')
    expect(Number.isNaN(Date.parse(options.data.privacy_accepted_at))).toBe(false)
  })

  it('collects nothing but the email address', async () => {
    signInWithOtp.mockResolvedValue({ error: null })
    await sendSignUpCode('new@example.com', 'v1')
    expect(Object.keys(signInWithOtp.mock.calls[0]![0].options.data).sort()).toEqual(['privacy_accepted_at', 'privacy_version'])
  })

  it('reports rate limits and network failures', async () => {
    signInWithOtp.mockResolvedValue({ error: { code: 'over_email_send_rate_limit', message: 'rate limit', status: 429 } })
    await expect(sendSignUpCode('a@example.com', 'v1')).rejects.toThrow(/Too many attempts/)
    signInWithOtp.mockResolvedValue({ error: { message: 'Failed to fetch', status: 0 } })
    await expect(sendSignUpCode('a@example.com', 'v1')).rejects.toThrow(/Could not send/)
  })
})
