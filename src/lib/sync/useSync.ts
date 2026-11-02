import { useSyncExternalStore } from 'react'
import { getSyncState, subscribeSync, type SyncState } from './engine'

export function useSync(): SyncState {
  return useSyncExternalStore(subscribeSync, getSyncState, getSyncState)
}

/** "Synced just now", "Offline – 3 changes will sync later", … */
export function describeSync(s: SyncState, now = Date.now()): string {
  const n = s.pending
  switch (s.status) {
    case 'offline':
      return n ? `Offline – ${n === 1 ? '1 change' : `${n} changes`} will sync later` : 'Offline – changes will sync later'
    case 'syncing':
      return s.progress ? `${s.progress.label}${s.progress.total ? ` (${s.progress.done}/${s.progress.total})` : ` (${s.progress.done})`}…` : 'Syncing…'
    case 'error':
      return `Could not sync – will retry${s.error ? ` (${s.error})` : ''}`
    case 'synced':
    case 'off': {
      if (!s.lastSyncedAt) return s.status === 'off' ? 'Not syncing' : 'Synced'
      const min = Math.floor((now - s.lastSyncedAt) / 60_000)
      return min < 1 ? 'Synced just now' : min < 60 ? `Synced ${min} min ago` : `Synced ${Math.floor(min / 60)} h ago`
    }
  }
}
