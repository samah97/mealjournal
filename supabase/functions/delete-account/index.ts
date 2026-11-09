// Supabase Edge Function: permanently deletes the CALLER's account (GDPR right to erasure).
// JWT verification stays on: the account to delete is taken from the verified access token,
// never from the request. Photos are removed first (storage objects don't cascade), then the
// auth user, which cascades to sync_records, sync_cursor and shared_reports.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const BUCKETS = ['sync-photos', 'report-photos']
const PAGE = 1000

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, content-type, x-client-info, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Every object path below `prefix` (folders are listed recursively). */
async function listAll(sb: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: PAGE, offset })
    if (error) throw error
    for (const item of data) {
      const path = `${prefix}/${item.name}`
      // Folders have no id.
      if (item.id) paths.push(path)
      else paths.push(...(await listAll(sb, bucket, path)))
    }
    if (data.length < PAGE) return paths
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return json(405, { status: 'error', message: 'Method not allowed' })

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const { data, error } = await admin.auth.getUser(jwt)
  if (error || !data.user) return json(401, { status: 'error', message: 'Not signed in' })
  const uid = data.user.id

  try {
    for (const bucket of BUCKETS) {
      const paths = await listAll(admin, bucket, uid)
      for (let i = 0; i < paths.length; i += PAGE) {
        const { error: removeError } = await admin.storage.from(bucket).remove(paths.slice(i, i + PAGE))
        if (removeError) throw removeError
      }
    }
    const { error: deleteError } = await admin.auth.admin.deleteUser(uid)
    if (deleteError) throw deleteError
  } catch (e) {
    console.error('delete-account failed', e)
    return json(500, { status: 'error', message: 'Could not delete the account' })
  }
  return json(200, { status: 'deleted' })
})
