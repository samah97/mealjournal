import { ChevronDown, Library, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { BASIS_LABELS, itemNutrition } from '@/lib/nutrition'
import type { DiaryEntryItem } from '@/lib/types'
import { formatQuantity } from '@/lib/units'
import { cn } from '@/lib/utils'
import { IngredientsEditor } from './editors'
import { QuantityInput } from './inputs'
import { NutritionEditor, NutritionTable } from './nutrition'
import { Button } from './ui/Button'
import { Input } from './ui/Field'
import { Badge } from './ui/misc'

/** One food/ingredient line of a diary entry, with expandable details. */
export function EntryItemEditor({
  item,
  onChange,
  onRemove,
  showNutrition,
}: {
  item: DiaryEntryItem
  onChange: (i: DiaryEntryItem) => void
  onRemove: () => void
  showNutrition: boolean
}) {
  const [open, setOpen] = useState(false)
  const fromLibrary = !!item.sourceFoodId
  const summary = itemNutrition(item)

  return (
    <div className="rounded-2xl border border-line bg-surface">
      <div className="flex flex-col gap-2.5 p-3">
        <div className="flex items-center gap-2">
          <Input
            value={item.name}
            onChange={(e) => onChange({ ...item, name: e.target.value })}
            placeholder="Food or ingredient"
            aria-label="Item name"
            className="flex-1 font-medium"
          />
          <Button variant="ghost" size="icon" aria-label={`Remove ${item.name || 'item'}`} onClick={onRemove}>
            <Trash2 className="size-4" />
          </Button>
        </div>
        <QuantityInput
          amount={item.amount}
          unit={item.unit}
          placeholder="Amount eaten"
          onChange={(q) => onChange({ ...item, amount: q.amount, unit: q.unit })}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {fromLibrary && (
            <Badge>
              <Library className="size-3" /> From library
            </Badge>
          )}
          {item.servingSize && <Badge>Serving: {formatQuantity(item.servingSize.amount, item.servingSize.unit)}</Badge>}
          {item.nutrition && <Badge tone="accent">Nutrition {BASIS_LABELS[item.nutrition.basis]}</Badge>}
          {showNutrition && item.nutrition && !summary.hasAnyData && summary.missing[0]?.reason === 'no-conversion' && (
            <Badge tone="warn">Unit can’t be converted</Badge>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="ml-auto flex items-center gap-1 text-xs font-medium text-accent-ink"
            aria-expanded={open}
          >
            Details <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
          </button>
        </div>
      </div>
      {open && (
        <div className="flex flex-col gap-4 border-t border-line p-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink-2">Brand</span>
            <Input value={item.brand ?? ''} onChange={(e) => onChange({ ...item, brand: e.target.value || undefined })} placeholder="Optional" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink-2">Note</span>
            <Input value={item.note ?? ''} onChange={(e) => onChange({ ...item, note: e.target.value || undefined })} placeholder="e.g. without the crust" />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink-2">Ingredients</span>
            <IngredientsEditor value={item.ingredients} onChange={(ingredients) => onChange({ ...item, ingredients })} />
          </div>
          {showNutrition &&
            (fromLibrary ? (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-ink-2">Nutrition for this amount</span>
                <NutritionTable summary={summary} compact emptyText="This food has no nutritional information." />
                <p className="text-xs text-muted">Copied from your library when logged. Editing the library later won't change this entry.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-ink-2">Nutrition (optional)</span>
                <NutritionEditor bases={['per100g', 'per100ml']} value={item.nutrition} onChange={(nutrition) => onChange({ ...item, nutrition })} />
                {summary.hasAnyData && <NutritionTable summary={summary} compact />}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
