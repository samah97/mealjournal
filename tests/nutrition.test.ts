import { describe, expect, it } from 'vitest'
import {
  combineSummaries,
  entryNutrition,
  incompletenessNote,
  isComplete,
  itemNutrition,
  nutritionFactor,
} from '../src/lib/nutrition'
import type { NutrientProfile } from '../src/lib/types'

const labneh: NutrientProfile = { basis: 'per100g', values: { energyKcal: 160, protein: 8, fat: 13, salt: 0.9 }, extras: [] }

describe('nutritionFactor', () => {
  it('scales per 100 g for metric mass units', () => {
    expect(nutritionFactor({ name: 'Labneh', amount: 50, unit: 'g', nutrition: labneh })).toBe(0.5)
    expect(nutritionFactor({ name: 'Labneh', amount: 0.2, unit: 'kg', nutrition: labneh })).toBe(2)
  })

  it('never assumes the weight of a piece, tablespoon or cup', () => {
    expect(nutritionFactor({ name: 'Pita', amount: 1, unit: 'piece', nutrition: labneh })).toBeNull()
    expect(nutritionFactor({ name: 'Oil', amount: 1, unit: 'tbsp', nutrition: labneh })).toBeNull()
  })

  it('uses user-defined conversions when present', () => {
    expect(
      nutritionFactor({
        name: 'Pita',
        amount: 2,
        unit: 'piece',
        nutrition: labneh,
        conversions: [{ unit: 'piece', amount: 60, base: 'g' }],
      }),
    ).toBeCloseTo(1.2)
  })

  it('does not convert between mass and volume', () => {
    expect(nutritionFactor({ name: 'Milk', amount: 200, unit: 'g', nutrition: { ...labneh, basis: 'per100ml' } })).toBeNull()
    expect(nutritionFactor({ name: 'Milk', amount: 0.25, unit: 'l', nutrition: { ...labneh, basis: 'per100ml' } })).toBe(2.5)
  })

  it('handles per-serving profiles', () => {
    const p: NutrientProfile = { basis: 'perServing', values: { energyKcal: 250 }, extras: [] }
    expect(nutritionFactor({ name: 'Manoushe', amount: 2, unit: 'serving', nutrition: p })).toBe(2)
    expect(nutritionFactor({ name: 'Manoushe', amount: 1.5, unit: 'piece', nutrition: p, servingSize: { amount: 1, unit: 'piece' } })).toBe(1.5)
    expect(nutritionFactor({ name: 'Manoushe', amount: 150, unit: 'g', nutrition: p, servingSize: { amount: 100, unit: 'g' } })).toBe(1.5)
    expect(nutritionFactor({ name: 'Manoushe', amount: 150, unit: 'g', nutrition: p, servingSize: { amount: 1, unit: 'piece' } })).toBeNull()
  })

  it('resolves "serving" through a convertible serving size for per-100 g profiles', () => {
    expect(nutritionFactor({ name: 'Labneh', amount: 2, unit: 'serving', nutrition: labneh, servingSize: { amount: 50, unit: 'g' } })).toBe(1)
  })
})

describe('missing vs zero', () => {
  it('keeps real zeros and omits unknown values', () => {
    const s = itemNutrition({ name: 'Water', amount: 250, unit: 'ml', nutrition: { basis: 'per100ml', values: { energyKcal: 0 }, extras: [] } })
    expect(s.values.energyKcal).toBe(0)
    expect('protein' in s.values).toBe(false)
    expect(s.hasAnyData).toBe(true)
  })

  it('an item without nutrition is reported missing, not zero', () => {
    const s = itemNutrition({ name: 'Grandma soup', amount: 1, unit: 'bowl' })
    expect(s.hasAnyData).toBe(false)
    expect(s.values).toEqual({})
    expect(s.missing).toEqual([{ name: 'Grandma soup', reason: 'no-data' }])
  })

  it('flags totals as incomplete when any contributor lacks data', () => {
    const total = combineSummaries([
      itemNutrition({ name: 'Labneh', amount: 100, unit: 'g', nutrition: labneh }),
      itemNutrition({ name: 'Pita', amount: 1, unit: 'piece' }),
    ])
    expect(total.values.energyKcal).toBe(160)
    expect(total.incompleteKeys).toContain('energyKcal')
    expect(isComplete(total)).toBe(false)
    expect(incompletenessNote(total)).toMatch(/1 of 2/)
  })

  it('flags a nutrient incomplete when only some items provide it', () => {
    const a = itemNutrition({ name: 'A', amount: 100, unit: 'g', nutrition: { basis: 'per100g', values: { energyKcal: 100, fibre: 2 }, extras: [] } })
    const b = itemNutrition({ name: 'B', amount: 100, unit: 'g', nutrition: { basis: 'per100g', values: { energyKcal: 50 }, extras: [] } })
    const total = combineSummaries([a, b])
    expect(total.values).toEqual({ energyKcal: 150, fibre: 2 })
    expect(total.incompleteKeys).toEqual(['fibre'])
  })

  it('is complete only when every item has every displayed value', () => {
    const total = combineSummaries([
      itemNutrition({ name: 'A', amount: 100, unit: 'g', nutrition: { basis: 'per100g', values: { energyKcal: 100 }, extras: [] } }),
      itemNutrition({ name: 'B', amount: 50, unit: 'g', nutrition: { basis: 'per100g', values: { energyKcal: 100 }, extras: [] } }),
    ])
    expect(total.values.energyKcal).toBe(150)
    expect(isComplete(total)).toBe(true)
  })

  it('sums extra micronutrients by name and unit', () => {
    const p: NutrientProfile = { basis: 'per100g', values: {}, extras: [{ name: 'Calcium', amount: 100, unit: 'mg' }] }
    const total = combineSummaries([
      itemNutrition({ name: 'A', amount: 200, unit: 'g', nutrition: p }),
      itemNutrition({ name: 'B', amount: 100, unit: 'g', nutrition: p }),
    ])
    expect(total.extras).toEqual([{ name: 'Calcium', amount: 300, unit: 'mg' }])
  })
})

describe('entryNutrition', () => {
  it('prefers manually entered totals', () => {
    const s = entryNutrition({ name: 'Soup', items: [{ name: 'x', amount: 1, unit: 'g' }], manualNutrition: { energyKcal: 320 } })
    expect(s.values).toEqual({ energyKcal: 320 })
    expect(isComplete(s)).toBe(true)
  })

  it('reports a free-text entry without data as missing', () => {
    const s = entryNutrition({ name: 'Snack', items: [] })
    expect(s.hasAnyData).toBe(false)
    expect(s.missing).toHaveLength(1)
  })
})
