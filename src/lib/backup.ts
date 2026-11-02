import { z } from 'zod'
import { db, DEFAULT_SETTINGS } from './db'
import { blobToDataUrl, dataUrlToBlob } from './images'
import type { DiaryEntry, Food, MealTemplate, Photo, Settings, ShareLinkRecord } from './types'

export const BACKUP_FORMAT = 'mealjournal-backup'
export const BACKUP_VERSION = 1

const id = z.string().min(1)
const dataUrl = z.string().startsWith('data:image/')

const foodSchema = z.looseObject({ id, name: z.string(), tags: z.array(z.string()), conversions: z.array(z.any()), ingredients: z.array(z.any()) })
const templateSchema = z.looseObject({ id, name: z.string(), items: z.array(z.looseObject({ id, name: z.string() })) })
const entrySchema = z.looseObject({
  id,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  name: z.string(),
  category: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'drink', 'other']),
  photoIds: z.array(z.string()),
  items: z.array(z.looseObject({ id, name: z.string() })),
})
const photoSchema = z.object({
  id,
  width: z.number().positive(),
  height: z.number().positive(),
  createdAt: z.number(),
  data: dataUrl,
  thumb: dataUrl,
})

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  foods: z.array(foodSchema),
  mealTemplates: z.array(templateSchema),
  entries: z.array(entrySchema),
  settings: z.looseObject({}).nullable(),
  shareLinks: z.array(z.looseObject({ id })).default([]),
  photos: z.array(photoSchema),
})

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  foods: Food[]
  mealTemplates: MealTemplate[]
  entries: DiaryEntry[]
  settings: Settings | null
  shareLinks: ShareLinkRecord[]
  photos: z.infer<typeof photoSchema>[]
}

export async function createBackup(onProgress?: (done: number, total: number) => void): Promise<BackupFile> {
  const [foods, mealTemplates, entries, settings, shareLinks, photoRows] = await Promise.all([
    db.foods.toArray(),
    db.mealTemplates.toArray(),
    db.entries.toArray(),
    db.settings.get('app'),
    db.shareLinks.toArray(),
    db.photos.toArray(),
  ])
  const photos: BackupFile['photos'] = []
  for (const [i, p] of photoRows.entries()) {
    photos.push({
      id: p.id,
      width: p.width,
      height: p.height,
      createdAt: p.createdAt,
      data: await blobToDataUrl(p.blob),
      thumb: await blobToDataUrl(p.thumb),
    })
    onProgress?.(i + 1, photoRows.length)
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    foods,
    mealTemplates,
    entries,
    settings: settings ?? null,
    shareLinks,
    photos,
  }
}

export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('This file is not valid JSON.')
  }
  const result = backupSchema.safeParse(raw)
  if (!result.success) {
    const first = result.error.issues[0]
    throw new Error(
      `This is not a valid MealJournal backup${first ? ` (${first.path.join('.') || 'file'}: ${first.message})` : ''}.`,
    )
  }
  // The schema checks structure; records keep any extra fields from newer versions.
  return result.data as unknown as BackupFile
}

export interface BackupStats {
  foods: number
  mealTemplates: number
  entries: number
  photos: number
}

export function backupStats(b: BackupFile): BackupStats {
  return { foods: b.foods.length, mealTemplates: b.mealTemplates.length, entries: b.entries.length, photos: b.photos.length }
}

/** Replace all local data with the backup's contents, atomically. */
export async function restoreBackup(b: BackupFile): Promise<BackupStats> {
  const photos: Photo[] = []
  for (const p of b.photos) {
    photos.push({
      id: p.id,
      width: p.width,
      height: p.height,
      createdAt: p.createdAt,
      blob: await dataUrlToBlob(p.data),
      thumb: await dataUrlToBlob(p.thumb),
    })
  }
  const tables = [db.foods, db.mealTemplates, db.entries, db.photos, db.settings, db.shareLinks]
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()))
    await db.foods.bulkAdd(b.foods)
    await db.mealTemplates.bulkAdd(b.mealTemplates)
    await db.entries.bulkAdd(b.entries)
    await db.photos.bulkAdd(photos)
    await db.shareLinks.bulkAdd(b.shareLinks)
    await db.settings.put({ ...DEFAULT_SETTINGS, ...b.settings, id: 'app' })
  })
  return backupStats(b)
}

export function backupFilename(): string {
  return `mealjournal-backup-${new Date().toISOString().slice(0, 10)}.json`
}
