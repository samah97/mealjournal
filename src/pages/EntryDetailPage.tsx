import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarClock, ChefHat, Copy, Pencil, Repeat2, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { CategoryDot } from '@/components/inputs'
import { NutritionTable } from '@/components/nutrition'
import { StoredPhoto, PhotoViewer, type PhotoSlot } from '@/components/photos'
import { Button, ButtonLink } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/confirm'
import { Field, Input } from '@/components/ui/Field'
import { Card, PageHeader, SectionTitle } from '@/components/ui/misc'
import { Sheet } from '@/components/ui/Sheet'
import { categoryLabel } from '@/lib/categories'
import { db } from '@/lib/db'
import { formatLongDate, isValidDate, isValidTime, nowInZone } from '@/lib/datetime'
import { useSettings } from '@/lib/hooks'
import { entryNutrition, itemNutrition } from '@/lib/nutrition'
import { deleteEntry, duplicateEntry, moveEntry, newTemplate, saveTemplate } from '@/lib/repo'
import { entryItemsToTemplateItems } from '@/lib/snapshot'
import { formatQuantity } from '@/lib/units'
import { cn } from '@/lib/utils'

function DateTimeSheet({
  open,
  onOpenChange,
  title,
  description,
  initial,
  confirmLabel,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description: string
  initial: { date: string; time: string }
  confirmLabel: string
  onConfirm: (v: { date: string; time: string }) => void
}) {
  const [v, setV] = useState(initial)
  const valid = isValidDate(v.date) && isValidTime(v.time)
  useEffect(() => {
    if (open) setV(initial)
    // Reset only when the sheet opens.
  }, [open])
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <Button block size="lg" disabled={!valid} onClick={() => onConfirm(v)}>
          {confirmLabel}
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">{(id) => <Input id={id} type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />}</Field>
        <Field label="Time">{(id) => <Input id={id} type="time" value={v.time} onChange={(e) => setV({ ...v, time: e.target.value })} />}</Field>
      </div>
    </Sheet>
  )
}

export function EntryDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const settings = useSettings()
  const entry = useLiveQuery(() => (id ? db.entries.get(id) : undefined), [id], null)
  const [viewing, setViewing] = useState<PhotoSlot | null>(null)
  const [moving, setMoving] = useState(false)
  const [duplicating, setDuplicating] = useState(false)

  if (entry === null) return null
  if (!entry) {
    return (
      <div>
        <PageHeader title="Entry not found" back="/diary" />
        <p className="text-muted">This entry may have been deleted.</p>
      </div>
    )
  }

  const nutrition = entryNutrition(entry)
  const singleFood = entry.items.length === 1 && entry.items[0]!.name.toLowerCase() === entry.name.toLowerCase()

  async function remove() {
    if (!entry) return
    const ok = await confirm({
      title: 'Delete this entry?',
      message: `“${entry.name}” and its photos will be removed from your diary. This can't be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    await deleteEntry(entry.id)
    toast.success('Entry deleted')
    navigate('/diary', { replace: true })
  }

  async function saveAsMeal() {
    if (!entry) return
    const foods = new Map((await db.foods.toArray()).map((f) => [f.id, f]))
    const t = newTemplate({
      name: entry.name,
      category: entry.category,
      description: entry.description,
      instructions: entry.preparationMethod,
      items: entryItemsToTemplateItems(entry.items, foods),
    })
    await saveTemplate(t)
    toast.success('Saved as a reusable meal')
    navigate(`/meals/${t.id}`)
  }

  return (
    <div>
      <PageHeader
        title=""
        back
        actions={
          <ButtonLink to={`/entry/${entry.id}/edit`} variant="soft" size="sm">
            <Pencil className="size-4" /> Edit
          </ButtonLink>
        }
      />

      {entry.photoIds.length > 0 && (
        <div className={cn('-mx-4 mb-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0')}>
          {entry.photoIds.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setViewing({ id: p })}
              className={cn('shrink-0 snap-center overflow-hidden rounded-card bg-subtle', entry.photoIds.length === 1 ? 'w-full' : 'w-[82%] sm:w-80')}
            >
              <StoredPhoto id={p} variant="full" className="aspect-[4/3] w-full" alt={`Photo of ${entry.name}`} />
            </button>
          ))}
        </div>
      )}

      <div className="flex items-start gap-3">
        <CategoryDot category={entry.category} className="size-11" />
        <div className="min-w-0">
          <h1 className="text-[1.5rem] font-semibold leading-tight tracking-tight">{entry.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {categoryLabel(entry.category)} · {formatLongDate(entry.date)} at <span className="tabular">{entry.time}</span>
          </p>
          {singleFood && entry.items[0]!.amount !== undefined && (
            <p className="mt-1 text-sm font-medium text-ink-2">{formatQuantity(entry.items[0]!.amount, entry.items[0]!.unit)}</p>
          )}
        </div>
      </div>

      {entry.description && <p className="mt-5 whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-ink-2">{entry.description}</p>}

      {entry.items.length > 0 && !singleFood && (
        <>
          <SectionTitle>Foods & quantities</SectionTitle>
          <Card className="divide-y divide-line/70">
            {entry.items.map((i) => {
              const s = itemNutrition(i)
              return (
                <div key={i.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] font-medium">
                      {i.name}
                      {i.brand && <span className="font-normal text-muted"> · {i.brand}</span>}
                    </p>
                    {i.ingredients.length > 0 && (
                      <p className="mt-0.5 text-xs text-muted">{i.ingredients.map((x) => (x.amount !== undefined ? `${formatQuantity(x.amount, x.unit)} ${x.name}` : x.name)).join(', ')}</p>
                    )}
                    {i.note && <p className="mt-0.5 text-xs italic text-muted">{i.note}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-sm text-ink-2">{i.amount !== undefined ? formatQuantity(i.amount, i.unit) : '—'}</p>
                    {s.values.energyKcal !== undefined && <p className="tabular text-xs text-muted">{Math.round(s.values.energyKcal)} kcal</p>}
                  </div>
                </div>
              )
            })}
          </Card>
        </>
      )}

      {singleFood && entry.items[0]!.ingredients.length > 0 && (
        <>
          <SectionTitle>Ingredients</SectionTitle>
          <Card className="px-4 py-3 text-sm text-ink-2">
            {entry.items[0]!.ingredients.map((x) => (x.amount !== undefined ? `${formatQuantity(x.amount, x.unit)} ${x.name}` : x.name)).join(', ')}
          </Card>
        </>
      )}

      {(entry.totalAmount || entry.preparationMethod || entry.notes) && (
        <>
          <SectionTitle>Details</SectionTitle>
          <Card className="divide-y divide-line/70 text-[0.9375rem]">
            {entry.totalAmount && (
              <div className="flex justify-between gap-3 px-4 py-3">
                <span className="text-muted">Total amount</span>
                <span>{formatQuantity(entry.totalAmount.amount, entry.totalAmount.unit)}</span>
              </div>
            )}
            {entry.preparationMethod && (
              <div className="flex justify-between gap-3 px-4 py-3">
                <span className="text-muted">Preparation</span>
                <span className="text-right">{entry.preparationMethod}</span>
              </div>
            )}
            {entry.notes && (
              <div className="px-4 py-3">
                <p className="text-muted">Notes</p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed">{entry.notes}</p>
              </div>
            )}
          </Card>
        </>
      )}

      <SectionTitle>Nutrition</SectionTitle>
      <Card className="p-4">
        <NutritionTable summary={nutrition} />
        {entry.manualNutrition && <p className="mt-2 text-xs text-muted">Entered manually for this entry.</p>}
      </Card>

      {entry.source.refName && entry.source.kind !== 'free' && (
        <p className="mt-4 text-xs text-muted">
          {entry.source.kind === 'meal' ? 'Logged from saved meal' : entry.source.kind === 'food' ? 'Logged from library food' : 'Repeated from'} “
          {entry.source.refName}”{entry.source.portionFactor && entry.source.portionFactor !== 1 ? ` · ${entry.source.portionFactor}× portion` : ''}. Changes to
          the library don’t affect this entry.
        </p>
      )}

      <SectionTitle>Actions</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="secondary" onClick={() => navigate(`/entry/new?repeat=${entry.id}`)}>
          <Repeat2 className="size-4" /> Log again now
        </Button>
        <Button variant="secondary" onClick={() => setMoving(true)}>
          <CalendarClock className="size-4" /> Move
        </Button>
        <Button variant="secondary" onClick={() => setDuplicating(true)}>
          <Copy className="size-4" /> Duplicate
        </Button>
        <Button variant="secondary" onClick={() => void saveAsMeal()}>
          <ChefHat className="size-4" /> Save as meal
        </Button>
        <Button variant="danger-soft" className="col-span-2" onClick={() => void remove()}>
          <Trash2 className="size-4" /> Delete entry
        </Button>
      </div>

      <PhotoViewer slot={viewing} onClose={() => setViewing(null)} />
      <DateTimeSheet
        open={moving}
        onOpenChange={setMoving}
        title="Move entry"
        description="Change when this was eaten."
        initial={{ date: entry.date, time: entry.time }}
        confirmLabel="Move"
        onConfirm={async (v) => {
          await moveEntry(entry.id, v.date, v.time)
          setMoving(false)
          toast.success(`Moved to ${formatLongDate(v.date)}, ${v.time}`)
        }}
      />
      <DateTimeSheet
        open={duplicating}
        onOpenChange={setDuplicating}
        title="Duplicate entry"
        description="An exact copy, including photos, at another date or time."
        initial={nowInZone(settings.timeZone)}
        confirmLabel="Duplicate"
        onConfirm={async (v) => {
          const newId = await duplicateEntry(entry.id, v)
          setDuplicating(false)
          toast.success('Entry duplicated')
          if (newId) navigate(`/entry/${newId}`)
        }}
      />
    </div>
  )
}
