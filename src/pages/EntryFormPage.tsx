import { ChevronDown, Clock, Library, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { EntryItemEditor } from '@/components/EntryItemEditor'
import { CategoryPicker, QuantityInput } from '@/components/inputs'
import { LibraryPicker } from '@/components/library'
import { NutrientValuesEditor, NutritionTable } from '@/components/nutrition'
import { draftsOf, PhotoPicker, slotsFromIds, type PhotoSlot } from '@/components/photos'
import { Button } from '@/components/ui/Button'
import { Field, FormSection, Input, Textarea } from '@/components/ui/Field'
import { Chip, PageHeader, Spinner, Switch } from '@/components/ui/misc'
import { suggestCategory } from '@/lib/categories'
import { db, getSettings } from '@/lib/db'
import { isValidDate, isValidTime, nowInZone } from '@/lib/datetime'
import { useSettings } from '@/lib/hooks'
import { entryNutrition, hasNutritionValues } from '@/lib/nutrition'
import { saveEntry } from '@/lib/repo'
import { entryFromFood, foodToEntryItem, templateToEntryItems } from '@/lib/snapshot'
import type { DiaryEntry, DiaryEntryItem, Food, MealTemplate } from '@/lib/types'
import { clean, deepCopy, uid } from '@/lib/utils'

const PORTIONS = [0.5, 1, 1.5, 2]

function blankEntry(date: string, time: string): DiaryEntry {
  const now = Date.now()
  return {
    id: uid(),
    date,
    time,
    category: suggestCategory(time),
    name: '',
    photoIds: [],
    items: [],
    source: { kind: 'free' },
    createdAt: now,
    updatedAt: now,
  }
}

async function buildInitial(
  params: URLSearchParams,
  editId?: string,
  prefillName?: string,
): Promise<{ entry: DiaryEntry; baseItems?: DiaryEntryItem[] } | null> {
  if (editId) {
    const e = await db.entries.get(editId)
    return e ? { entry: deepCopy(e) } : null
  }
  const settings = await getSettings()
  const now = nowInZone(settings.timeZone)
  const date = params.get('date') && isValidDate(params.get('date')!) ? params.get('date')! : now.date
  const entry = blankEntry(date, now.time)
  const category = params.get('category')
  if (category === 'drink') entry.category = 'drink'
  if (prefillName) entry.name = prefillName

  const foodId = params.get('food')
  const mealId = params.get('meal')
  const repeatId = params.get('repeat')

  if (foodId) {
    const food = await db.foods.get(foodId)
    if (food) {
      const fromFood = entryFromFood(food, entry)
      if (entry.category === 'drink') fromFood.category = 'drink'
      return { entry: fromFood }
    }
  } else if (mealId) {
    const meal = await db.mealTemplates.get(mealId)
    if (meal) {
      const foods = new Map((await db.foods.toArray()).map((f) => [f.id, f]))
      entry.name = meal.name
      entry.category = meal.category
      entry.items = templateToEntryItems(meal, foods)
      if (meal.photoId) entry.photoIds = [meal.photoId]
      entry.source = { kind: 'meal', refId: meal.id, refName: meal.name, portionFactor: 1 }
      return { entry, baseItems: deepCopy(entry.items) }
    }
  } else if (repeatId) {
    const prev = await db.entries.get(repeatId)
    if (prev) {
      Object.assign(entry, {
        name: prev.name,
        category: prev.category,
        description: prev.description,
        preparationMethod: prev.preparationMethod,
        totalAmount: prev.totalAmount ? { ...prev.totalAmount } : undefined,
        manualNutrition: prev.manualNutrition ? { ...prev.manualNutrition } : undefined,
        items: prev.items.map((i) => ({ ...deepCopy(i), id: uid() })),
        source: { kind: 'repeat', refId: prev.id, refName: prev.name },
      })
    }
  }
  return { entry }
}

export function EntryFormPage() {
  const { id: editId } = useParams()
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const settings = useSettings()

  const [entry, setEntry] = useState<DiaryEntry | null>(null)
  const [baseItems, setBaseItems] = useState<DiaryEntryItem[]>()
  const [photos, setPhotos] = useState<PhotoSlot[]>([])
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [picker, setPicker] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [showNutrition, setShowNutrition] = useState(false)
  const [nameError, setNameError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    // Typed text arrives via router state, never the URL.
    const prefillName = (location.state as { name?: string } | null)?.name
    void buildInitial(params, editId, prefillName).then((r) => {
      if (cancelled) return
      if (!r) return setNotFound(true)
      setEntry(r.entry)
      setBaseItems(r.baseItems)
      setPhotos(slotsFromIds(r.entry.photoIds))
      const e = r.entry
      setShowMore(!!(e.notes || e.preparationMethod || e.totalAmount))
      setShowNutrition(hasNutritionValues(e.manualNutrition))
    })
    return () => {
      cancelled = true
    }
    // Initialise once per route; later param changes are navigation to a new form.
  }, [editId])

  const nutrition = useMemo(() => (entry ? entryNutrition(entry) : null), [entry])

  if (notFound) {
    return (
      <div>
        <PageHeader title="Entry not found" back="/diary" />
        <p className="text-muted">This entry no longer exists.</p>
      </div>
    )
  }
  if (!entry) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-muted">
        <Spinner className="size-6" />
      </div>
    )
  }

  const set = (patch: Partial<DiaryEntry>) => setEntry((e) => (e ? { ...e, ...patch } : e))
  const setItems = (items: DiaryEntryItem[]) => set({ items })
  const isMeal = entry.source.kind === 'meal' && !!baseItems
  const factor = entry.source.portionFactor ?? 1

  function applyPortion(f: number) {
    if (!baseItems || !entry) return
    setEntry({
      ...entry,
      items: entry.items.map((i) => {
        const base = baseItems.find((b) => b.id === i.id)
        return base?.amount !== undefined ? { ...i, amount: Math.round(base.amount * f * 100) / 100 } : i
      }),
      source: { ...entry.source, portionFactor: f },
    })
  }

  function addFood(food: Food) {
    if (!entry) return
    const items = [...entry.items, foodToEntryItem(food)]
    set({ items, name: entry.name || food.name })
    // An entry without photos takes the food's photo; it can still be removed.
    if (photos.length === 0 && food.photoId) setPhotos(slotsFromIds([food.photoId]))
    setPicker(false)
    toast.success(`Added ${food.name}`)
  }

  function addMeal(meal: MealTemplate) {
    void db.foods.toArray().then((foods) => {
      if (!entry) return
      const map = new Map(foods.map((f) => [f.id, f]))
      set({ items: [...entry.items, ...templateToEntryItems(meal, map)], name: entry.name || meal.name })
      setPicker(false)
      toast.success(`Added ${meal.name}`)
    })
  }

  async function save() {
    if (!entry) return
    const name = clean(entry.name) ?? clean(entry.items[0]?.name)
    if (!name) {
      setNameError('Give this entry a name, e.g. “Lentil soup”.')
      document.getElementById('entry-name')?.focus()
      return
    }
    if (!isValidDate(entry.date) || !isValidTime(entry.time)) {
      toast.error('Please enter a valid date and time.')
      return
    }
    setSaving(true)
    try {
      const final: DiaryEntry = {
        ...entry,
        name,
        description: clean(entry.description),
        notes: clean(entry.notes),
        preparationMethod: clean(entry.preparationMethod),
        totalAmount: entry.totalAmount?.amount !== undefined && entry.totalAmount.unit ? entry.totalAmount : undefined,
        manualNutrition: showNutrition && hasNutritionValues(entry.manualNutrition) ? entry.manualNutrition : undefined,
        photoIds: photos.map((p) => p.id),
        items: entry.items
          .filter((i) => i.name.trim())
          .map((i) => ({
            ...i,
            name: i.name.trim(),
            ingredients: i.ingredients.filter((x) => x.name.trim()),
            nutrition: i.nutrition
              ? { ...i.nutrition, extras: i.nutrition.extras.filter((x) => x.name.trim() && Number.isFinite(x.amount)) }
              : undefined,
          })),
      }
      await saveEntry(final, draftsOf(photos))
      toast.success(editId ? 'Entry updated' : 'Saved to your diary')
      if (editId) navigate(`/entry/${final.id}`, { replace: true })
      else navigate(final.date === nowInZone(settings.timeZone).date ? '/' : '/diary', { replace: true })
    } catch (e) {
      toast.error(`Could not save: ${(e as Error).message}`)
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title={editId ? 'Edit entry' : entry.source.kind === 'meal' ? 'Log meal' : 'New entry'} back />

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <FormSection>
          <PhotoPicker value={photos} onChange={setPhotos} />
          <Field label="What did you have?" error={nameError}>
            {(id) => (
              <Input
                id="entry-name"
                aria-describedby={id}
                value={entry.name}
                onChange={(e) => {
                  set({ name: e.target.value })
                  setNameError(undefined)
                }}
                placeholder="e.g. Labneh with pita and olives"
                className="h-12 text-base"
                enterKeyHint="next"
              />
            )}
          </Field>
          <CategoryPicker value={entry.category} onChange={(category) => set({ category })} />
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <Field label="Date">
              {(id) => <Input id={id} type="date" value={entry.date} onChange={(e) => set({ date: e.target.value })} required />}
            </Field>
            <Field label="Time">
              {(id) => <Input id={id} type="time" step={60} value={entry.time} onChange={(e) => set({ time: e.target.value })} required />}
            </Field>
            <Button
              variant="secondary"
              size="icon"
              className="mb-0 rounded-control"
              aria-label="Set to now"
              title="Now"
              onClick={() => set(nowInZone(settings.timeZone))}
            >
              <Clock className="size-4.5" />
            </Button>
          </div>
          <Field label="Description" optional>
            {(id) => (
              <Textarea
                id={id}
                value={entry.description ?? ''}
                onChange={(e) => set({ description: e.target.value })}
                placeholder="How it was prepared, where you ate, how much was left…"
                rows={2}
              />
            )}
          </Field>
        </FormSection>

        <FormSection
          title="Foods & quantities"
          description={isMeal ? 'Adjust today’s amounts freely – your saved meal stays unchanged.' : 'Optional. Add what the dish contained and how much you had.'}
        >
          {isMeal && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-ink-2">Portion</span>
              <div className="flex flex-wrap gap-2">
                {PORTIONS.map((p) => (
                  <Chip key={p} active={factor === p} onClick={() => applyPortion(p)}>
                    {p === 0.5 ? '½' : p === 1.5 ? '1½' : p}×
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {entry.items.map((item) => (
            <EntryItemEditor
              key={item.id}
              item={item}
              showNutrition
              onChange={(next) => setItems(entry.items.map((i) => (i.id === item.id ? next : i)))}
              onRemove={() => setItems(entry.items.filter((i) => i.id !== item.id))}
            />
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="soft" size="sm" onClick={() => setPicker(true)}>
              <Library className="size-4" /> Add from library
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setItems([...entry.items, { id: uid(), name: '', unit: 'g', ingredients: [], conversions: [] }])}
            >
              <Plus className="size-4" /> Add ingredient
            </Button>
          </div>
        </FormSection>

        <FormSection>
          <button type="button" onClick={() => setShowMore((s) => !s)} className="flex items-center justify-between text-left" aria-expanded={showMore}>
            <span>
              <span className="block text-[0.9375rem] font-semibold">Notes & more details</span>
              <span className="block text-xs text-muted">Notes, total amount, preparation method</span>
            </span>
            <ChevronDown className={`size-5 text-muted transition-transform ${showMore ? 'rotate-180' : ''}`} />
          </button>
          {showMore && (
            <>
              <Field label="Notes" optional hint="Anything your dietitian should know – hunger, mood, symptoms, context.">
                {(id) => <Textarea id={id} value={entry.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} rows={3} />}
              </Field>
              <Field label="Total amount consumed" optional>
                {(id) => (
                  <QuantityInput
                    idForAmount={id}
                    amount={entry.totalAmount?.amount}
                    unit={entry.totalAmount?.unit ?? 'portion'}
                    onChange={(q) => set({ totalAmount: q.amount !== undefined && q.unit ? { amount: q.amount, unit: q.unit } : undefined })}
                  />
                )}
              </Field>
              <Field label="Preparation method" optional>
                {(id) => (
                  <Input
                    id={id}
                    value={entry.preparationMethod ?? ''}
                    onChange={(e) => set({ preparationMethod: e.target.value })}
                    placeholder="e.g. grilled, fried in olive oil, raw"
                  />
                )}
              </Field>
            </>
          )}
        </FormSection>

        <FormSection title="Nutrition" description="Optional. Calculated from library foods when available – missing values are never counted as zero.">
          {nutrition && !showNutrition && <NutritionTable summary={nutrition} compact emptyText="No nutritional information for these items." />}
          <Switch
            checked={showNutrition}
            onChange={setShowNutrition}
            label="Enter totals for this entry myself"
            description="Overrides the calculated values, e.g. from a package label."
          />
          {showNutrition && (
            <NutrientValuesEditor values={entry.manualNutrition ?? {}} onChange={(manualNutrition) => set({ manualNutrition })} />
          )}
        </FormSection>

        <div className="sticky bottom-0 z-20 -mx-4 mt-2 border-t border-line bg-canvas/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-2xl lg:border lg:px-4">
          <div className="flex gap-2.5">
            <Button variant="secondary" size="lg" onClick={() => navigate(-1)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" size="lg" className="flex-[2]" disabled={saving}>
              {saving ? <Spinner /> : null} {editId ? 'Save changes' : 'Save entry'}
            </Button>
          </div>
        </div>
      </form>

      <LibraryPicker open={picker} onOpenChange={setPicker} onPickFood={addFood} onPickMeal={addMeal} />
    </div>
  )
}
