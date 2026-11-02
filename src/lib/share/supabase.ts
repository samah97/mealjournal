import type { SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as
  | string
  | undefined

export const supabaseConfig = { url: url?.replace(/\/$/, ''), key }

/** Online sharing needs a Supabase project; everything else works without it. */
export function isSharingConfigured(): boolean {
  return !!(supabaseConfig.url && supabaseConfig.key)
}

let client: Promise<SupabaseClient> | null = null

/** Lazily loaded so the Supabase SDK never ships to users who don't share. */
export function getSupabase(): Promise<SupabaseClient> {
  if (!isSharingConfigured()) return Promise.reject(new Error('Online sharing is not configured.'))
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(supabaseConfig.url!, supabaseConfig.key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    }),
  )
  return client
}
