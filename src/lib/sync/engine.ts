/**
 * Sync engine: push the outbox → pull changes since the cursor → apply → fetch photos.
 * One run at a time (single flight); failures retry with backoff. Triggered on start,
 * when the app becomes visible or comes back online, shortly after a local change and
 * every minute while visible.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Table } from 'dexie'
import { db } from '../db'
import { processPendingRevocations } from '../share/api'
import { getSupabase } from '../share/supabase'
import type { Photo } from '../types'
import {
  backoffDelay,
  fromRemoteData,
  photoPaths,
  remoteWins,
  SYNCED_COLLECTIONS,
  toPushRecord,
  type Collection,
  type OutboxItem,
  type PhotoMeta,
  type PushRecord,
  type RemoteRecord,
} from './merge'
import { observeTimestamp, setChangeListener, skipTracking } from './tracking'

const BUCKET = 'sync-photos'
const PUSH_BATCH = 200
const PULL_BATCH = 500

// ---------------------------------------------------------------- state

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'offline' | 'error'

export interface SyncState {
  status: SyncStatus
  lastSyncedAt?: number
  error?: string
  /** Local changes not yet on the server. */
  pending: number
  /** Set while a large upload/download runs (first sync, moving a diary into the account). */
  progress?: { label: string; done: number; total?: number }
}

let state: SyncState = { status: 'off', pending: 0 }
const listeners = new Set<() => void>()

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function getSyncState(): SyncState {
  return state
}

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// ---------------------------------------------------------------- per-device metadata

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.syncMeta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.syncMeta.put({ key, value })
}

const table = (c: Collection) => db.table(c) as Table<{ id: string }, string>

// ---------------------------------------------------------------- apply

/** Apply server rows locally (last writer wins against pending local changes). */
async function applyRemote(rows: RemoteRecord[], cursor?: number): Promise<void> {
  if (!rows.length && cursor === undefined) return
  await db.transaction('rw', [...SYNCED_COLLECTIONS.map(table), db.outbox, db.syncMeta], async (tx) => {
    skipTracking(tx)
    const downloads = (await getMeta<Record<string, PhotoMeta>>('photoDownloads')) ?? {}
    for (const r of rows) {
      observeTimestamp(r.updated_at)
      const key: [string, string] = [r.collection, r.record_id]
      if (!remoteWins(r, await db.outbox.get(key))) continue
      await db.outbox.delete(key)
      const t = table(r.collection)
      if (r.deleted || !r.data) {
        // Photo deletes arrive as their own tombstones, so no reference counting here.
        await t.delete(r.record_id)
        delete downloads[r.record_id]
      } else if (r.collection === 'photos') {
        // Immutable: stored once its files are downloaded.
        if (!(await t.get(r.record_id))) downloads[r.record_id] = r.data as unknown as PhotoMeta
      } else {
        const local = r.collection === 'settings' || r.collection === 'shareLinks' ? await t.get(r.record_id) : undefined
        await t.put(fromRemoteData(r.collection, r.data, local))
      }
    }
    await setMeta('photoDownloads', downloads)
    if (cursor !== undefined) await setMeta('cursor', cursor)
  })
}

// ---------------------------------------------------------------- push

async function uploadPhoto(sb: SupabaseClient, ownerId: string, photo: Photo): Promise<void> {
  const paths = photoPaths(ownerId, photo.id)
  for (const [path, blob] of [
    [paths.full, photo.blob],
    [paths.thumb, photo.thumb],
  ] as const) {
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
    // Photos are immutable: a file left by an earlier, interrupted push is fine.
    if (error && !/exists|duplicate/i.test(error.message)) throw new Error(`Photo upload failed: ${error.message}`)
  }
}

async function push(sb: SupabaseClient, ownerId: string): Promise<void> {
  const total = await db.outbox.count()
  let done = 0
  for (let round = 0; round < 1000; round++) {
    const items = await db.outbox.orderBy('queuedAt').limit(PUSH_BATCH).toArray()
    if (!items.length) return
    const records: PushRecord[] = []
    const removedPhotos: string[] = []
    for (const item of items) {
      const current = await table(item.collection).get(item.recordId)
      if (item.collection === 'photos') {
        if (current) await uploadPhoto(sb, ownerId, current as unknown as Photo)
        else removedPhotos.push(item.recordId)
      }
      records.push(toPushRecord(item, current))
    }

    const { data, error } = await sb.rpc('sync_push', { records })
    if (error) throw new Error(error.message)
    const rejected = (data ?? []) as RemoteRecord[]

    if (removedPhotos.length) {
      const paths = removedPhotos.flatMap((id) => Object.values(photoPaths(ownerId, id)))
      await sb.storage.from(BUCKET).remove(paths)
    }
    // The server had something newer: adopt it.
    await applyRemote(rejected)
    // Done, unless the record changed again while we were pushing.
    await db.transaction('rw', db.outbox, async () => {
      for (const item of items) {
        const key: [string, string] = [item.collection, item.recordId]
        if ((await db.outbox.get(key))?.queuedAt === item.queuedAt) await db.outbox.delete(key)
      }
    })
    done += items.length
    if (total > PUSH_BATCH) setState({ progress: { label: 'Uploading your diary', done: Math.min(done, total), total } })
    if (items.length < PUSH_BATCH) return
  }
}

// ---------------------------------------------------------------- pull

async function pull(sb: SupabaseClient): Promise<void> {
  let cursor = (await getMeta<number>('cursor')) ?? 0
  const first = cursor === 0
  let done = 0
  for (;;) {
    const { data, error } = await sb
      .from('sync_records')
      .select('collection, record_id, seq, updated_at, deleted, data')
      .gt('seq', cursor)
      .order('seq')
      .limit(PULL_BATCH)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as RemoteRecord[]
    if (!rows.length) return
    cursor = rows[rows.length - 1]!.seq
    await applyRemote(rows, cursor)
    done += rows.length
    if (first) setState({ progress: { label: 'Downloading your diary', done } })
    if (rows.length < PULL_BATCH) return
  }
}

/** Photos whose records arrived before their files. Failures stay queued for the next run. */
async function downloadPhotos(sb: SupabaseClient, ownerId: string): Promise<void> {
  const pending = (await getMeta<Record<string, PhotoMeta>>('photoDownloads')) ?? {}
  for (const meta of Object.values(pending)) {
    const paths = photoPaths(ownerId, meta.id)
    const [full, thumb] = await Promise.all([
      sb.storage.from(BUCKET).download(paths.full),
      sb.storage.from(BUCKET).download(paths.thumb),
    ])
    if (!full.data || !thumb.data) continue
    const photo: Photo = { ...meta, blob: full.data, thumb: thumb.data }
    await db.transaction('rw', [db.photos, db.syncMeta], async (tx) => {
      skipTracking(tx)
      const now = (await getMeta<Record<string, PhotoMeta>>('photoDownloads')) ?? {}
      if (!now[meta.id]) return // deleted meanwhile
      await db.photos.put(photo)
      delete now[meta.id]
      await setMeta('photoDownloads', now)
    })
  }
}

// ---------------------------------------------------------------- run

let running: Promise<void> | null = null
let again = false
let failures = 0
let retryTimer: ReturnType<typeof setTimeout> | undefined
let enabled = false

async function runOnce(): Promise<void> {
  if (!navigator.onLine) {
    setState({ status: 'offline', pending: await db.outbox.count() })
    return
  }
  const sb = await getSupabase()
  const user = (await sb.auth.getSession()).data.session?.user
  if (!user || (await getMeta<string>('accountId')) !== user.id) {
    setState({ status: 'off' })
    return
  }
  setState({ status: 'syncing', error: undefined })
  try {
    await push(sb, user.id)
    await pull(sb)
    await downloadPhotos(sb, user.id)
    await processPendingRevocations()
    failures = 0
    const now = Date.now()
    await setMeta('lastSyncedAt', now)
    setState({ status: 'synced', lastSyncedAt: now, progress: undefined, pending: await db.outbox.count() })
  } catch (e) {
    failures++
    setState({
      status: navigator.onLine ? 'error' : 'offline',
      error: (e as Error).message,
      progress: undefined,
      pending: await db.outbox.count(),
    })
    clearTimeout(retryTimer)
    if (enabled) retryTimer = setTimeout(() => void syncNow(), backoffDelay(failures))
  }
}

/** Run a sync now (or once more right after the current one). Never throws. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    do {
      again = false
      await runOnce().catch((e: unknown) => setState({ status: 'error', error: (e as Error).message }))
    } while (again)
  })().finally(() => {
    running = null
  })
  return running
}

// ---------------------------------------------------------------- scheduling

let debounce: ReturnType<typeof setTimeout> | undefined
let stopFns: (() => void)[] = []

/** Start background syncing for the bound account. Returns a stop function. */
export function startSync(): () => void {
  stopSync()
  enabled = true
  void getMeta<number>('lastSyncedAt').then((t) => t && !state.lastSyncedAt && setState({ lastSyncedAt: t }))

  const onVisible = () => document.visibilityState === 'visible' && void syncNow()
  const onOnline = () => void syncNow()
  const onOffline = () => setState({ status: 'offline' })
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  const interval = setInterval(() => document.visibilityState === 'visible' && void syncNow(), 60_000)
  setChangeListener(() => {
    setState({ pending: state.pending + 1 })
    clearTimeout(debounce)
    debounce = setTimeout(() => void syncNow(), 2_000)
  })

  stopFns = [
    () => document.removeEventListener('visibilitychange', onVisible),
    () => window.removeEventListener('online', onOnline),
    () => window.removeEventListener('offline', onOffline),
    () => clearInterval(interval),
    () => setChangeListener(undefined),
    () => clearTimeout(debounce),
    () => clearTimeout(retryTimer),
  ]
  void syncNow()
  return stopSync
}

export function stopSync(): void {
  enabled = false
  stopFns.forEach((f) => f())
  stopFns = []
  setState({ status: 'off', progress: undefined })
}

// ---------------------------------------------------------------- account binding

/** Does this device hold a diary (other than settings)? */
export async function hasLocalDiary(): Promise<boolean> {
  const counts = await Promise.all([db.entries, db.foods, db.mealTemplates, db.shareLinks].map((t) => t.count()))
  return counts.some((n) => n > 0)
}

export async function accountHasData(): Promise<boolean> {
  const sb = await getSupabase()
  const { data, error } = await sb.from('sync_records').select('record_id').limit(1)
  if (error) throw new Error(error.message)
  return (data ?? []).length > 0
}

/**
 * Bind this device's database to an account. With `migrate`, everything already on the
 * device is queued for upload (keeping the account's own settings if it has any);
 * otherwise the device starts empty and downloads the account's diary.
 */
export async function bindAccount(userId: string, migrate: boolean, dropFoods: string[] = []): Promise<void> {
  await db.transaction('rw', [...SYNCED_COLLECTIONS.map(table), db.outbox, db.syncMeta], async (tx) => {
    skipTracking(tx)
    await db.outbox.clear()
    if (migrate) {
      await db.foods.bulkDelete(dropFoods)
      const items: OutboxItem[] = []
      for (const c of SYNCED_COLLECTIONS) {
        const rows = (await table(c).toArray()) as { id: string; updatedAt?: number; createdAt?: number }[]
        for (const r of rows) {
          // Original timestamps: an account that already has newer versions keeps them.
          items.push({ collection: c, recordId: r.id, op: 'put', queuedAt: r.updatedAt ?? r.createdAt ?? 1 })
        }
      }
      await db.outbox.bulkPut(items)
    }
    await db.syncMeta.bulkPut([
      { key: 'accountId', value: userId },
      { key: 'cursor', value: 0 },
      { key: 'photoDownloads', value: {} },
    ])
  })
}

/** Push whatever is pending; returns the number of changes still not on the server. */
export async function flush(): Promise<number> {
  await syncNow()
  return db.outbox.count()
}

export function isPhotoMissing(id: string): Promise<boolean> {
  return getMeta<Record<string, PhotoMeta>>('photoDownloads').then((d) => !!d?.[id])
}
