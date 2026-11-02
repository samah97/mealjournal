// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../src/lib/db'
import { newFood, saveEntry, saveFood } from '../src/lib/repo'
import { uid } from '../src/lib/utils'

// jsdom cannot encode images; replace the blob <-> data URL helpers with simple stand-ins.
vi.mock('../src/lib/images', () => ({
  blobToDataUrl: async (b: Blob) => `data:image/jpeg;base64,${btoa(await b.text())}`,
  dataUrlToBlob: async (s: string) => new Blob([atob(s.split(',')[1]!)], { type: 'image/jpeg' }),
}))

const { createBackup, parseBackup, restoreBackup } = await import('../src/lib/backup')

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('backup & restore', () => {
  it('round-trips foods, entries and photos', async () => {
    await saveFood(newFood({ name: 'Halloumi' }))
    const photo = { id: uid(), blob: new Blob(['full']), thumb: new Blob(['th']), width: 4, height: 3, createdAt: 1 }
    await saveEntry(
      {
        id: uid(),
        date: '2026-11-02',
        time: '09:00',
        category: 'breakfast',
        name: 'Halloumi',
        photoIds: [photo.id],
        items: [],
        source: { kind: 'free' },
        createdAt: 1,
        updatedAt: 1,
      },
      [photo],
    )

    const text = JSON.stringify(await createBackup())
    await Promise.all(db.tables.map((t) => t.clear()))
    expect(await db.entries.count()).toBe(0)

    const stats = await restoreBackup(parseBackup(text))
    expect(stats).toEqual({ foods: 1, mealTemplates: 0, entries: 1, photos: 1 })
    expect((await db.foods.toArray())[0]!.name).toBe('Halloumi')
    const restored = await db.photos.get(photo.id)
    expect(await restored!.blob.text()).toBe('full')
  })

  it('rejects files that are not MealJournal backups', () => {
    expect(() => parseBackup('not json')).toThrow(/not valid JSON/)
    expect(() => parseBackup('{"format":"other"}')).toThrow(/not a valid MealJournal backup/)
  })
})
