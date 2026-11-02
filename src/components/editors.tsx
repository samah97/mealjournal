import { GripVertical, Plus, Trash2 } from 'lucide-react'
import type { Ingredient, UnitConversion } from '@/lib/types'
import { isMetric, UNITS } from '@/lib/units'
import { uid } from '@/lib/utils'
import { NumberInput, UnitSelect } from './inputs'
import { Button } from './ui/Button'
import { Input, Select } from './ui/Field'

export function IngredientsEditor({
  value,
  onChange,
  addLabel = 'Add ingredient',
}: {
  value: Ingredient[]
  onChange: (v: Ingredient[]) => void
  addLabel?: string
}) {
  const update = (id: string, patch: Partial<Ingredient>) =>
    onChange(value.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  return (
    <div className="flex flex-col gap-2.5">
      {value.map((ing) => (
        <div key={ing.id} className="flex flex-col gap-2 rounded-xl bg-subtle/60 p-2.5 sm:flex-row sm:items-center sm:bg-transparent sm:p-0">
          <GripVertical className="hidden size-4 shrink-0 text-line-strong sm:block" aria-hidden />
          <Input
            value={ing.name}
            placeholder="Ingredient"
            aria-label="Ingredient name"
            className="sm:flex-1"
            onChange={(e) => update(ing.id, { name: e.target.value })}
          />
          <div className="flex gap-2">
            <NumberInput
              value={ing.amount}
              placeholder="Qty"
              aria-label="Quantity"
              className="w-24"
              onValueChange={(amount) => update(ing.id, { amount })}
            />
            <UnitSelect value={ing.unit} allowEmpty className="w-32" onChange={(unit) => update(ing.id, { unit })} />
            <Button variant="ghost" size="icon" aria-label="Remove ingredient" onClick={() => onChange(value.filter((i) => i.id !== ing.id))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}
      <Button
        variant="soft"
        size="sm"
        className="self-start"
        onClick={() => onChange([...value, { id: uid(), name: '', unit: 'g' }])}
      >
        <Plus className="size-4" /> {addLabel}
      </Button>
    </div>
  )
}

/** "1 piece = 60 g" – how non-metric units of this food translate to weight or volume. */
export function ConversionsEditor({ value, onChange }: { value: UnitConversion[]; onChange: (v: UnitConversion[]) => void }) {
  const nonMetric = UNITS.filter((u) => !isMetric(u.id)).map((u) => u.id)
  return (
    <div className="flex flex-col gap-2.5">
      {value.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-sm text-muted">1</span>
          <UnitSelect
            value={c.unit}
            only={nonMetric}
            className="w-36"
            onChange={(unit) => unit && onChange(value.map((x, j) => (j === i ? { ...x, unit } : x)))}
          />
          <span className="text-sm text-muted">=</span>
          <NumberInput
            value={c.amount || undefined}
            placeholder="60"
            className="w-20"
            aria-label="Amount"
            onValueChange={(amount) => onChange(value.map((x, j) => (j === i ? { ...x, amount: amount ?? 0 } : x)))}
          />
          <Select
            value={c.base}
            className="w-20"
            aria-label="Base unit"
            onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, base: e.target.value as 'g' | 'ml' } : x)))}
          >
            <option value="g">g</option>
            <option value="ml">ml</option>
          </Select>
          <Button variant="ghost" size="icon" aria-label="Remove conversion" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        variant="soft"
        size="sm"
        className="self-start"
        onClick={() => onChange([...value, { unit: 'piece', amount: 0, base: 'g' }])}
      >
        <Plus className="size-4" /> Add conversion
      </Button>
    </div>
  )
}
