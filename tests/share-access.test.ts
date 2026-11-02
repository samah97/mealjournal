import { describe, expect, it } from 'vitest'
import {
  evaluateAccess,
  generateToken,
  hashPin,
  hashToken,
  isAllowedPhotoPath,
  isValidPin,
  PIN_LOCK_MINUTES,
  PIN_MAX_ATTEMPTS,
  timingSafeEqual,
  TOKEN_PATTERN,
  type ShareRow,
} from '../supabase/functions/_shared/access.ts'

const now = new Date('2026-11-02T12:00:00Z')
const row = (p: Partial<ShareRow> = {}): ShareRow => ({
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  owner_id: '11111111-1111-1111-1111-111111111111',
  expires_at: '2026-11-09T12:00:00Z',
  revoked_at: null,
  pin_hash: null,
  pin_salt: null,
  pin_iterations: null,
  failed_pin_attempts: 0,
  last_failed_pin_at: null,
  photo_paths: [],
  ...p,
})

describe('share tokens', () => {
  it('are 256-bit, URL-safe and unique', () => {
    const tokens = new Set(Array.from({ length: 200 }, generateToken))
    expect(tokens.size).toBe(200)
    for (const t of tokens) expect(t).toMatch(TOKEN_PATTERN)
  })

  it('are stored only as SHA-256 hashes', async () => {
    const t = generateToken()
    const h = await hashToken(t)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain(t)
    expect(await hashToken(t)).toBe(h)
  })
})

describe('evaluateAccess', () => {
  it('grants access to a valid, unrevoked, unexpired link', () => {
    expect(evaluateAccess(row(), now, false)).toEqual({ kind: 'granted' })
  })

  it('treats unknown, revoked and expired links identically', () => {
    expect(evaluateAccess(null, now, false)).toEqual({ kind: 'unavailable' })
    expect(evaluateAccess(row({ revoked_at: '2026-11-01T00:00:00Z' }), now, false)).toEqual({ kind: 'unavailable' })
    expect(evaluateAccess(row({ expires_at: '2026-11-02T11:59:59Z' }), now, false)).toEqual({ kind: 'unavailable' })
    expect(evaluateAccess(row({ expires_at: now.toISOString() }), now, false)).toEqual({ kind: 'unavailable' })
  })

  it('revocation wins even when a PIN is supplied', () => {
    const r = row({ revoked_at: '2026-11-01T00:00:00Z', pin_hash: 'x', pin_salt: 'y' })
    expect(evaluateAccess(r, now, true)).toEqual({ kind: 'unavailable' })
  })

  it('requires a PIN when one is set', () => {
    const r = row({ pin_hash: 'h', pin_salt: 's', pin_iterations: 310000 })
    expect(evaluateAccess(r, now, false)).toEqual({ kind: 'pin_required' })
    expect(evaluateAccess(r, now, true)).toEqual({ kind: 'verify_pin', priorFailures: 0 })
  })

  it('locks after too many wrong PINs, and unlocks after the lock window', () => {
    const lastFail = new Date(now.getTime() - 60_000).toISOString()
    const r = row({ pin_hash: 'h', pin_salt: 's', failed_pin_attempts: PIN_MAX_ATTEMPTS, last_failed_pin_at: lastFail })
    expect(evaluateAccess(r, now, true).kind).toBe('locked')
    const later = new Date(now.getTime() + PIN_LOCK_MINUTES * 60_000)
    expect(evaluateAccess(r, later, true)).toEqual({ kind: 'verify_pin', priorFailures: 0 })
  })
})

describe('photo isolation', () => {
  const r = row()
  it("only allows files inside the report's own folder", () => {
    expect(isAllowedPhotoPath(r, `${r.owner_id}/${r.id}/0b6f9c3e-1d2a-4c55-8f00-123456789abc.jpg`)).toBe(true)
    expect(isAllowedPhotoPath(r, `22222222-2222-2222-2222-222222222222/${r.id}/p.jpg`)).toBe(false)
    expect(isAllowedPhotoPath(r, `${r.owner_id}/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/p.jpg`)).toBe(false)
    expect(isAllowedPhotoPath(r, `${r.owner_id}/${r.id}/../other/p.jpg`)).toBe(false)
    expect(isAllowedPhotoPath(r, `${r.owner_id}/${r.id}/p.png`)).toBe(false)
  })
})

describe('PIN hashing', () => {
  it('verifies the right PIN and rejects a wrong one', async () => {
    const salt = '00112233445566778899aabbccddeeff'
    const h = await hashPin('4821', salt, 1000)
    expect(timingSafeEqual(await hashPin('4821', salt, 1000), h)).toBe(true)
    expect(timingSafeEqual(await hashPin('4822', salt, 1000), h)).toBe(false)
    expect(await hashPin('4821', 'ffeeddccbbaa99887766554433221100', 1000)).not.toBe(h)
  })

  it('validates PIN format', () => {
    expect(isValidPin('1234')).toBe(true)
    expect(isValidPin('123')).toBe(false)
    expect(isValidPin('12 34')).toBe(false)
  })
})
