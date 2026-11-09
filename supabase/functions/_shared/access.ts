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

// ---------------------------------------------------------------- access log

/** Repeat views from the same IP and browser within this window are logged once. */
export const ACCESS_LOG_DEDUPE_MINUTES = 30
export const USER_AGENT_MAX_LENGTH = 300

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

export function isIpAddress(s: string): boolean {
  if (IPV4.test(s)) return true
  if (!s.includes(':') || s.length > 45 || !/^[0-9A-Fa-f:.]+$/.test(s)) return false
  try {
    new URL(`http://[${s}]/`) // the WHATWG URL parser validates IPv6 literals
    return true
  } catch {
    return false
  }
}

/**
 * The visitor's IP address as reported by the platform's proxy, or null if it can't be
 * determined. Prefers headers set by the edge proxy itself over the client-extendable
 * X-Forwarded-For chain. Only used for the owner's access log.
 */
export function clientIp(headers: Headers): string | null {
  const candidates = [
    headers.get('cf-connecting-ip'),
    headers.get('x-real-ip'),
    headers.get('x-forwarded-for')?.split(',')[0],
  ]
  for (const raw of candidates) {
    let ip = raw?.trim()
    if (!ip) continue
    const v4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip)
    if (v4WithPort) ip = v4WithPort[1]!
    const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(ip)
    if (bracketed) ip = bracketed[1]!
    if (isIpAddress(ip)) return ip
  }
  return null
}

export function truncateUserAgent(ua: string | null): string | null {
  const s = ua?.trim()
  return s ? s.slice(0, USER_AGENT_MAX_LENGTH) : null
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
