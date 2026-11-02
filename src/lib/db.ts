import Dexie, { type EntityTable } from 'dexie'
import type { DiaryEntry, Food, MealTemplate, Photo, Settings, ShareLinkRecord } from './types'
import { DEFAULT_TIME_ZONE } from './datetime'

export class MealJournalDB extends Dexie {
  foods!: EntityTable<Food, 'id'>
  mealTemplates!: EntityTable<MealTemplate, 'id'>
  entries!: EntityTable<DiaryEntry, 'id'>
  photos!: EntityTable<Photo, 'id'>
  settings!: EntityTable<Settings, 'id'>
  shareLinks!: EntityTable<ShareLinkRecord, 'id'>

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

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
