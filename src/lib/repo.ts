import { nowInZone } from './datetime'
import { db, getSettings } from './db'
import { entryFromFood, favouriteFoodFromEntry } from './snapshot'
import type { DiaryEntry, Food, MealTemplate, Photo } from './types'
import { deepCopy, uid } from './utils'

/** Delete the given photos unless something still references them. */
async function releasePhotos(candidates: (string | undefined)[]): Promise<void> {
  const ids = new Set(candidates.filter((x): x is string => !!x))
  if (ids.size === 0) return
  await db.foods.each((f) => f.photoId && ids.delete(f.photoId))
  await db.mealTemplates.each((t) => t.photoId && ids.delete(t.photoId))
  await db.entries.each((e) => e.photoIds.forEach((p) => ids.delete(p)))
  if (ids.size) await db.photos.bulkDelete([...ids])
}

const ALL = () => [db.foods, db.mealTemplates, db.entries, db.photos]

// ---------------------------------------------------------------- foods

export async function saveFood(food: Food, newPhotos: Photo[] = []): Promise<void> {
  await db.transaction('rw', ALL(), async () => {
    const previous = await db.foods.get(food.id)
    if (newPhotos.length) await db.photos.bulkPut(newPhotos)
    await db.foods.put({ ...food, updatedAt: Date.now() })
    if (previous?.photoId && previous.photoId !== food.photoId) await releasePhotos([previous.photoId])
  })
}

export async function deleteFood(id: string): Promise<void> {
  await db.transaction('rw', ALL(), async () => {
    const food = await db.foods.get(id)
    await db.foods.delete(id)
    await releasePhotos([food?.photoId])
  })
}

export async function toggleFoodFavourite(id: string): Promise<void> {
  const f = await db.foods.get(id)
  if (f) await db.foods.update(id, { favourite: !f.favourite })
}

/** The library food an entry was logged from, or a library food with the same name. */
export async function libraryFoodForEntry(entry: DiaryEntry): Promise<Food | undefined> {
  const linkedId = entry.source.kind === 'food' ? entry.source.refId : entry.items.length === 1 ? entry.items[0]!.sourceFoodId : undefined
  const linked = linkedId ? await db.foods.get(linkedId) : undefined
  if (linked) return linked
  const name = entry.name.trim().toLowerCase()
  return db.foods.filter((f) => f.name.trim().toLowerCase() === name).first()
}

/**
 * Mark what an entry was as a favourite: its library food if it still exists,
 * otherwise a new library food made from the entry. The entry itself is unchanged.
 */
export async function favouriteFromEntry(entry: DiaryEntry): Promise<Food> {
  const linked = await libraryFoodForEntry(entry)
  if (linked) {
    if (!linked.favourite) await db.foods.update(linked.id, { favourite: true })
    return { ...linked, favourite: true }
  }
  const food = newFood(favouriteFoodFromEntry(entry))
  await saveFood(food)
  return food
}

/** Log a library food right now with its default serving (one-tap logging of favourites). */
export async function quickLogFood(foodId: string): Promise<DiaryEntry | undefined> {
  const food = await db.foods.get(foodId)
  if (!food) return undefined
  const settings = await getSettings()
  const entry = entryFromFood(food, nowInZone(settings.timeZone))
  await saveEntry(entry)
  return entry
}

export function newFood(partial: Partial<Food> = {}): Food {
  const now = Date.now()
  return {
    id: uid(),
    name: '',
    tags: [],
    conversions: [],
    ingredients: [],
    favourite: false,
    useCount: 0,
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

// ---------------------------------------------------------------- meal templates

export async function saveTemplate(t: MealTemplate, newPhotos: Photo[] = []): Promise<void> {
  await db.transaction('rw', ALL(), async () => {
    const previous = await db.mealTemplates.get(t.id)
    if (newPhotos.length) await db.photos.bulkPut(newPhotos)
    await db.mealTemplates.put({ ...t, updatedAt: Date.now() })
    if (previous?.photoId && previous.photoId !== t.photoId) await releasePhotos([previous.photoId])
  })
}

export async function deleteTemplate(id: string): Promise<void> {
  await db.transaction('rw', ALL(), async () => {
    const t = await db.mealTemplates.get(id)
    await db.mealTemplates.delete(id)
    await releasePhotos([t?.photoId])
  })
}

export async function duplicateTemplate(id: string): Promise<string | undefined> {
  const t = await db.mealTemplates.get(id)
  if (!t) return undefined
  const now = Date.now()
  const copy: MealTemplate = {
    ...deepCopy(t),
    id: uid(),
    name: `${t.name} (copy)`,
    items: t.items.map((i) => ({ ...deepCopy(i), id: uid() })),
    useCount: 0,
    lastUsedAt: undefined,
    createdAt: now,
    updatedAt: now,
  }
  await db.mealTemplates.add(copy)
  return copy.id
}

export function newTemplate(partial: Partial<MealTemplate> = {}): MealTemplate {
  const now = Date.now()
  return {
    id: uid(),
    name: '',
    category: 'lunch',
    items: [],
    favourite: false,
    useCount: 0,
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

// ---------------------------------------------------------------- diary entries

/** Save an entry and record usage of the library items it came from. */
export async function saveEntry(entry: DiaryEntry, newPhotos: Photo[] = []): Promise<void> {
  await db.transaction('rw', ALL(), async () => {
    const previous = await db.entries.get(entry.id)
    if (newPhotos.length) await db.photos.bulkPut(newPhotos)
    await db.entries.put({ ...entry, updatedAt: Date.now() })
    if (previous) {
      const removed = previous.photoIds.filter((p) => !entry.photoIds.includes(p))
      await releasePhotos(removed)
    } else {
      const now = Date.now()
      const foodIds = new Set(entry.items.map((i) => i.sourceFoodId).filter((x): x is string => !!x))
      for (const id of foodIds) {
        await db.foods.where('id').equals(id).modify((f) => {
          f.useCount += 1
          f.lastUsedAt = now
        })
      }
      if (entry.source.kind === 'meal' && entry.source.refId) {
        await db.mealTemplates.where('id').equals(entry.source.refId).modify((t) => {
          t.useCount += 1
          t.lastUsedAt = now
        })
      }
    }
  })
}

export async function deleteEntry(id: string): Promise<void> {
  await db.transaction('rw', ALL(), async () => {
    const e = await db.entries.get(id)
    await db.entries.delete(id)
    if (e) await releasePhotos(e.photoIds)
  })
}

/** Exact copy (including photos) at a new date/time. */
export async function duplicateEntry(id: string, at: { date: string; time: string }): Promise<string | undefined> {
  const e = await db.entries.get(id)
  if (!e) return undefined
  const now = Date.now()
  const copy: DiaryEntry = {
    ...deepCopy(e),
    id: uid(),
    date: at.date,
    time: at.time,
    items: e.items.map((i) => ({ ...deepCopy(i), id: uid() })),
    createdAt: now,
    updatedAt: now,
  }
  await db.entries.add(copy)
  return copy.id
}

export async function moveEntry(id: string, date: string, time: string): Promise<void> {
  await db.entries.update(id, { date, time, updatedAt: Date.now() })
}

export async function entriesBetween(start: string, end: string): Promise<DiaryEntry[]> {
  return db.entries.where('[date+time]').between([start, '00:00'], [end, '99:99'], true, true).toArray()
}

export function sortEntries(entries: DiaryEntry[]): DiaryEntry[] {
  return [...entries].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.createdAt - b.createdAt)
}

// ---------------------------------------------------------------- everything

export async function deleteAllData(): Promise<void> {
  await db.transaction('rw', [...ALL(), db.settings, db.shareLinks], async () => {
    await Promise.all([...ALL(), db.settings, db.shareLinks].map((t) => t.clear()))
  })
}
