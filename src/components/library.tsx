import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, ChefHat, Heart, Search, Sparkles } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { db } from '@/lib/db'
import type { Food, MealTemplate } from '@/lib/types'
import { formatQuantity } from '@/lib/units'
import { cn, matchesQuery, pluralise } from '@/lib/utils'
import { StoredPhoto } from './photos'
import { Input } from './ui/Field'
import { Badge, EmptyState } from './ui/misc'
import { Sheet } from './ui/Sheet'

export function Thumb({ photoId, fallback, className }: { photoId?: string; fallback: ReactNode; className?: string }) {
  return (
    <div className={cn('grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-accent-soft text-accent-ink', className)}>
      {photoId ? <StoredPhoto id={photoId} className="size-full" /> : fallback}
    </div>
  )
}

export function FoodRow({ food, onClick, trailing }: { food: Food; onClick?: () => void; trailing?: ReactNode }) {
  const serving = food.defaultServing ? formatQuantity(food.defaultServing.amount, food.defaultServing.unit) : null
  return (
    <div className="flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-subtle/70">
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Thumb photoId={food.photoId} fallback={<span className="text-base font-semibold">{food.name.slice(0, 1).toUpperCase()}</span>} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[0.9375rem] font-medium text-ink">{food.name}</p>
            {food.favourite && <Heart className="size-3.5 shrink-0 fill-current text-cat-snack" aria-label="Favourite" />}
          </div>
          <p className="truncate text-xs text-muted">
            {[food.brand, serving && `${serving} per serving`, food.category].filter(Boolean).join(' · ') || 'No details yet'}
          </p>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        {food.isExample && <Badge>Starter</Badge>}
        {food.nutrition && <Badge tone="accent">Nutrition</Badge>}
        {trailing}
      </div>
    </div>
  )
}

export function MealRow({ meal, onClick, trailing }: { meal: MealTemplate; onClick?: () => void; trailing?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-subtle/70">
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Thumb photoId={meal.photoId} fallback={<ChefHat className="size-5" />} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9375rem] font-medium text-ink">{meal.name}</p>
          <p className="truncate text-xs text-muted">
            {pluralise(meal.items.length, 'item')}
            {meal.items.length > 0 && ` · ${meal.items.slice(0, 3).map((i) => i.name).join(', ')}${meal.items.length > 3 ? '…' : ''}`}
          </p>
        </div>
      </button>
      {trailing}
    </div>
  )
}

export function sortByRecent<T extends { lastUsedAt?: number; useCount: number; name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || b.useCount - a.useCount || a.name.localeCompare(b.name))
}

/** Pick a saved food (and optionally a saved meal) from the library. */
export function LibraryPicker({
  open,
  onOpenChange,
  onPickFood,
  onPickMeal,
  title = 'Add from library',
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onPickFood: (f: Food) => void
  onPickMeal?: (m: MealTemplate) => void
  title?: string
}) {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'foods' | 'meals'>('foods')
  const foods = useLiveQuery(() => db.foods.toArray(), [], [])
  const meals = useLiveQuery(() => db.mealTemplates.toArray(), [], [])

  const filteredFoods = useMemo(() => {
    const list = foods.filter((f) => matchesQuery(q, f.name, f.brand, f.category, ...f.tags))
    return q ? list.sort((a, b) => a.name.localeCompare(b.name)) : sortByRecent(list)
  }, [foods, q])
  const filteredMeals = useMemo(() => sortByRecent(meals.filter((m) => matchesQuery(q, m.name))), [meals, q])

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} size="md">
      <div className="sticky top-0 z-10 -mx-5 -mt-2 bg-surface px-5 pb-3 pt-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search foods" className="pl-10" autoFocus={false} />
        </div>
        {onPickMeal && (
          <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-control bg-subtle p-1">
            {(['foods', 'meals'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn('h-9 rounded-[0.65rem] text-sm font-medium', tab === t ? 'bg-surface text-ink shadow-sm' : 'text-muted')}
              >
                {t === 'foods' ? `Foods (${foods.length})` : `Meals (${meals.length})`}
              </button>
            ))}
          </div>
        )}
      </div>
      {tab === 'foods' ? (
        filteredFoods.length ? (
          <div className="-mx-2 flex flex-col">
            {filteredFoods.map((f) => (
              <FoodRow key={f.id} food={f} onClick={() => onPickFood(f)} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<BookOpen className="size-6" />} title={q ? 'No matching foods' : 'Your food library is empty'}>
            Foods you save in the library appear here for quick reuse.
          </EmptyState>
        )
      ) : filteredMeals.length ? (
        <div className="-mx-2 flex flex-col">
          {filteredMeals.map((m) => (
            <MealRow key={m.id} meal={m} onClick={() => onPickMeal?.(m)} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Sparkles className="size-6" />} title="No saved meals yet">
          Save combinations you eat often as meals to log them in one tap.
        </EmptyState>
      )}
    </Sheet>
  )
}
