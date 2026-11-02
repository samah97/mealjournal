import type {
  ExtraNutrient,
  NutrientKey,
  NutrientProfile,
  NutrientValues,
  Quantity,
  UnitConversion,
  UnitId,
} from './types'
import { toBaseAmount } from './units'

export const NUTRIENTS: { key: NutrientKey; label: string; short: string; unit: 'kcal' | 'g'; digits: number }[] = [
  { key: 'energyKcal', label: 'Energy', short: 'Energy', unit: 'kcal', digits: 0 },
  { key: 'protein', label: 'Protein', short: 'Protein', unit: 'g', digits: 1 },
  { key: 'carbohydrates', label: 'Carbohydrates', short: 'Carbs', unit: 'g', digits: 1 },
  { key: 'sugars', label: 'of which sugars', short: 'Sugars', unit: 'g', digits: 1 },
  { key: 'fat', label: 'Fat', short: 'Fat', unit: 'g', digits: 1 },
  { key: 'saturatedFat', label: 'of which saturated', short: 'Sat. fat', unit: 'g', digits: 1 },
  { key: 'fibre', label: 'Fibre', short: 'Fibre', unit: 'g', digits: 1 },
  { key: 'salt', label: 'Salt', short: 'Salt', unit: 'g', digits: 2 },
]

export const NUTRIENT_KEYS = NUTRIENTS.map((n) => n.key)

export const BASIS_LABELS = {
  per100g: 'per 100 g',
  per100ml: 'per 100 ml',
  perServing: 'per serving',
} as const

/** Anything that carries enough data to compute consumed nutrition. */
export interface NutritionSource {
  name: string
  amount?: number
  unit?: UnitId
  nutrition?: NutrientProfile
  servingSize?: Quantity
  conversions?: UnitConversion[]
}

/**
 * Summary of known nutrition for one or more contributors.
 * `values` holds sums of *known* values only. A nutrient listed in
 * `incompleteKeys` was unknown for at least one contributor, so its sum is a
 * lower bound and must be shown as incomplete – never as a precise total.
 */
export interface NutritionSummary {
  values: NutrientValues
  extras: ExtraNutrient[]
  incompleteKeys: NutrientKey[]
  /** Number of contributors (items or entries). */
  sources: number
  /** Contributors that provided at least one usable value. */
  withData: number
  /** Names of contributors without usable data, with the reason. */
  missing: { name: string; reason: 'no-data' | 'no-conversion' | 'no-amount' }[]
  hasAnyData: boolean
}

export function hasNutritionValues(values: NutrientValues | undefined): boolean {
  return !!values && NUTRIENT_KEYS.some((k) => typeof values[k] === 'number' && Number.isFinite(values[k]))
}

export function profileHasData(p: NutrientProfile | undefined): p is NutrientProfile {
  return !!p && (hasNutritionValues(p.values) || p.extras.length > 0)
}

/**
 * The factor by which a profile's values must be multiplied for the consumed
 * quantity, or null when it cannot be determined without guessing.
 */
export function nutritionFactor(src: NutritionSource): number | null {
  const p = src.nutrition
  if (!p || src.amount === undefined || src.amount === null || !src.unit || !(src.amount >= 0)) return null
  const consumed: Quantity = { amount: src.amount, unit: src.unit }
  const ctx = { conversions: src.conversions ?? [], servingSize: src.servingSize }

  switch (p.basis) {
    case 'per100g': {
      const g = toBaseAmount(consumed, 'g', ctx)
      return g === null ? null : g / 100
    }
    case 'per100ml': {
      const ml = toBaseAmount(consumed, 'ml', ctx)
      return ml === null ? null : ml / 100
    }
    case 'perServing': {
      if (consumed.unit === 'serving') return consumed.amount
      const s = src.servingSize
      if (!s || !(s.amount > 0)) return null
      if (s.unit === consumed.unit) return consumed.amount / s.amount
      for (const base of ['g', 'ml'] as const) {
        const a = toBaseAmount(consumed, base, { conversions: ctx.conversions })
        const b = toBaseAmount(s, base, { conversions: ctx.conversions })
        if (a !== null && b !== null && b > 0) return a / b
      }
      return null
    }
  }
}

function scaleValues(values: NutrientValues, factor: number): NutrientValues {
  const out: NutrientValues = {}
  for (const k of NUTRIENT_KEYS) {
    const v = values[k]
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v * factor
  }
  return out
}

function mergeExtras(into: ExtraNutrient[], add: ExtraNutrient[], factor = 1): void {
  for (const e of add) {
    if (!e.name.trim() || !Number.isFinite(e.amount)) continue
    const existing = into.find((x) => x.name.toLowerCase() === e.name.toLowerCase() && x.unit === e.unit)
    if (existing) existing.amount += e.amount * factor
    else into.push({ name: e.name, unit: e.unit, amount: e.amount * factor })
  }
}

export function emptySummary(): NutritionSummary {
  return { values: {}, extras: [], incompleteKeys: [], sources: 0, withData: 0, missing: [], hasAnyData: false }
}

/** Nutrition for one item as consumed. */
export function itemNutrition(src: NutritionSource): NutritionSummary {
  const s = emptySummary()
  s.sources = 1
  if (!profileHasData(src.nutrition)) {
    s.missing.push({ name: src.name, reason: 'no-data' })
    return s
  }
  if (src.amount === undefined || src.amount === null || !src.unit) {
    s.missing.push({ name: src.name, reason: 'no-amount' })
    return s
  }
  const factor = nutritionFactor(src)
  if (factor === null) {
    s.missing.push({ name: src.name, reason: 'no-conversion' })
    return s
  }
  s.values = scaleValues(src.nutrition.values, factor)
  mergeExtras(s.extras, src.nutrition.extras, factor)
  s.withData = 1
  s.hasAnyData = true
  return s
}

/** Summary from directly entered values (already "as consumed"). */
export function fixedNutrition(name: string, values: NutrientValues): NutritionSummary {
  const s = emptySummary()
  s.sources = 1
  if (!hasNutritionValues(values)) {
    s.missing.push({ name, reason: 'no-data' })
    return s
  }
  s.values = scaleValues(values, 1)
  s.withData = 1
  s.hasAnyData = true
  return s
}

/**
 * Combine contributor summaries. A nutrient is incomplete in the result when any
 * contributor lacks it or was itself incomplete for it. Missing data is never
 * counted as zero.
 */
export function combineSummaries(parts: NutritionSummary[]): NutritionSummary {
  const out = emptySummary()
  const present = new Set<NutrientKey>()
  for (const p of parts) {
    out.sources += p.sources
    out.withData += p.withData
    out.missing.push(...p.missing)
    mergeExtras(out.extras, p.extras)
    for (const k of NUTRIENT_KEYS) {
      const v = p.values[k]
      if (typeof v === 'number') {
        present.add(k)
        out.values[k] = (out.values[k] ?? 0) + v
      }
    }
  }
  out.hasAnyData = present.size > 0 || out.extras.length > 0
  const incomplete = new Set<NutrientKey>()
  for (const k of present) {
    for (const p of parts) {
      if (typeof p.values[k] !== 'number' || p.incompleteKeys.includes(k)) incomplete.add(k)
    }
  }
  out.incompleteKeys = NUTRIENT_KEYS.filter((k) => incomplete.has(k))
  return out
}

export function itemsNutrition(items: NutritionSource[]): NutritionSummary {
  return combineSummaries(items.map(itemNutrition))
}

/** Entry-level nutrition: manual totals win; otherwise derived from the items. */
export function entryNutrition(entry: {
  name: string
  items: NutritionSource[]
  manualNutrition?: NutrientValues
}): NutritionSummary {
  if (hasNutritionValues(entry.manualNutrition)) return fixedNutrition(entry.name, entry.manualNutrition!)
  if (entry.items.length === 0) return fixedNutrition(entry.name, {})
  const s = itemsNutrition(entry.items)
  // An entry counts as one contributor when summarised in a day.
  return s
}

export function isComplete(s: NutritionSummary): boolean {
  return s.hasAnyData && s.incompleteKeys.length === 0 && s.missing.length === 0
}

export function formatNutrient(key: NutrientKey, value: number | undefined): string {
  const def = NUTRIENTS.find((n) => n.key === key)!
  if (value === undefined) return '—'
  const n = new Intl.NumberFormat('en-GB', { maximumFractionDigits: def.digits }).format(value)
  return `${n} ${def.unit}`
}

/** Keys worth displaying for a summary: those with at least one known value. */
export function displayedKeys(s: NutritionSummary): NutrientKey[] {
  return NUTRIENT_KEYS.filter((k) => typeof s.values[k] === 'number')
}

/** Short description of why a total is incomplete. */
export function incompletenessNote(s: NutritionSummary): string | null {
  if (!s.hasAnyData) return s.sources > 0 ? 'No nutritional information recorded' : null
  if (s.missing.length > 0) {
    const n = s.missing.length
    return `Incomplete – ${n} of ${s.sources} ${s.sources === 1 ? 'item has' : 'items have'} no usable nutrition data`
  }
  if (s.incompleteKeys.length > 0) return 'Some values are missing for one or more items'
  return null
}
