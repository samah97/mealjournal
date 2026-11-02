import { useLiveQuery } from 'dexie-react-hooks'
import { ChefHat, Copy, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Thumb } from '@/components/library'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Card, EmptyState, PageHeader } from '@/components/ui/misc'
import { categoryLabel } from '@/lib/categories'
import { db } from '@/lib/db'
import { isComplete, itemsNutrition } from '@/lib/nutrition'
import { duplicateTemplate } from '@/lib/repo'
import { templateNutritionSources } from '@/lib/snapshot'
import { formatQuantity } from '@/lib/units'
import { matchesQuery, pluralise } from '@/lib/utils'

export function MealsPage() {
  const navigate = useNavigate()
  const meals = useLiveQuery(() => db.mealTemplates.orderBy('name').toArray(), [])
  const foods = useLiveQuery(() => db.foods.toArray(), [], [])
  const foodMap = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods])
  const [q, setQ] = useState('')

  const list = (meals ?? []).filter((m) => matchesQuery(q, m.name, m.description, ...m.items.map((i) => i.name)))

  return (
    <div>
      <PageHeader
        title="Meals"
        subtitle={meals ? `${pluralise(meals.length, 'saved meal')}` : undefined}
        large
        actions={
          <ButtonLink to="/meals/new" size="sm">
            <Plus className="size-4" /> New meal
          </ButtonLink>
        }
      />
      {meals && meals.length > 0 && (
        <div className="relative mt-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search meals or ingredients" className="h-12 rounded-2xl pl-11" type="search" />
        </div>
      )}

      {meals && meals.length === 0 ? (
        <EmptyState
          icon={<ChefHat className="size-6" />}
          title="Save your regular meals"
          action={<ButtonLink to="/meals/new">Create a meal</ButtonLink>}
          className="mt-6"
        >
          Combine foods you often eat together – like a Lebanese breakfast of labneh, pita, olives and cucumber – and log
          them in one tap, adjusting portions each time.
        </EmptyState>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {list.map((m) => {
            const n = itemsNutrition(templateNutritionSources(m, foodMap))
            return (
              <Card key={m.id} className="flex flex-col p-4">
                <button type="button" onClick={() => navigate(`/meals/${m.id}`)} className="flex items-start gap-3 text-left">
                  <Thumb photoId={m.photoId} className="size-14" fallback={<ChefHat className="size-5.5" />} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.9375rem] font-semibold">{m.name}</p>
                    <p className="text-xs text-muted">
                      {categoryLabel(m.category)} · {pluralise(m.items.length, 'item')}
                    </p>
                  </div>
                </button>
                <ul className="mt-3 flex-1 space-y-0.5 text-[0.8125rem] text-ink-2">
                  {m.items.slice(0, 4).map((i) => (
                    <li key={i.id} className="truncate">
                      {i.amount !== undefined && <span className="tabular text-muted">{formatQuantity(i.amount, i.unit)} </span>}
                      {i.name}
                    </li>
                  ))}
                  {m.items.length > 4 && <li className="text-muted">+ {m.items.length - 4} more</li>}
                </ul>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/70 pt-3">
                  <span className="text-xs text-muted">
                    {n.hasAnyData ? (isComplete(n) ? 'Nutrition complete' : 'Nutrition incomplete') : 'No nutrition data'}
                  </span>
                  <div className="flex gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Duplicate ${m.name}`}
                      onClick={async () => {
                        const id = await duplicateTemplate(m.id)
                        toast.success('Meal duplicated')
                        if (id) navigate(`/meals/${id}`)
                      }}
                    >
                      <Copy className="size-4" />
                    </Button>
                    <Button size="sm" variant="soft" onClick={() => navigate(`/entry/new?meal=${m.id}`)}>
                      <Plus className="size-4" /> Log
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
          {list.length === 0 && <p className="col-span-full py-8 text-center text-sm text-muted">No meals match your search.</p>}
        </div>
      )}
    </div>
  )
}
