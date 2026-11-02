import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/lib/db'
import { entryNutrition } from '../src/lib/nutrition'
import { deleteFood, newFood, newTemplate, saveEntry, saveFood, saveTemplate } from '../src/lib/repo'
import { foodToEntryItem, scaleEntryItems, templateToEntryItems } from '../src/lib/snapshot'
import type { DiaryEntry, Food } from '../src/lib/types'
import { uid } from '../src/lib/utils'

function entry(partial: Partial<DiaryEntry>): DiaryEntry {
  const now = Date.now()
  return { id: uid(), date: '2026-11-02', time: '08:00', category: 'breakfast', name: 'x', photoIds: [], items: [], source: { kind: 'free' }, createdAt: now, updatedAt: now, ...partial }
}

let labneh: Food, pita: Food, plain: Food

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  plain = newFood({ name: 'Homemade kibbeh' })
  labneh = newFood({ name: 'Labneh', defaultServing: { amount: 100, unit: 'g' }, nutrition: { basis: 'per100g', values: { energyKcal: 160, protein: 8 }, extras: [] } })
  pita = newFood({ name: 'Pita bread', defaultServing: { amount: 1, unit: 'piece' }, conversions: [{ unit: 'piece', amount: 60, base: 'g' }], nutrition: { basis: 'per100g', values: { energyKcal: 270, protein: 9 }, extras: [] } })
  for (const f of [plain, labneh, pita]) await saveFood(f)
})

describe('food library', () => {
  it('stores a food without any nutritional information', async () => {
    const stored = await db.foods.get(plain.id)
    expect(stored?.nutrition).toBeUndefined()
    expect(entryNutrition({ name: 'k', items: [foodToEntryItem(stored!)] }).hasAnyData).toBe(false)
  })

  it('stores a food with nutrition per 100 g and computes consumed values', async () => {
    const item = foodToEntryItem((await db.foods.get(labneh.id))!, { amount: 150, unit: 'g' })
    expect(entryNutrition({ name: 'l', items: [item] }).values.energyKcal).toBe(240)
  })
})

describe('meal templates and history', () => {
  it('logs a meal, adjusts quantities, and leaves the template untouched', async () => {
    const t = newTemplate({
      name: 'Lebanese breakfast',
      category: 'breakfast',
      items: [
        { id: uid(), foodId: labneh.id, name: 'Labneh', amount: 100, unit: 'g' },
        { id: uid(), foodId: pita.id, name: 'Pita bread', amount: 1, unit: 'piece' },
        { id: uid(), name: 'Cucumber', amount: 1, unit: 'piece' },
      ],
    })
    await saveTemplate(t)
    const foods = new Map((await db.foods.toArray()).map((f) => [f.id, f]))

    const items = templateToEntryItems(t, foods, 1)
    items[0]!.amount = 150 // ate more labneh today
    const e = entry({ name: t.name, items, source: { kind: 'meal', refId: t.id } })
    await saveEntry(e)

    const storedTemplate = await db.mealTemplates.get(t.id)
    expect(storedTemplate!.items[0]!.amount).toBe(100)
    expect(storedTemplate!.useCount).toBe(1)

    const n = entryNutrition((await db.entries.get(e.id))!)
    expect(n.values.energyKcal).toBeCloseTo(240 + 162)
    expect(n.incompleteKeys).toContain('energyKcal') // cucumber has no data
  })

  it('scales a whole meal by a portion factor', () => {
    const foods = new Map([[labneh.id, labneh]])
    const t = newTemplate({ items: [{ id: uid(), foodId: labneh.id, name: 'Labneh', amount: 100, unit: 'g' }] })
    expect(templateToEntryItems(t, foods, 0.5)[0]!.amount).toBe(50)
    expect(scaleEntryItems(templateToEntryItems(t, foods), 2)[0]!.amount).toBe(200)
  })

  it('editing a library food does not change historical diary entries', async () => {
    const e = entry({ name: 'Labneh', items: [foodToEntryItem(labneh, { amount: 100, unit: 'g' })], source: { kind: 'food', refId: labneh.id } })
    await saveEntry(e)
    await saveFood({ ...labneh, name: 'Labneh (light)', nutrition: { basis: 'per100g', values: { energyKcal: 90 }, extras: [] } })
    const stored = (await db.entries.get(e.id))!
    expect(stored.items[0]!.name).toBe('Labneh')
    expect(entryNutrition(stored).values.energyKcal).toBe(160)
  })

  it('deleting a library food keeps the diary entry intact', async () => {
    const e = entry({ name: 'Pita', items: [foodToEntryItem(pita)], source: { kind: 'food', refId: pita.id } })
    await saveEntry(e)
    await deleteFood(pita.id)
    const stored = (await db.entries.get(e.id))!
    expect(entryNutrition(stored).values.energyKcal).toBeCloseTo(162)
  })

  it('records usage for recent/favourite shortcuts', async () => {
    await saveEntry(entry({ items: [foodToEntryItem(labneh)], source: { kind: 'food', refId: labneh.id } }))
    const f = await db.foods.get(labneh.id)
    expect(f!.useCount).toBe(1)
    expect(f!.lastUsedAt).toBeTypeOf('number')
  })

  it('removes photos only when nothing references them', async () => {
    const photo = { id: uid(), blob: new Blob(['a']), thumb: new Blob(['b']), width: 10, height: 10, createdAt: 1 }
    const a = entry({ photoIds: [photo.id] })
    await saveEntry(a, [photo])
    const b = entry({ photoIds: [photo.id] })
    await saveEntry(b)
    await saveEntry({ ...a, photoIds: [] })
    expect(await db.photos.get(photo.id)).toBeDefined()
    await saveEntry({ ...b, photoIds: [] })
    expect(await db.photos.get(photo.id)).toBeUndefined()
  })
})
