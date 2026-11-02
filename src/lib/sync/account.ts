import { wipeLocalData } from '../db'
import { getSupabase } from '../share/supabase'
import { flush, stopSync } from './engine'

/**
 * Number of local changes that could not be uploaded (0 = everything is safe on the server).
 * Used before sign-out, which removes the diary from this device.
 */
export async function unsyncedChanges(): Promise<number> {
  if (!navigator.onLine) return (await import('../db')).db.outbox.count()
  return flush()
}

/**
 * Sign out and remove the diary from this device, so a shared or lent device keeps nothing.
 * Callers flush first (`unsyncedChanges`) and warn when changes would be lost.
 */
export async function signOutAndWipe(everywhere = false): Promise<void> {
  stopSync()
  const sb = await getSupabase()
  // Local data goes first: even if the network call fails the device keeps nothing.
  await wipeLocalData()
  await sb.auth.signOut({ scope: everywhere ? 'global' : 'local' }).catch(() => {})
}
