/**
 * Share-link security rules. Dependency-free so the exact same code runs in the
 * Supabase Edge Function (Deno), in the browser, and in the unit tests.
 */

/** 32 random bytes, base64url without padding. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
export const PIN_MAX_ATTEMPTS = 10
export const PIN_LOCK_MINUTES = 15
export const PIN_ITERATIONS = 310_000
export const SIGNED_URL_TTL_SECONDS = 30 * 60
export const ALLOWED_EXPIRY_DAYS = [7, 30, 90] as const

export interface ShareRow {
  id: string
  owner_id: string
  expires_at: string
  revoked_at: string | null
  pin_hash: string | null
  pin_salt: string | null
  pin_iterations: number | null
  failed_pin_attempts: number
  last_failed_pin_at: string | null
  photo_paths: string[]
}

export type AccessDecision =
  | { kind: 'unavailable' }
  | { kind: 'locked'; retryAfterSeconds: number }
  | { kind: 'pin_required' }
  | { kind: 'verify_pin'; priorFailures: number }
  | { kind: 'granted' }

/** Failed attempts that still count (older failures expire with the lock window). */
export function activeFailures(row: ShareRow, now: Date): number {
  if (!row.last_failed_pin_at) return 0
  const age = now.getTime() - new Date(row.last_failed_pin_at).getTime()
  return age > PIN_LOCK_MINUTES * 60_000 ? 0 : row.failed_pin_attempts
}

/**
 * Decide what a recipient may see. Unknown, revoked and expired links are
 * indistinguishable to the caller ("unavailable").
 */
export function evaluateAccess(row: ShareRow | null, now: Date, pinProvided: boolean): AccessDecision {
  if (!row) return { kind: 'unavailable' }
  if (row.revoked_at) return { kind: 'unavailable' }
  if (new Date(row.expires_at).getTime() <= now.getTime()) return { kind: 'unavailable' }
  if (!row.pin_hash) return { kind: 'granted' }
  const failures = activeFailures(row, now)
  if (failures >= PIN_MAX_ATTEMPTS) {
    const unlockAt = new Date(row.last_failed_pin_at!).getTime() + PIN_LOCK_MINUTES * 60_000
    return { kind: 'locked', retryAfterSeconds: Math.max(1, Math.ceil((unlockAt - now.getTime()) / 1000)) }
  }
  if (!pinProvided) return { kind: 'pin_required' }
  return { kind: 'verify_pin', priorFailures: failures }
}

const PHOTO_FILE = /^[A-Za-z0-9-]{1,64}\.jpg$/

/**
 * Photos are only ever served from the report's own folder:
 * <owner_id>/<report_id>/<photo_id>.jpg. Anything else is refused, so a report
 * row can never be used to obtain signed URLs for someone else's files.
 */
export function isAllowedPhotoPath(row: Pick<ShareRow, 'id' | 'owner_id'>, path: string): boolean {
  const parts = path.split('/')
  return parts.length === 3 && parts[0] === row.owner_id && parts[1] === row.id && PHOTO_FILE.test(parts[2]!)
}

export function photoIdFromPath(path: string): string {
  return path.split('/').pop()!.replace(/\.jpg$/, '')
}

// ---------------------------------------------------------------- crypto

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Cryptographically random, unguessable share token (256 bits). */
export function generateToken(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

/** Only this hash is stored server-side; the raw token lives in the link alone. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return bytesToHex(new Uint8Array(digest))
}

export function generateSalt(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
}

export async function hashPin(pin: string, saltHex: string, iterations = PIN_ITERATIONS): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations },
    key,
    256,
  )
  return bytesToHex(new Uint8Array(bits))
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function isValidPin(pin: string): boolean {
  return /^[0-9A-Za-z]{4,12}$/.test(pin)
}
