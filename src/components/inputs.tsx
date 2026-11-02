import { Apple, Croissant, GlassWater, Salad, Soup, Utensils, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type InputHTMLAttributes } from 'react'
import { MEAL_CATEGORIES } from '@/lib/categories'
import type { MealCategory, UnitId } from '@/lib/types'
import { UNITS } from '@/lib/units'
import { cn, numberToInput, parseNumber } from '@/lib/utils'
import { Input, Select } from './ui/Field'

export const CATEGORY_ICONS: Record<MealCategory, LucideIcon> = {
  breakfast: Croissant,
  lunch: Salad,
  dinner: Soup,
  snack: Apple,
  drink: GlassWater,
  other: Utensils,
}

/** Numeric input that accepts "1,5" and partially typed values without fighting the user. */
export function NumberInput({
  value,
  onValueChange,
  className,
  ...props
}: { value: number | undefined; onValueChange: (v: number | undefined) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
>) {
  const [text, setText] = useState(numberToInput(value))
  useEffect(() => {
    if (parseNumber(text) !== value) setText(numberToInput(value))
  }, [value])
  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9.,-]/g, '')
        setText(t)
        const n = parseNumber(t)
        if (n === undefined || n >= 0) onValueChange(n)
      }}
      className={cn('tabular', className)}
      {...props}
    />
  )
}

export function UnitSelect({
  value,
  onChange,
  className,
  allowEmpty,
  only,
  ...rest
}: {
  value: UnitId | undefined
  onChange: (u: UnitId | undefined) => void
  className?: string
  allowEmpty?: boolean
  only?: UnitId[]
  'aria-label'?: string
}) {
  const units = only ? UNITS.filter((u) => only.includes(u.id)) : UNITS
  return (
    <Select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      className={className}
      aria-label={rest['aria-label'] ?? 'Unit'}
    >
      {allowEmpty && <option value="">—</option>}
      {units.map((u) => (
        <option key={u.id} value={u.id}>
          {u.plural ? `${u.label} (${u.plural})` : u.label}
        </option>
      ))}
    </Select>
  )
}

export function QuantityInput({
  amount,
  unit,
  onChange,
  placeholder = 'Amount',
  allowEmptyUnit,
  idForAmount,
}: {
  amount: number | undefined
  unit: UnitId | undefined
  onChange: (q: { amount: number | undefined; unit: UnitId | undefined }) => void
  placeholder?: string
  allowEmptyUnit?: boolean
  idForAmount?: string
}) {
  return (
    <div className="grid grid-cols-[1fr_8.5rem] gap-2">
      <NumberInput
        id={idForAmount}
        value={amount}
        placeholder={placeholder}
        onValueChange={(a) => onChange({ amount: a, unit })}
      />
      <UnitSelect value={unit} allowEmpty={allowEmptyUnit} onChange={(u) => onChange({ amount, unit: u })} />
    </div>
  )
}

export function CategoryPicker({ value, onChange }: { value: MealCategory; onChange: (c: MealCategory) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Meal category">
      {MEAL_CATEGORIES.map((c) => {
        const Icon = CATEGORY_ICONS[c.id]
        const active = c.id === value
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(c.id)}
            className={cn(
              'flex h-12 items-center justify-center gap-2 rounded-control border text-sm font-medium transition-all',
              active
                ? 'border-transparent bg-accent text-accent-fg shadow-sm'
                : 'border-line bg-surface text-ink-2 hover:border-line-strong',
            )}
          >
            <Icon className="size-4.5" style={active ? undefined : { color: c.color }} />
            {c.label}
          </button>
        )
      })}
    </div>
  )
}

export function CategoryDot({ category, className }: { category: MealCategory; className?: string }) {
  const c = MEAL_CATEGORIES.find((x) => x.id === category)!
  const Icon = CATEGORY_ICONS[category]
  return (
    <span
      className={cn('grid size-9 shrink-0 place-items-center rounded-full', className)}
      style={{ background: `color-mix(in srgb, ${c.color} 14%, transparent)`, color: c.color }}
    >
      <Icon className="size-4.5" />
    </span>
  )
}
