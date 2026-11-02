import { dateRange } from '../datetime'
import { combineSummaries, entryNutrition, incompletenessNote, itemNutrition, type NutritionSummary } from '../nutrition'
import type { DiaryEntry, DiaryEntryItem, Ingredient, MealCategory, ReportOptions } from '../types'
import { formatQuantity } from '../units'
import type { ReportData, ReportDay, ReportEntry, ReportItem, ReportNutrition } from './types'

export interface BuildReportInput {
  entries: DiaryEntry[]
  photoMeta: Map<string, { width: number; height: number }>
  periodStart: string
  periodEnd: string
  options: ReportOptions
  title?: string
  patientName?: string
  timeZone: string
  now?: Date
}

function toReportNutrition(s: NutritionSummary): ReportNutrition {
  return {
    values: s.values,
    extras: s.extras,
    incompleteKeys: s.incompleteKeys,
    sources: s.sources,
    withData: s.withData,
    hasAnyData: s.hasAnyData,
    note: incompletenessNote(s),
  }
}

function ingredientLines(list: Ingredient[]): string[] {
  return list
    .filter((i) => i.name.trim())
    .map((i) => {
      const q = i.amount !== undefined ? formatQuantity(i.amount, i.unit) : ''
      return q ? `${q} ${i.name}` : i.name
    })
}

function quantityText(amount: number | undefined, unit: string | undefined): string | undefined {
  return amount === undefined ? undefined : formatQuantity(amount, unit) || undefined
}

function buildItem(item: DiaryEntryItem, o: ReportOptions): ReportItem {
  const out: ReportItem = { name: item.name }
  if (item.brand) out.brand = item.brand
  out.quantity = quantityText(item.amount, item.unit)
  const ing = ingredientLines(item.ingredients)
  if (ing.length) out.ingredients = ing
  if (o.includeNotes && item.note) out.note = item.note
  if (o.includeSummaries) out.nutrition = toReportNutrition(itemNutrition(item))
  return out
}

/** A single-item entry describing the same food is shown as one line, not a list of one. */
function isSingleFoodEntry(e: DiaryEntry): boolean {
  return e.items.length === 1 && e.items[0]!.name.trim().toLowerCase() === e.name.trim().toLowerCase()
}

function buildEntry(e: DiaryEntry, index: number, input: BuildReportInput): ReportEntry {
  const o = input.options
  const out: ReportEntry = {
    id: `e${index + 1}`,
    time: e.time,
    category: e.category,
    name: e.name,
    items: [],
    photos: [],
  }

  if (o.includeIngredients) {
    const single = isSingleFoodEntry(e) ? e.items[0]! : undefined
    out.quantity = e.totalAmount
      ? quantityText(e.totalAmount.amount, e.totalAmount.unit)
      : single
        ? quantityText(single.amount, single.unit)
        : undefined
    if (single) {
      const ing = ingredientLines(single.ingredients)
      if (ing.length) out.ingredients = ing
    } else {
      out.items = e.items.map((i) => buildItem(i, o))
    }
    const prep = e.preparationMethod ?? single?.preparation
    if (prep) out.preparation = prep
  }

  if (o.includeNotes) {
    if (e.description) out.description = e.description
    if (e.notes) out.notes = e.notes
  }

  if (o.includePhotos) {
    for (const id of e.photoIds) {
      const meta = input.photoMeta.get(id)
      if (meta) out.photos.push({ id, width: meta.width, height: meta.height })
    }
  }

  if (o.includeNutrition) out.nutrition = toReportNutrition(entryNutrition(e))
  return out
}

/**
 * Build the report for the selected period. Pure: the same inputs always give
 * the same report, and nothing outside the period or the chosen options leaks in.
 */
export function buildReport(input: BuildReportInput): ReportData {
  const o = input.options
  const inPeriod = input.entries
    .filter((e) => e.date >= input.periodStart && e.date <= input.periodEnd)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.createdAt - b.createdAt)

  let index = 0
  const days: ReportDay[] = dateRange(input.periodStart, input.periodEnd).map((date) => {
    const dayEntries = inPeriod.filter((e) => e.date === date)
    const counts: Partial<Record<MealCategory, number>> = {}
    for (const e of dayEntries) counts[e.category] = (counts[e.category] ?? 0) + 1
    const day: ReportDay = {
      date,
      entries: dayEntries.map((e) => buildEntry(e, index++, input)),
      counts,
    }
    if (o.includeSummaries && dayEntries.length) {
      day.nutrition = toReportNutrition(combineSummaries(dayEntries.map((e) => entryNutrition(e))))
    }
    return day
  })

  return {
    version: 1,
    title: input.title?.trim() || 'Food Diary',
    patientName: input.patientName?.trim() || undefined,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    generatedAt: (input.now ?? new Date()).toISOString(),
    timeZone: input.timeZone,
    options: { ...o },
    days,
  }
}

export function reportPhotoIds(report: ReportData): string[] {
  return [...new Set(report.days.flatMap((d) => d.entries.flatMap((e) => e.photos.map((p) => p.id))))]
}

export function reportEntryCount(report: ReportData): number {
  return report.days.reduce((n, d) => n + d.entries.length, 0)
}
