import { AlertCircle, Plus, Trash2 } from 'lucide-react'
import {
  BASIS_LABELS,
  displayedKeys,
  formatNutrient,
  incompletenessNote,
  NUTRIENTS,
  type NutritionSummary,
} from '@/lib/nutrition'
import type { ExtraNutrient, NutrientProfile, NutrientValues, NutritionBasis } from '@/lib/types'
import { formatNumber } from '@/lib/units'
import { cn } from '@/lib/utils'
import { NumberInput } from './inputs'
import { Button } from './ui/Button'
import { Input, Select } from './ui/Field'

export function NutrientValuesEditor({
  values,
  onChange,
}: {
  values: NutrientValues
  onChange: (v: NutrientValues) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3">
      {NUTRIENTS.map((n) => (
        <label key={n.key} className={cn('flex flex-col gap-1', (n.key === 'sugars' || n.key === 'saturatedFat') && 'pl-3')}>
          <span className="text-xs font-medium text-ink-2">{n.label}</span>
          <div className="relative">
            <NumberInput
              value={values[n.key]}
              aria-label={`${n.label} (${n.unit})`}
              placeholder="—"
              className="pr-11"
              onValueChange={(v) => {
                const next = { ...values }
                if (v === undefined) delete next[n.key]
                else next[n.key] = v
                onChange(next)
              }}
            />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted">{n.unit}</span>
          </div>
        </label>
      ))}
    </div>
  )
}

function ExtrasEditor({ extras, onChange }: { extras: ExtraNutrient[]; onChange: (e: ExtraNutrient[]) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-ink-2">Vitamins & minerals</p>
      {extras.map((e, i) => (
        <div key={i} className="grid grid-cols-[1fr_5.5rem_4.5rem_auto] gap-2">
          <Input
            value={e.name}
            placeholder="e.g. Calcium"
            aria-label="Nutrient name"
            onChange={(ev) => onChange(extras.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))}
          />
          <NumberInput
            value={Number.isFinite(e.amount) ? e.amount : undefined}
            placeholder="0"
            aria-label="Amount"
            onValueChange={(v) => onChange(extras.map((x, j) => (j === i ? { ...x, amount: v ?? NaN } : x)))}
          />
          <Select value={e.unit} aria-label="Unit" onChange={(ev) => onChange(extras.map((x, j) => (j === i ? { ...x, unit: ev.target.value } : x)))}>
            <option value="mg">mg</option>
            <option value="µg">µg</option>
            <option value="g">g</option>
            <option value="IU">IU</option>
          </Select>
          <Button variant="ghost" size="icon" aria-label="Remove nutrient" onClick={() => onChange(extras.filter((_, j) => j !== i))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" className="self-start" onClick={() => onChange([...extras, { name: '', amount: NaN, unit: 'mg' }])}>
        <Plus className="size-4" /> Add vitamin or mineral
      </Button>
    </div>
  )
}

/** Editor for a food's optional nutrient profile. All fields may stay empty. */
export function NutritionEditor({
  value,
  onChange,
  servingDescription,
  bases = ['per100g', 'per100ml', 'perServing'],
}: {
  value: NutrientProfile | undefined
  onChange: (p: NutrientProfile | undefined) => void
  servingDescription?: string
  bases?: NutritionBasis[]
}) {
  const profile: NutrientProfile = value ?? { basis: bases[0]!, values: {}, extras: [] }
  const update = (patch: Partial<NutrientProfile>) => onChange({ ...profile, ...patch })
  return (
    <div className="flex flex-col gap-4">
      {bases.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.8125rem] font-medium text-ink-2">Values are given</span>
          <div className="grid grid-cols-3 gap-1.5 rounded-control bg-subtle p-1">
            {bases.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => update({ basis: b })}
                className={cn(
                  'h-9 rounded-[0.65rem] text-sm font-medium transition-all',
                  profile.basis === b ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
                )}
              >
                {BASIS_LABELS[b]}
              </button>
            ))}
          </div>
          {profile.basis === 'perServing' && (
            <p className="text-xs text-muted">
              {servingDescription ? `One serving = ${servingDescription}.` : 'Set a default serving above so servings can be calculated.'}
            </p>
          )}
        </div>
      )}
      <NutrientValuesEditor values={profile.values} onChange={(values) => update({ values })} />
      <ExtrasEditor extras={profile.extras} onChange={(extras) => update({ extras })} />
    </div>
  )
}

/**
 * Read-only nutrition table. Unknown values are shown as "—", incomplete sums
 * are prefixed with "≥" and explained – missing data is never shown as zero.
 */
export function NutritionTable({
  summary,
  compact,
  className,
  emptyText = 'No nutritional information recorded.',
}: {
  summary: NutritionSummary
  compact?: boolean
  className?: string
  emptyText?: string
}) {
  const keys = displayedKeys(summary)
  const note = incompletenessNote(summary)
  if (!summary.hasAnyData) return <p className={cn('text-sm text-muted', className)}>{emptyText}</p>
  return (
    <div className={className}>
      <dl className={cn('grid gap-x-4', compact ? 'grid-cols-2 gap-y-1.5 sm:grid-cols-4' : 'grid-cols-2 gap-y-2 sm:grid-cols-4')}>
        {keys.map((k) => {
          const def = NUTRIENTS.find((n) => n.key === k)!
          const incomplete = summary.incompleteKeys.includes(k)
          return (
            <div key={k} className="min-w-0">
              <dt className="truncate text-xs text-muted">{def.short}</dt>
              <dd className="tabular text-[0.9375rem] font-medium text-ink">
                {incomplete && <span className="text-warn" title="Incomplete – at least one item has no value">≥ </span>}
                {formatNutrient(k, summary.values[k])}
              </dd>
            </div>
          )
        })}
        {summary.extras.map((e) => (
          <div key={`${e.name}-${e.unit}`} className="min-w-0">
            <dt className="truncate text-xs text-muted">{e.name}</dt>
            <dd className="tabular text-[0.9375rem] font-medium text-ink">
              {formatNumber(e.amount, 1)} {e.unit}
            </dd>
          </div>
        ))}
      </dl>
      {note && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          <span>
            {note}
            {summary.missing.length > 0 && summary.missing.length <= 4 && (
              <>: {summary.missing.map((m) => m.name + (m.reason === 'no-conversion' ? ' (unit not convertible)' : m.reason === 'no-amount' ? ' (no amount)' : '')).join(', ')}</>
            )}
          </span>
        </p>
      )}
    </div>
  )
}
