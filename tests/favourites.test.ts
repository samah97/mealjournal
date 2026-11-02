import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/lib/db'
import { deleteEntry, favouriteFromEntry, libraryFoodForEntry, newFood, quickLogFood, saveEntry, saveFood } from '../src/lib/repo'
import { entryFromFood, favouriteFoodFromEntry } from '../src/lib/snapshot'
import type { DiaryEntry, Photo } from '../src/lib/types'
import { uid } from '../src/lib/utils'

function entry(partial: Partial<DiaryEntry>): DiaryEntry {
  const now = Date.now()
  return { id: uid(), date: '2026-11-02', time: '08:00', category: 'drink', name: 'x', photoIds: [], items: [], source: { kind: 'free' }, createdAt: now, updatedAt: now, ...partial }
}

const photo = (): Photo => ({ id: uid(), blob: new Blob(['x']), thumb: new Blob(['x']), width: 1, height: 1, createdAt: 0 })

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('entryFromFood', () => {
  it('uses the food photo by default and treats Drinks as drinks', () => {
    const coffee = newFood({ name: 'Coffee', category: 'Drinks', photoId: 'p1', defaultServing: { amount: 200, unit: 'ml' } })
    const e = entryFromFood(coffee, { date: '2026-11-02', time: '12:30' })
    expect(e.photoIds).toEqual(['p1'])
    expect(e.category).toBe('drink')
    expect(e.items[0]).toMatchObject({ name: 'Coffee', amount: 200, unit: 'ml', sourceFoodId: coffee.id })
    expect(e.source).toMatchObject({ kind: 'food', refId: coffee.id })
  })

  it('has no photo when the food has none, and suggests a category by time', () => {
    const e = entryFromFood(newFood({ name: 'Toast' }), { date: '2026-11-02', time: '08:00' })
    expect(e.photoIds).toEqual([])
    expect(e.category).toBe('breakfast')
  })
})

describe('favouriteFoodFromEntry', () => {
  it('keeps the single item serving and nutrition without inventing values', () => {
    const f = favouriteFoodFromEntry(
      entry({
        name: 'Coffee',
        photoIds: ['p1'],
        items: [{ id: 'i', name: 'Coffee', amount: 250, unit: 'ml', ingredients: [], conversions: [], nutrition: { basis: 'per100ml', values: { energyKcal: 2 }, extras: [] } }],
      }),
    )
    expect(f).toMatchObject({ name: 'Coffee', category: 'Drinks', favourite: true, photoId: 'p1', defaultServing: { amount: 250, unit: 'ml' } })
    expect(f.nutrition?.values).toEqual({ energyKcal: 2 })
  })

  it('creates a plain favourite from a free-text entry', () => {
    const f = favouriteFoodFromEntry(entry({ name: 'Mint tea', category: 'snack' }))
    expect(f).toMatchObject({ name: 'Mint tea', favourite: true, conversions: [], ingredients: [] })
    expect(f.category).toBeUndefined()
    expect(f.nutrition).toBeUndefined()
    expect(f.defaultServing).toBeUndefined()
  })
})

describe('favourites in the library', () => {
  it('favourites the linked food instead of creating a new one', async () => {
    const coffee = newFood({ name: 'Coffee', category: 'Drinks' })
    await saveFood(coffee)
    const e = entryFromFood(coffee, { date: '2026-11-02', time: '09:00' })
    await saveEntry(e)
    const fav = await favouriteFromEntry(e)
    expect(fav.id).toBe(coffee.id)
    expect((await db.foods.get(coffee.id))?.favourite).toBe(true)
    expect(await db.foods.count()).toBe(1)
  })

  it('creates a favourite food once from a free entry and finds it again by name', async () => {
    const e = entry({ name: 'Espresso' })
    await saveEntry(e)
    const first = await favouriteFromEntry(e)
    const second = await favouriteFromEntry(entry({ name: ' espresso ' }))
    expect(second.id).toBe(first.id)
    expect(await db.foods.count()).toBe(1)
    expect((await libraryFoodForEntry(e))?.favourite).toBe(true)
    // History is untouched.
    expect((await db.entries.get(e.id))?.source).toEqual({ kind: 'free' })
  })

  it('quick-logs a favourite now with its photo, and undoing keeps the food photo', async () => {
    const p = photo()
    const coffee = newFood({ name: 'Coffee', category: 'Drinks', favourite: true, photoId: p.id })
    await saveFood(coffee, [p])
    const logged = await quickLogFood(coffee.id)
    expect(logged?.photoIds).toEqual([p.id])
    expect((await db.entries.get(logged!.id))?.category).toBe('drink')
    expect((await db.foods.get(coffee.id))?.useCount).toBe(1)
    await deleteEntry(logged!.id)
    expect(await db.photos.get(p.id)).toBeDefined()
  })
})
