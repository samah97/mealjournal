import Dexie, { type EntityTable } from 'dexie'
import type { DiaryEntry, Food, MealTemplate, Photo, Settings, ShareLinkRecord } from './types'
import { DEFAULT_TIME_ZONE } from './datetime'
import type { OutboxItem } from './sync/merge'
import { skipTracking, trackingMiddleware } from './sync/tracking'

/** Per-device sync state: accountId, cursor, lastSyncedAt, photoDownloads … */
export interface SyncMetaRow {
  key: string
  value: unknown
}

export class MealJournalDB extends Dexie {
  foods!: EntityTable<Food, 'id'>
  mealTemplates!: EntityTable<MealTemplate, 'id'>
  entries!: EntityTable<DiaryEntry, 'id'>
  photos!: EntityTable<Photo, 'id'>
  settings!: EntityTable<Settings, 'id'>
  shareLinks!: EntityTable<ShareLinkRecord, 'id'>
  outbox!: Dexie.Table<OutboxItem, [string, string]>
  syncMeta!: EntityTable<SyncMetaRow, 'key'>

  constructor(name = 'mealjournal') {
    super(name)
    // Schema migrations: add a new version() block for every change, never edit an old one.
    this.version(1).stores({
      foods: 'id, name, updatedAt, lastUsedAt',
      mealTemplates: 'id, name, updatedAt, lastUsedAt',
      entries: 'id, date, [date+time], updatedAt',
      photos: 'id, createdAt',
      settings: 'id',
      shareLinks: 'id, createdAt',
    })
    // Device sync: pending local changes (one row per record) and per-device sync state.
    this.version(2).stores({
      outbox: '[collection+recordId], queuedAt',
      syncMeta: 'key',
    })
    this.use(trackingMiddleware)
  }
}

export const db = new MealJournalDB()

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  timeZone: DEFAULT_TIME_ZONE,
  reportOptions: {
    includePhotos: true,
    includeIngredients: true,
    includeNotes: true,
    includeNutrition: false,
    includeSummaries: false,
  },
  showNutritionOnHome: false,
  onboarded: false,
}

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('app')
  return { ...DEFAULT_SETTINGS, ...s, reportOptions: { ...DEFAULT_SETTINGS.reportOptions, ...s?.reportOptions } }
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, id: 'app' })
}

/**
 * Mark this device as set up without queueing a sync: `onboarded` is per-device, and an
 * upload here would overwrite the account's settings with this device's defaults.
 */
export async function markOnboarded(): Promise<void> {
  await db.transaction('rw', db.settings, async (tx) => {
    skipTracking(tx)
    await db.settings.put({ ...(await getSettings()), onboarded: true, id: 'app' })
  })
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}

/** Remove the whole diary and sync state from this device (sign-out, account switch). */
export async function wipeLocalData(): Promise<void> {
  await db.transaction('rw', db.tables, async (tx) => {
    skipTracking(tx)
    await Promise.all(db.tables.map((t) => t.clear()))
  })
}
