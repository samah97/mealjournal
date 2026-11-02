import { categoryLabel } from '../categories'
import { formatTimestamp } from '../datetime'
import { formatNutrient, NUTRIENTS } from '../nutrition'
import type { MealCategory } from '../types'
import { formatNumber } from '../units'
import type { ReportData, ReportDay, ReportNutrition } from './types'

/** "Energy 520 kcal · Protein ≥ 22 g" – incomplete values carry "≥". */
export function nutritionParts(n: ReportNutrition): { label: string; value: string; incomplete: boolean }[] {
  const parts = NUTRIENTS.filter((d) => typeof n.values[d.key] === 'number').map((d) => ({
    label: d.short,
    value: formatNutrient(d.key, n.values[d.key]),
    incomplete: n.incompleteKeys.includes(d.key),
  }))
  for (const e of n.extras) parts.push({ label: e.name, value: `${formatNumber(e.amount, 1)} ${e.unit}`, incomplete: false })
  return parts
}

export function dayCountsText(day: ReportDay): string {
  const order: MealCategory[] = ['breakfast', 'lunch', 'dinner', 'snack', 'drink', 'other']
  const parts = order
    .filter((c) => day.counts[c])
    .map((c) => `${day.counts[c]} × ${categoryLabel(c).toLowerCase()}`)
  return parts.join(', ')
}

export function generatedText(r: ReportData): string {
  return formatTimestamp(new Date(r.generatedAt).getTime(), r.timeZone)
}

export function includedText(r: ReportData): string {
  const o = r.options
  const parts = [
    o.includePhotos && 'photos',
    o.includeIngredients && 'ingredients & quantities',
    o.includeNotes && 'descriptions & notes',
    o.includeNutrition && 'nutrition per entry',
    o.includeSummaries && 'daily nutrition totals',
  ].filter(Boolean)
  return parts.length ? `Includes ${parts.join(', ')}.` : 'Entry names and times only.'
}

export const MISSING_NOTE = '“≥” marks a total where at least one item had no value; missing values are never counted as zero.'
