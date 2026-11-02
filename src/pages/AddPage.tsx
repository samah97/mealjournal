import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, ChefHat, History, PenLine, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { CategoryDot } from '@/components/inputs'
import { FoodRow, MealRow, sortByRecent } from '@/components/library'
import { entrySummaryLine } from '@/components/timeline'
import { ButtonLink } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { EmptyState, PageHeader, SectionTitle } from '@/components/ui/misc'
import { db } from '@/lib/db'
import { relativeDayLabel } from '@/lib/datetime'
import { useNow } from '@/lib/hooks'
import type { DiaryEntry } from '@/lib/types'
import { cn, matchesQuery } from '@/lib/utils'

type Tab = 'foods' | 'meals' | 'previous'

export function AddPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { date: today } = useNow()
  const kind = params.get('kind')
  const date = params.get('date')
  const isDrink = kind === 'drink'
  const [tab, setTab] = useState<Tab>(kind === 'meal' ? 'meals' : kind === 'reuse' ? 'previous' : 'foods')
  const [q, setQ] = useState('')

  const foods = useLiveQuery(() => db.foods.toArray(), [], [])
  const meals = useLiveQuery(() => db.mealTemplates.toArray(), [], [])
  const recentEntries = useLiveQuery(() => db.entries.orderBy('[date+time]').reverse().limit(200).toArray(), [], [])

  const extra = new URLSearchParams()
  if (date) extra.set('date', date)
  if (isDrink) extra.set('category', 'drink')
  const suffix = extra.toString() ? `&${extra}` : ''

  const matchedFoods = useMemo(() => {
    const list = foods.filter((f) => matchesQuery(q, f.name, f.brand, f.category, ...f.tags))
    const drinksFirst = (a: (typeof list)[number]) => (isDrink && a.category === 'Drinks' ? 0 : 1)
    return list.sort((a, b) => drinksFirst(a) - drinksFirst(b) || a.name.localeCompare(b.name))
  }, [foods, q, isDrink])
  const favourites = matchedFoods.filter((f) => f.favourite)
  const recent = sortByRecent(matchedFoods.filter((f) => f.lastUsedAt && !f.favourite)).slice(0, 6)
  const matchedMeals = sortByRecent(meals.filter((m) => matchesQuery(q, m.name, m.description)))

  const previous = useMemo(() => {
    const seen = new Set<string>()
    const out: DiaryEntry[] = []
    for (const e of recentEntries) {
      const key = e.name.trim().toLowerCase()
      if (seen.has(key) || !matchesQuery(q, e.name, e.description)) continue
      if (isDrink && e.category !== 'drink') continue
      seen.add(key)
      out.push(e)
      if (out.length >= 40) break
    }
    return out
  }, [recentEntries, q, isDrink])

  const pickFood = (id: string) => navigate(`/entry/new?food=${id}${suffix}`)

  return (
    <div>
      <PageHeader title={isDrink ? 'Add a drink' : 'Add to diary'} back />

      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 bg-canvas/90 px-4 pb-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:px-0">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-muted" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === 'meals' ? 'Search saved meals' : tab === 'previous' ? 'Search previous entries' : 'Search your foods'}
            className="h-12 rounded-2xl pl-11"
            type="search"
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-control bg-subtle p-1">
          {(
            [
              ['foods', 'Foods', BookOpen],
              ['meals', 'Meals', ChefHat],
              ['previous', 'Previous', History],
            ] as const
          ).map(([t, label, Icon]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'flex h-9 items-center justify-center gap-1.5 rounded-[0.65rem] text-sm font-medium transition-all',
                tab === t ? 'bg-surface text-ink shadow-sm' : 'text-muted',
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate(`/entry/new?${extra}`, { state: q ? { name: q } : undefined })}
        className="mt-1 flex w-full items-center gap-3.5 rounded-card border border-dashed border-line-strong bg-surface p-4 text-left transition-colors hover:border-accent"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
          <PenLine className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-semibold">{q ? `Record “${q}”` : 'Write a new entry'}</span>
          <span className="block text-xs text-muted">Free text, photos and details – no library needed</span>
        </span>
      </button>

      {tab === 'foods' && (
        <>
          {!q && favourites.length > 0 && (
            <>
              <SectionTitle>Favourites</SectionTitle>
              <div className="-mx-2 flex flex-col">
                {favourites.map((f) => (
                  <FoodRow key={f.id} food={f} onClick={() => pickFood(f.id)} />
                ))}
              </div>
            </>
          )}
          {!q && recent.length > 0 && (
            <>
              <SectionTitle>Recently used</SectionTitle>
              <div className="-mx-2 flex flex-col">
                {recent.map((f) => (
                  <FoodRow key={f.id} food={f} onClick={() => pickFood(f.id)} />
                ))}
              </div>
            </>
          )}
          <SectionTitle action={<ButtonLink to="/foods/new" variant="ghost" size="sm"><Plus className="size-4" /> New food</ButtonLink>}>
            {q ? 'Matching foods' : 'All foods'}
          </SectionTitle>
          {matchedFoods.length ? (
            <div className="-mx-2 flex flex-col">
              {matchedFoods.map((f) => (
                <FoodRow key={f.id} food={f} onClick={() => pickFood(f.id)} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<BookOpen className="size-6" />} title={q ? 'No foods match' : 'No saved foods yet'}>
              {q ? 'Record it as a new entry above, or save it as a food for next time.' : 'Save foods you eat often to reuse them in seconds.'}
            </EmptyState>
          )}
        </>
      )}

      {tab === 'meals' && (
        <>
          <SectionTitle action={<ButtonLink to="/meals/new" variant="ghost" size="sm"><Plus className="size-4" /> New meal</ButtonLink>}>
            Saved meals
          </SectionTitle>
          {matchedMeals.length ? (
            <div className="-mx-2 flex flex-col">
              {matchedMeals.map((m) => (
                <MealRow key={m.id} meal={m} onClick={() => navigate(`/entry/new?meal=${m.id}${suffix}`)} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<ChefHat className="size-6" />} title={q ? 'No meals match' : 'No saved meals yet'}>
              A saved meal combines several foods – like your usual breakfast – so you can log it in one go.
            </EmptyState>
          )}
        </>
      )}

      {tab === 'previous' && (
        <>
          <SectionTitle>Log again</SectionTitle>
          {previous.length ? (
            <div className="-mx-2 flex flex-col">
              {previous.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => navigate(`/entry/new?repeat=${e.id}${suffix}`)}
                  className="flex items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-subtle/70"
                >
                  <CategoryDot category={e.category} className="size-11" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-medium">{e.name}</span>
                    <span className="block truncate text-xs text-muted">{entrySummaryLine(e) || '—'}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {relativeDayLabel(e.date, today)} · {e.time}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={<History className="size-6" />} title="Nothing to reuse yet">
              Entries you record appear here so you can log them again with one tap.
            </EmptyState>
          )}
        </>
      )}
    </div>
  )
}
