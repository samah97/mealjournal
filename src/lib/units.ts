import type { Quantity, UnitConversion, UnitId } from './types'

type UnitKind = 'mass' | 'volume' | 'count'

interface UnitInfo {
  id: UnitId
  label: string
  plural?: string
  kind: UnitKind
  /** Metric factor to the base unit (g or ml). Only metric units have one. */
  factor?: number
}

export const UNITS: UnitInfo[] = [
  { id: 'g', label: 'g', kind: 'mass', factor: 1 },
  { id: 'kg', label: 'kg', kind: 'mass', factor: 1000 },
  { id: 'mg', label: 'mg', kind: 'mass', factor: 0.001 },
  { id: 'ml', label: 'ml', kind: 'volume', factor: 1 },
  { id: 'l', label: 'L', kind: 'volume', factor: 1000 },
  { id: 'cl', label: 'cl', kind: 'volume', factor: 10 },
  { id: 'piece', label: 'piece', plural: 'pieces', kind: 'count' },
  { id: 'slice', label: 'slice', plural: 'slices', kind: 'count' },
  { id: 'tbsp', label: 'tbsp', kind: 'count' },
  { id: 'tsp', label: 'tsp', kind: 'count' },
  { id: 'cup', label: 'cup', plural: 'cups', kind: 'count' },
  { id: 'glass', label: 'glass', plural: 'glasses', kind: 'count' },
  { id: 'bowl', label: 'bowl', plural: 'bowls', kind: 'count' },
  { id: 'portion', label: 'portion', plural: 'portions', kind: 'count' },
  { id: 'serving', label: 'serving', plural: 'servings', kind: 'count' },
  { id: 'handful', label: 'handful', plural: 'handfuls', kind: 'count' },
  { id: 'can', label: 'can', plural: 'cans', kind: 'count' },
  { id: 'bottle', label: 'bottle', plural: 'bottles', kind: 'count' },
  { id: 'pinch', label: 'pinch', plural: 'pinches', kind: 'count' },
]

const byId = new Map(UNITS.map((u) => [u.id, u]))

export function unitInfo(id: UnitId): UnitInfo {
  return byId.get(id) ?? { id, label: id, kind: 'count' }
}

export function isMetric(id: UnitId): boolean {
  return unitInfo(id).factor !== undefined
}

export function formatNumber(n: number, maxFractionDigits = 1): string {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: maxFractionDigits }).format(n)
}

export function formatQuantity(amount: number | undefined, unit: UnitId | undefined): string {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return unit ? unitInfo(unit).label : ''
  if (!unit) return formatNumber(amount, 2)
  const info = unitInfo(unit)
  const label = amount !== 1 && info.plural ? info.plural : info.label
  return `${formatNumber(amount, 2)} ${label}`
}

/**
 * Convert a quantity to grams or millilitres.
 * Metric units convert exactly. Any other unit converts only through a
 * user-defined conversion – a piece, tablespoon or cup has no universal weight.
 * Returns null when no valid conversion exists.
 */
export function toBaseAmount(
  q: Quantity,
  base: 'g' | 'ml',
  ctx: { conversions?: UnitConversion[]; servingSize?: Quantity },
): number | null {
  const info = unitInfo(q.unit)
  if (info.factor !== undefined) {
    if ((info.kind === 'mass' && base === 'g') || (info.kind === 'volume' && base === 'ml')) {
      return q.amount * info.factor
    }
  }
  const conversion = ctx.conversions?.find((c) => c.unit === q.unit && c.base === base && c.amount > 0)
  if (conversion) return q.amount * conversion.amount

  // "serving" resolves through the record's own serving size, if that is convertible.
  if (q.unit === 'serving' && ctx.servingSize && ctx.servingSize.unit !== 'serving') {
    const perServing = toBaseAmount(ctx.servingSize, base, { conversions: ctx.conversions })
    return perServing === null ? null : q.amount * perServing
  }
  return null
}
