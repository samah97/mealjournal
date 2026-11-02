import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, Heart, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { FoodRow } from '@/components/library'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Chip, EmptyState, PageHeader } from '@/components/ui/misc'
import { db } from '@/lib/db'
import { toggleFoodFavourite } from '@/lib/repo'
import { cn, matchesQuery, pluralise } from '@/lib/utils'

export function FoodsPage() {
  const navigate = useNavigate()
  const foods = useLiveQuery(() => db.foods.orderBy('name').toArray(), [])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<string>('all')

  const categories = useMemo(
    () => [...new Set((foods ?? []).map((f) => f.category).filter((c): c is string => !!c))].sort(),
    [foods],
  )
  const list = useMemo(
    () =>
      (foods ?? [])
        .filter((f) => (filter === 'all' ? true : filter === 'fav' ? f.favourite : f.category === filter))
        .filter((f) => matchesQuery(q, f.name, f.brand, f.category, f.description, ...f.tags))
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })),
    [foods, q, filter],
  )

  return (
    <div>
      <PageHeader
        title="Foods"
        subtitle={foods ? pluralise(foods.length, 'food') + ' in your library' : undefined}
        large
        actions={
          <ButtonLink to="/foods/new" size="sm">
            <Plus className="size-4" /> New food
          </ButtonLink>
        }
      />

      <div className="relative mt-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, brand or tag" className="h-12 rounded-2xl pl-11" type="search" />
      </div>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:px-0">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
          All
        </Chip>
        <Chip active={filter === 'fav'} onClick={() => setFilter('fav')}>
          <Heart className="size-3.5" /> Favourites
        </Chip>
        {categories.map((c) => (
          <Chip key={c} active={filter === c} onClick={() => setFilter(c)}>
            {c}
          </Chip>
        ))}
      </div>

      {foods && foods.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-6" />}
          title="Build your own food library"
          action={<ButtonLink to="/foods/new">Create a food</ButtonLink>}
          className="mt-6"
        >
          Save the foods you eat – labneh, homemade dishes, your favourite bread – with their usual serving and, if you like,
          nutritional values. Reuse them in a tap.
        </EmptyState>
      ) : (
        <div className="-mx-2 mt-3 flex flex-col">
          {list.map((f) => (
            <FoodRow
              key={f.id}
              food={f}
              onClick={() => navigate(`/foods/${f.id}`)}
              trailing={
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={f.favourite ? 'Remove from favourites' : 'Add to favourites'}
                    aria-pressed={f.favourite}
                    onClick={() => void toggleFoodFavourite(f.id)}
                  >
                    <Heart className={cn('size-4.5', f.favourite && 'fill-current text-cat-snack')} />
                  </Button>
                  <Button variant="soft" size="icon-sm" aria-label={`Log ${f.name}`} onClick={() => navigate(`/entry/new?food=${f.id}`)}>
                    <Plus className="size-4.5" />
                  </Button>
                </>
              }
            />
          ))}
          {list.length === 0 && <p className="px-2 py-8 text-center text-sm text-muted">No foods match your search.</p>}
        </div>
      )}
    </div>
  )
}
