// Supabase Edge Function: returns ONE shared report for a valid share token.
// Deploy with JWT verification disabled (see supabase/config.toml) so recipients
// need no account. Uses the service-role key, which only exists server-side.
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  evaluateAccess,
  hashPin,
  hashToken,
  isAllowedPhotoPath,
  photoIdFromPath,
  PIN_MAX_ATTEMPTS,
  SIGNED_URL_TTL_SECONDS,
  timingSafeEqual,
  TOKEN_PATTERN,
  type ShareRow,
} from '../_shared/access.ts'

const BUCKET = 'report-photos'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, content-type, x-client-info, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer',
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

type Row = ShareRow & { payload: unknown; view_count: number }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return json(405, { status: 'error', message: 'Method not allowed' })

  let token = ''
  let pin: string | undefined
  try {
    const body = await req.json()
    token = typeof body?.token === 'string' ? body.token : ''
    pin = typeof body?.pin === 'string' && body.pin.length > 0 ? body.pin.slice(0, 32) : undefined
  } catch {
    return json(400, { status: 'error', message: 'Invalid request' })
  }
  if (!TOKEN_PATTERN.test(token)) return json(404, { status: 'unavailable' })

  const { data, error } = await admin
    .from('shared_reports')
    .select(
      'id, owner_id, payload, photo_paths, expires_at, revoked_at, pin_hash, pin_salt, pin_iterations, failed_pin_attempts, last_failed_pin_at, view_count',
    )
    .eq('token_hash', await hashToken(token))
    .maybeSingle<Row>()
  if (error) return json(500, { status: 'error', message: 'Could not load report' })

  const now = new Date()
  const decision = evaluateAccess(data, now, pin !== undefined)
  if (decision.kind === 'unavailable') return json(404, { status: 'unavailable' })
  if (decision.kind === 'locked') return json(429, { status: 'locked', retryAfterSeconds: decision.retryAfterSeconds })
  if (decision.kind === 'pin_required') return json(401, { status: 'pin_required' })

  const row = data!
  if (decision.kind === 'verify_pin') {
    const computed = await hashPin(pin!, row.pin_salt!, row.pin_iterations ?? undefined)
    if (!timingSafeEqual(computed, row.pin_hash!)) {
      const failures = decision.priorFailures + 1
      await admin
        .from('shared_reports')
        .update({ failed_pin_attempts: failures, last_failed_pin_at: now.toISOString() })
        .eq('id', row.id)
      return json(401, { status: 'pin_invalid', attemptsLeft: Math.max(0, PIN_MAX_ATTEMPTS - failures) })
    }
  }

  const paths = (row.photo_paths ?? []).filter((p) => isAllowedPhotoPath(row, p))
  const photos: Record<string, string> = {}
  if (paths.length) {
    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
    // Return paths relative to the API: the client prefixes its own public Supabase URL, which
    // can differ from the internal URL this function sees (e.g. http://kong:8000 locally).
    for (const s of signed ?? []) {
      if (!s.signedUrl || !s.path) continue
      const u = new URL(s.signedUrl)
      photos[photoIdFromPath(s.path)] = u.pathname + u.search
    }
  }

  await admin
    .from('shared_reports')
    .update({ view_count: row.view_count + 1, last_viewed_at: now.toISOString(), failed_pin_attempts: 0 })
    .eq('id', row.id)

  return json(200, { status: 'ok', report: row.payload, photos, expiresAt: row.expires_at })
})
