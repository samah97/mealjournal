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

/**
 * Permanently delete the account: its synced diary, photos and share links on the server
 * (Edge Function `delete-account`), then everything on this device. Other devices are
 * signed out the next time they talk to the server.
 */
export async function deleteAccountAndWipe(): Promise<void> {
  if (!navigator.onLine) throw new Error('You are offline. Connect to the internet to delete your account.')
  stopSync()
  const sb = await getSupabase()
  const { error } = await sb.functions.invoke('delete-account', { method: 'POST' })
  if (error) throw new Error('Could not delete your account. Please try again.')
  await wipeLocalData()
  await sb.auth.signOut({ scope: 'local' }).catch(() => {})
}
