/**
 * Pure sync rules: what is synced, how records are serialised for the server, and
 * which side wins a conflict (last writer wins per record, deletes are tombstones).
 */
import type { Food, Photo, Settings, ShareLinkRecord } from '../types'

export const SYNCED_COLLECTIONS = ['foods', 'mealTemplates', 'entries', 'photos', 'settings', 'shareLinks'] as const
export type Collection = (typeof SYNCED_COLLECTIONS)[number]

export function isSyncedCollection(name: string): name is Collection {
  return (SYNCED_COLLECTIONS as readonly string[]).includes(name)
}

/** A local change waiting to be pushed. One row per record (later changes overwrite). */
export interface OutboxItem {
  collection: Collection
  recordId: string
  op: 'put' | 'delete'
  /** Time of the latest local change (ms). Used as the record's LWW timestamp. */
  queuedAt: number
}

/** A row as stored in `sync_records`. */
export interface RemoteRecord {
  collection: Collection
  record_id: string
  seq: number
  updated_at: number
  deleted: boolean
  data: Record<string, unknown> | null
}

export type PushRecord = Pick<RemoteRecord, 'collection' | 'record_id' | 'updated_at' | 'deleted' | 'data'>

/** Photo metadata as synced; the image files travel separately via storage. */
export type PhotoMeta = Omit<Photo, 'blob' | 'thumb'>

/** Fields that stay on this device and are never uploaded. */
const PER_DEVICE_SETTINGS = ['onboarded'] as const

/** Record → JSON for the server: no blobs, no per-device fields, no `undefined`. */
export function toRemoteData(collection: Collection, record: object): Record<string, unknown> {
  let out: Record<string, unknown> = { ...(record as Record<string, unknown>) }
  if (collection === 'photos') {
    const { blob: _b, thumb: _t, ...meta } = out
    out = meta
  }
  if (collection === 'settings') for (const k of PER_DEVICE_SETTINGS) delete out[k]
  // The raw link (with its secret token) stays on the device that created it: the server only
  // ever knows the token hash. View counts are read from the server by each device.
  if (collection === 'shareLinks') {
    delete out.url
    delete out.viewCount
  }
  return JSON.parse(JSON.stringify(out)) as Record<string, unknown>
}

/** Server JSON → local record (photos excluded: they need their files first). */
export function fromRemoteData<T>(collection: Collection, data: Record<string, unknown>, local?: unknown): T {
  if (collection === 'settings') {
    const keep = Object.fromEntries(
      PER_DEVICE_SETTINGS.map((k) => [k, (local as Partial<Settings> | undefined)?.[k] ?? false]),
    )
    return { ...data, ...keep, id: 'app' } as T
  }
  if (collection === 'shareLinks') {
    const l = local as Partial<ShareLinkRecord> | undefined
    return { ...data, url: l?.url, viewCount: l?.viewCount } as T
  }
  return data as T
}

/** What to push for a pending change, given the record's current local row (if any). */
export function toPushRecord(item: OutboxItem, current: object | undefined): PushRecord {
  if (!current) {
    return { collection: item.collection, record_id: item.recordId, updated_at: item.queuedAt, deleted: true, data: null }
  }
  return {
    collection: item.collection,
    record_id: item.recordId,
    updated_at: item.queuedAt,
    deleted: false,
    data: toRemoteData(item.collection, current),
  }
}

/**
 * Should a pulled server version replace the local one? Without a pending local change
 * the local copy is already synced, so the server (which only moves forward) wins.
 * With one, the newer change wins; on a tie we keep ours (it is usually our own echo).
 */
export function remoteWins(remote: Pick<RemoteRecord, 'updated_at'>, pending: Pick<OutboxItem, 'queuedAt'> | undefined): boolean {
  return !pending || remote.updated_at > pending.queuedAt
}

/** Starter foods this device made but never used – dropped before joining an account that has data. */
export function unusedStarterFoods(foods: Food[]): Food[] {
  return foods.filter((f) => f.isExample && f.useCount === 0 && !f.lastUsedAt)
}

export function photoPaths(ownerId: string, photoId: string): { full: string; thumb: string } {
  return { full: `${ownerId}/${photoId}.jpg`, thumb: `${ownerId}/${photoId}.thumb.jpg` }
}

/** Retry delay after `failures` consecutive failed syncs: 5 s, 10 s, 20 s … capped at 5 minutes. */
export function backoffDelay(failures: number): number {
  if (failures <= 0) return 0
  return Math.min(5_000 * 2 ** (failures - 1), 300_000)
}

export type BindingAction =
  /** The local diary already belongs to this account. */
  | 'ready'
  /** Empty device: bind it and download the account's diary. */
  | 'bind'
  /** Diary from before accounts existed: ask whether to move it into the account. */
  | 'ask-migrate'
  /** Leftovers of another account: wipe them before syncing, so diaries never mix. */
  | 'wipe'

export function bindingAction(boundAccountId: string | undefined, userId: string, hasLocalData: boolean): BindingAction {
  if (boundAccountId === userId) return 'ready'
  if (boundAccountId) return 'wipe'
  return hasLocalData ? 'ask-migrate' : 'bind'
}
