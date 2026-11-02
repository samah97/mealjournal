import {
  generateSalt,
  generateToken,
  hashPin,
  hashToken,
  isValidPin,
  PIN_ITERATIONS,
} from '../../../supabase/functions/_shared/access.ts'
import { db } from '../db'
import { resizeForReport } from '../images'
import { reportPhotoIds } from '../report/buildReport'
import type { ReportData } from '../report/types'
import type { ShareLinkRecord } from '../types'
import { uid } from '../utils'
import { skipTracking } from '../sync/tracking'
import { getSupabase, isSharingConfigured, supabaseConfig } from './supabase'

const BUCKET = 'report-photos'

// ---------------------------------------------------------------- auth

export async function getCurrentUser() {
  if (!isSharingConfigured()) return null
  const sb = await getSupabase()
  const { data } = await sb.auth.getSession()
  return data.session?.user ?? null
}

/** Shown for every address, known or not, so the app never reveals who has an account. */
export const CODE_SENT_MESSAGE = 'If this address has an account, a code is on its way.'

/**
 * Ask for a sign-in code. Accounts are invite-only: `shouldCreateUser: false`, and the
 * server rejects unknown addresses too. That rejection is swallowed, so a known and an
 * unknown address look exactly the same. Other failures (rate limits, network) are real.
 */
export async function sendSignInCode(email: string): Promise<void> {
  const sb = await getSupabase()
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: location.origin },
  })
  if (!error || isUnknownAccountError(error)) return
  if (error.status === 429 || /rate limit|too many|seconds/i.test(error.message)) {
    throw new Error('Too many attempts. Please wait a minute and try again.')
  }
  throw new Error('Could not send the code. Check your connection and try again.')
}

export function isUnknownAccountError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === 'otp_disabled' ||
    error.code === 'signup_disabled' ||
    error.code === 'user_not_found' ||
    /signups? not allowed|user not found/i.test(error.message ?? '')
  )
}

export async function verifySignInCode(email: string, code: string): Promise<void> {
  const sb = await getSupabase()
  const { error } = await sb.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
  if (error) throw new Error('That code is wrong or has expired. Request a new one.')
}

// ---------------------------------------------------------------- publishing

export interface PublishOptions {
  report: ReportData
  expiresInDays: 7 | 30 | 90
  pin?: string
}

export function shareUrl(token: string): string {
  // The token travels in the fragment: it is never sent to the web host, never
  // appears in server logs and is not seen by link-preview bots.
  return `${location.origin}/shared#${token}`
}

/**
 * Publish an immutable snapshot of a report. Only the report itself and the
 * photos it includes are uploaded – never the rest of the diary.
 */
export async function publishReport(
  { report, expiresInDays, pin }: PublishOptions,
  onProgress?: (msg: string) => void,
): Promise<ShareLinkRecord> {
  if (!navigator.onLine) throw new Error('You are offline. Connect to the internet to create a share link.')
  const sb = await getSupabase()
  const user = (await sb.auth.getUser()).data.user
  if (!user) throw new Error('Please sign in to publish a share link.')
  if (pin !== undefined && !isValidPin(pin)) throw new Error('The PIN must be 4–12 letters or digits.')

  const reportId = uid()
  const token = generateToken()
  const tokenHash = await hashToken(token)
  const photoIds = reportPhotoIds(report)
  const uploaded: string[] = []

  try {
    for (const [i, id] of photoIds.entries()) {
      onProgress?.(`Uploading photo ${i + 1} of ${photoIds.length}…`)
      const photo = await db.photos.get(id)
      if (!photo) continue
      const resized = await resizeForReport(photo.blob, 1400, 0.8)
      const path = `${user.id}/${reportId}/${id}.jpg`
      const { error } = await sb.storage.from(BUCKET).upload(path, resized.blob, {
        contentType: 'image/jpeg',
        upsert: false,
      })
      if (error) throw new Error(`Photo upload failed: ${error.message}`)
      uploaded.push(path)
    }

    onProgress?.('Publishing report…')
    let pinFields = {}
    if (pin) {
      const salt = generateSalt()
      pinFields = { pin_salt: salt, pin_iterations: PIN_ITERATIONS, pin_hash: await hashPin(pin, salt, PIN_ITERATIONS) }
    }
    const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000)
    const { error } = await sb.from('shared_reports').insert({
      id: reportId,
      token_hash: tokenHash,
      title: report.title,
      period_start: report.periodStart,
      period_end: report.periodEnd,
      options: report.options,
      payload: report,
      photo_paths: uploaded,
      expires_at: expiresAt.toISOString(),
      ...pinFields,
    })
    if (error) throw new Error(`Publishing failed: ${error.message}`)

    const record: ShareLinkRecord = {
      id: reportId,
      title: report.title,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      createdAt: Date.now(),
      expiresAt: expiresAt.getTime(),
      url: shareUrl(token),
      hasPin: !!pin,
      includesPhotos: uploaded.length > 0,
      photoPaths: uploaded,
    }
    await db.shareLinks.put(record)
    return record
  } catch (e) {
    if (uploaded.length) await sb.storage.from(BUCKET).remove(uploaded)
    throw e
  }
}

// ---------------------------------------------------------------- managing links

export interface RemoteReport {
  id: string
  title: string
  period_start: string
  period_end: string
  created_at: string
  expires_at: string
  revoked_at: string | null
  view_count: number
  last_viewed_at: string | null
  photo_paths: string[]
  pin_hash: string | null
}

/** Merge server state into the local link list (the server never knows the raw URL). */
export async function syncShareLinks(): Promise<void> {
  if (!isSharingConfigured() || !navigator.onLine) return
  const sb = await getSupabase()
  const { data: session } = await sb.auth.getSession()
  if (!session.session) return
  const { data, error } = await sb
    .from('shared_reports')
    .select(
      'id, title, period_start, period_end, created_at, expires_at, revoked_at, view_count, last_viewed_at, photo_paths, pin_hash',
    )
    .order('created_at', { ascending: false })
  if (error || !data) return
  const local = new Map((await db.shareLinks.toArray()).map((l) => [l.id, l]))
  const rows = data as RemoteReport[]
  // Derived from the server, so not queued for device sync (every device does the same).
  await db.transaction('rw', [db.shareLinks, db.outbox], async (tx) => {
    skipTracking(tx)
    await db.shareLinks.bulkPut(
    rows.map((r) => {
      const existing = local.get(r.id)
      return {
        id: r.id,
        title: r.title,
        periodStart: r.period_start,
        periodEnd: r.period_end,
        createdAt: new Date(r.created_at).getTime(),
        expiresAt: new Date(r.expires_at).getTime(),
        revokedAt: r.revoked_at ? new Date(r.revoked_at).getTime() : existing?.revokedAt,
        url: existing?.url,
        hasPin: !!r.pin_hash,
        includesPhotos: r.photo_paths.length > 0,
        photoPaths: r.photo_paths,
        pendingRevoke: existing?.pendingRevoke && !r.revoked_at,
        viewCount: r.view_count,
      } satisfies ShareLinkRecord
    }),
    )
  })
}

/** Revoke immediately; when offline the request is queued and retried on reconnect. */
export async function revokeShareLink(id: string): Promise<'revoked' | 'queued'> {
  if (!navigator.onLine) {
    await db.shareLinks.update(id, { pendingRevoke: true })
    return 'queued'
  }
  const sb = await getSupabase()
  const { error } = await sb.from('shared_reports').update({ revoked_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
  const link = await db.shareLinks.get(id)
  if (link?.photoPaths.length) await sb.storage.from(BUCKET).remove(link.photoPaths)
  await db.shareLinks.update(id, { revokedAt: Date.now(), pendingRevoke: false })
  return 'revoked'
}

/** Delete a link entirely: removes uploaded photos and the server record. */
export async function deleteShareLink(id: string): Promise<void> {
  const link = await db.shareLinks.get(id)
  if (isSharingConfigured()) {
    if (!navigator.onLine) throw new Error('You are offline. Connect to delete this link from the server.')
    const sb = await getSupabase()
    if (link?.photoPaths.length) await sb.storage.from(BUCKET).remove(link.photoPaths)
    const { error } = await sb.from('shared_reports').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }
  await db.shareLinks.delete(id)
}

/** Execute revocations requested while offline. */
export async function processPendingRevocations(): Promise<number> {
  if (!isSharingConfigured() || !navigator.onLine) return 0
  const pending = (await db.shareLinks.toArray()).filter((l) => l.pendingRevoke)
  let done = 0
  for (const l of pending) {
    try {
      if ((await revokeShareLink(l.id)) === 'revoked') done++
    } catch {
      /* stays queued */
    }
  }
  return done
}

// ---------------------------------------------------------------- recipient side

export type SharedReportResult =
  | { status: 'ok'; report: ReportData; photos: Record<string, string>; expiresAt: string }
  | { status: 'pin_required' }
  | { status: 'pin_invalid'; attemptsLeft: number }
  | { status: 'locked'; retryAfterSeconds: number }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }

export async function fetchSharedReport(token: string, pin?: string): Promise<SharedReportResult> {
  if (!isSharingConfigured()) return { status: 'error', message: 'This site is not configured for sharing.' }
  try {
    const res = await fetch(`${supabaseConfig.url}/functions/v1/get-shared-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabaseConfig.key! },
      body: JSON.stringify({ token, pin }),
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    })
    const body = (await res.json().catch(() => null)) as SharedReportResult | null
    if (!body || typeof body !== 'object' || !('status' in body)) {
      return { status: 'error', message: `Unexpected response (${res.status})` }
    }
    if (body.status === 'ok') {
      // Signed photo URLs arrive relative to the Supabase API.
      body.photos = Object.fromEntries(
        Object.entries(body.photos ?? {}).map(([id, u]) => [id, new URL(u, `${supabaseConfig.url}/`).toString()]),
      )
    }
    return body
  } catch {
    return { status: 'error', message: 'Could not reach the server. Check your connection and try again.' }
  }
}
