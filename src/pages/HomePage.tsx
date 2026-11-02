import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, ChefHat, FileText, GlassWater, History, Plus, Sparkles, UtensilsCrossed } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { OfflineBadge, SyncStatusLine } from '@/components/AppShell'
import { Thumb, sortByRecent } from '@/components/library'
import { NutritionTable } from '@/components/nutrition'
import { DayTimeline } from '@/components/timeline'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState, SectionTitle } from '@/components/ui/misc'
import { db } from '@/lib/db'
import { formatLongDate, greeting } from '@/lib/datetime'
import { useNow, useSettings } from '@/lib/hooks'
import { combineSummaries, entryNutrition } from '@/lib/nutrition'
import { deleteEntry, quickLogFood, sortEntries } from '@/lib/repo'
import { addStarterFoods } from '@/lib/starter'
import type { Food } from '@/lib/types'
import { cn, pluralise } from '@/lib/utils'

const QUICK = [
  { to: '/add?kind=food', label: 'Add food', hint: 'Something you ate', icon: UtensilsCrossed },
  { to: '/add?kind=drink', label: 'Add drink', hint: 'Water, tea, coffee…', icon: GlassWater },
  { to: '/add?kind=meal', label: 'Add meal', hint: 'From a saved meal', icon: ChefHat },
  { to: '/add?kind=reuse', label: 'Reuse previous', hint: 'Log it again', icon: History },
]

export function HomePage() {
  const { date, time } = useNow()
  const settings = useSettings()
  const navigate = useNavigate()
  const today = useLiveQuery(() => db.entries.where('date').equals(date).toArray(), [date])
  const foods = useLiveQuery(() => db.foods.toArray(), [], [])
  const meals = useLiveQuery(() => db.mealTemplates.toArray(), [], [])
  const entryCount = useLiveQuery(() => db.entries.count(), [], 0)

  const entries = today ? sortEntries(today) : []
  const mealCount = entries.filter((e) => ['breakfast', 'lunch', 'dinner'].includes(e.category)).length
  const snackCount = entries.filter((e) => e.category === 'snack').length
  const drinkCount = entries.filter((e) => e.category === 'drink').length
  const otherCount = entries.filter((e) => e.category === 'other').length

  const favourites = sortByRecent(foods.filter((f) => f.favourite))
  const recent = sortByRecent(foods.filter((f) => f.lastUsedAt && !f.favourite)).slice(0, 8)
  const recentMeals = sortByRecent(meals).slice(0, 4)
  const isNew = entryCount === 0 && foods.length === 0

  async function logNow(food: Food) {
    const entry = await quickLogFood(food.id)
    if (!entry) return
    toast.success(`Logged ${entry.name} at ${entry.time}`, {
      duration: 8000,
      action: { label: 'Undo', onClick: () => void deleteEntry(entry.id) },
      cancel: { label: 'Edit', onClick: () => navigate(`/entry/${entry.id}/edit`) },
    })
  }

  return (
    <div className="pt-safe">
      <header className="flex items-start justify-between gap-3 pb-2 pt-5 lg:pt-2">
        <div>
          <p className="text-sm font-medium text-muted">{formatLongDate(date)}</p>
          <h1 className="mt-0.5 text-[1.75rem] font-semibold leading-tight tracking-tight">{greeting(time)}</h1>
        </div>
        <Link
          to="/report"
          className="mt-1 grid size-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-2 hover:text-ink lg:hidden"
          aria-label="Reports and sharing"
        >
          <FileText className="size-5" />
        </Link>
      </header>
      <OfflineBadge className="mb-2 w-fit" />
      <SyncStatusLine className="mb-1 text-xs text-muted lg:hidden" />

      <Card className="mt-3 p-4">
        <p className="text-[0.9375rem] text-ink-2">
          {entries.length === 0 ? (
            <>Nothing recorded yet today.</>
          ) : (
            <>
              You've recorded <strong className="font-semibold text-ink">{pluralise(entries.length, 'entry', 'entries')}</strong> today.
            </>
          )}
        </p>
        {entries.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              [mealCount, 'meal'],
              [snackCount, 'snack'],
              [drinkCount, 'drink'],
              [otherCount, 'other'],
            ]
              .filter(([n]) => (n as number) > 0)
              .map(([n, label]) => (
                <span key={label as string} className="rounded-full bg-subtle px-3 py-1 text-xs font-medium text-ink-2">
                  {label === 'other' ? `${n} other` : pluralise(n as number, label as string)}
                </span>
              ))}
          </div>
        )}
        {settings.showNutritionOnHome && entries.length > 0 && (
          <NutritionTable
            className="mt-4 border-t border-line pt-3"
            compact
            summary={combineSummaries(entries.map((e) => entryNutrition(e)))}
            emptyText="No nutritional information recorded today."
          />
        )}
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {QUICK.map(({ to, label, hint, icon: Icon }, i) => (
          <Link
            key={to}
            to={to}
            className={cn(
              'flex flex-col gap-3 rounded-card border p-4 transition-all active:scale-[0.98]',
              i === 0
                ? 'border-transparent bg-accent text-accent-fg shadow-[0_6px_20px_-8px_var(--color-accent)]'
                : 'border-line/70 bg-surface shadow-card hover:border-line-strong',
            )}
          >
            <span className={cn('grid size-10 place-items-center rounded-full', i === 0 ? 'bg-white/18' : 'bg-accent-soft text-accent-ink')}>
              <Icon className="size-5" />
            </span>
            <span>
              <span className="block text-[0.9375rem] font-semibold">{label}</span>
              <span className={cn('block text-xs', i === 0 ? 'text-accent-fg/80' : 'text-muted')}>{hint}</span>
            </span>
          </Link>
        ))}
      </div>

      {isNew && (
        <Card className="mt-4 p-5">
          <div className="flex gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
              <Sparkles className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">Welcome to MealJournal</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Record what you eat and drink, with photos if you like. Your diary is saved on this device and synced to your account. When you're ready,
                create a PDF or a private link for your dietitian.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="soft" onClick={async () => toast.success(`Added ${await addStarterFoods()} starter foods`)}>
                  Add starter foods
                </Button>
                <Button size="sm" variant="ghost" onClick={() => navigate('/foods/new')}>
                  Create my own food
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted">Starter foods are labelled and can be removed in Settings. They contain no nutritional values.</p>
            </div>
          </div>
        </Card>
      )}

      {favourites.length > 0 && (
        <>
          <SectionTitle action={<span className="text-xs text-muted">Tap to log now</span>}>Favourites</SectionTitle>
          <FoodTiles foods={favourites} onPick={(f) => void logNow(f)} quick />
        </>
      )}

      <SectionTitle action={<Link to="/diary" className="flex items-center gap-1 text-sm font-medium text-accent-ink">Diary <ArrowRight className="size-3.5" /></Link>}>
        Today
      </SectionTitle>
      {entries.length ? (
        <DayTimeline entries={entries} />
      ) : (
        <Card>
          <EmptyState icon={<Plus className="size-6" />} title="Your day is a blank page" className="py-9">
            Tap “Add food” to record your first meal or drink today.
          </EmptyState>
        </Card>
      )}

      {recent.length > 0 && (
        <>
          <SectionTitle>Recently used</SectionTitle>
          <FoodTiles foods={recent} onPick={(f) => navigate(`/entry/new?food=${f.id}`)} />
        </>
      )}

      {recentMeals.length > 0 && (
        <>
          <SectionTitle action={<Link to="/meals" className="flex items-center gap-1 text-sm font-medium text-accent-ink">All meals <ArrowRight className="size-3.5" /></Link>}>
            Saved meals
          </SectionTitle>
          <Card className="divide-y divide-line/70 px-1">
            {recentMeals.map((m) => (
              <button key={m.id} type="button" onClick={() => navigate(`/entry/new?meal=${m.id}`)} className="flex w-full items-center gap-3 px-3 py-3 text-left">
                <Thumb photoId={m.photoId} className="size-10" fallback={<ChefHat className="size-4.5" />} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-medium">{m.name}</span>
                  <span className="block truncate text-xs text-muted">{pluralise(m.items.length, 'item')}</span>
                </span>
                <span className="flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-ink">
                  <Plus className="size-3.5" /> Log
                </span>
              </button>
            ))}
          </Card>
        </>
      )}

      <Link to="/report" className="mt-7 flex items-center gap-4 rounded-card border border-line/70 bg-surface p-4 shadow-card">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-subtle text-ink-2">
          <FileText className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-semibold">Report for your dietitian</span>
          <span className="block text-xs text-muted">Create a PDF or a private, read-only link</span>
        </span>
        <ArrowRight className="size-4.5 text-muted" />
      </Link>
    </div>
  )
}

function FoodTiles({ foods, onPick, quick }: { foods: Food[]; onPick: (f: Food) => void; quick?: boolean }) {
  return (
    <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 scrollbar-none sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
      {foods.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onPick(f)}
          aria-label={quick ? `Log ${f.name} now` : `Log ${f.name}`}
          className="relative flex w-28 shrink-0 flex-col items-start gap-2 rounded-2xl border border-line/70 bg-surface p-2.5 text-left shadow-card transition-transform active:scale-[0.97]"
        >
          <Thumb photoId={f.photoId} className="size-full aspect-square h-auto" fallback={<span className="text-xl font-semibold">{f.name.slice(0, 1)}</span>} />
          {quick && (
            <span className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-accent text-accent-fg shadow-sm">
              <Plus className="size-4" strokeWidth={2.5} />
            </span>
          )}
          <span className="line-clamp-2 text-[0.8125rem] font-medium leading-snug">{f.name}</span>
        </button>
      ))}
    </div>
  )
}
