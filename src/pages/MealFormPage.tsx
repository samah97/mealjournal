import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, Copy, Library, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { CategoryPicker, QuantityInput } from '@/components/inputs'
import { LibraryPicker } from '@/components/library'
import { NutritionEditor, NutritionTable } from '@/components/nutrition'
import { draftsOf, PhotoPicker, slotsFromIds, type PhotoSlot } from '@/components/photos'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/confirm'
import { Field, FormSection, Input, Textarea } from '@/components/ui/Field'
import { Badge, PageHeader, Spinner } from '@/components/ui/misc'
import { db } from '@/lib/db'
import { itemsNutrition, profileHasData } from '@/lib/nutrition'
import { deleteTemplate, duplicateTemplate, newTemplate, saveTemplate } from '@/lib/repo'
import { templateNutritionSources } from '@/lib/snapshot'
import type { Food, MealTemplate, MealTemplateItem } from '@/lib/types'
import { clean, cn, deepCopy, uid } from '@/lib/utils'

function TemplateItemRow({
  item,
  food,
  onChange,
  onRemove,
}: {
  item: MealTemplateItem
  food?: Food
  onChange: (i: MealTemplateItem) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const linked = !!item.foodId
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center gap-2">
        {linked ? (
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2 px-1">
            <span className="truncate font-medium">{food?.name ?? item.name}</span>
            {food ? <Badge>Library</Badge> : <Badge tone="warn">Deleted from library</Badge>}
          </div>
        ) : (
          <Input value={item.name} onChange={(e) => onChange({ ...item, name: e.target.value })} placeholder="Ingredient" aria-label="Ingredient name" className="flex-1" />
        )}
        <Button variant="ghost" size="icon" aria-label="Remove item" onClick={onRemove}>
          <Trash2 className="size-4" />
        </Button>
      </div>
      <div className="mt-2">
        <QuantityInput amount={item.amount} unit={item.unit} onChange={(q) => onChange({ ...item, amount: q.amount, unit: q.unit })} />
      </div>
      {!linked && (
        <>
          <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 flex items-center gap-1 text-xs font-medium text-accent-ink" aria-expanded={open}>
            Nutrition (optional) <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
          </button>
          {open && (
            <div className="mt-3">
              <NutritionEditor bases={['per100g', 'per100ml']} value={item.nutrition} onChange={(nutrition) => onChange({ ...item, nutrition })} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function MealFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const foods = useLiveQuery(() => db.foods.toArray(), [], [])
  const foodMap = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods])
  const [meal, setMeal] = useState<MealTemplate | null>(null)
  const [photos, setPhotos] = useState<PhotoSlot[]>([])
  const [picker, setPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!id) return setMeal(newTemplate())
    void db.mealTemplates.get(id).then((m) => {
      if (!m) return setMissing(true)
      setMeal(deepCopy(m))
      setPhotos(slotsFromIds([m.photoId]))
    })
  }, [id])

  const nutrition = useMemo(() => (meal ? itemsNutrition(templateNutritionSources(meal, foodMap)) : null), [meal, foodMap])

  if (missing) return <PageHeader title="Meal not found" back="/meals" />
  if (!meal) return null

  const set = (patch: Partial<MealTemplate>) => setMeal((m) => (m ? { ...m, ...patch } : m))
  const setItems = (items: MealTemplateItem[]) => set({ items })

  function addFood(f: Food) {
    if (!meal) return
    setItems([
      ...meal.items,
      { id: uid(), foodId: f.id, name: f.name, amount: f.defaultServing?.amount, unit: f.defaultServing?.unit ?? 'g' },
    ])
    setPicker(false)
    toast.success(`Added ${f.name}`)
  }

  async function save(logAfter = false) {
    if (!meal) return
    const name = clean(meal.name)
    if (!name) {
      setError('Please give this meal a name.')
      return
    }
    setSaving(true)
    const final: MealTemplate = {
      ...meal,
      name,
      description: clean(meal.description),
      instructions: clean(meal.instructions),
      photoId: photos[0]?.id,
      items: meal.items
        .filter((i) => i.foodId || i.name.trim())
        .map((i) => ({
          ...i,
          name: i.foodId ? (foodMap.get(i.foodId)?.name ?? i.name) : i.name.trim(),
          nutrition: i.nutrition && profileHasData(i.nutrition) ? i.nutrition : undefined,
        })),
    }
    try {
      await saveTemplate(final, draftsOf(photos))
      toast.success(id ? 'Meal updated' : 'Meal saved')
      if (logAfter) navigate(`/entry/new?meal=${final.id}`, { replace: true })
      else navigate(-1)
    } catch (e) {
      toast.error((e as Error).message)
      setSaving(false)
    }
  }

  async function remove() {
    if (!meal) return
    const ok = await confirm({
      title: `Delete “${meal.name}”?`,
      message: 'The saved meal will be removed. Diary entries where you logged it are not affected.',
      confirmLabel: 'Delete meal',
      danger: true,
    })
    if (!ok) return
    await deleteTemplate(meal.id)
    toast.success('Meal deleted')
    navigate('/meals', { replace: true })
  }

  return (
    <div>
      <PageHeader
        title={id ? 'Edit meal' : 'New meal'}
        back
        actions={
          id && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Duplicate meal"
              onClick={async () => {
                const newId = await duplicateTemplate(meal.id)
                toast.success('Meal duplicated')
                if (newId) navigate(`/meals/${newId}`, { replace: true })
              }}
            >
              <Copy className="size-4.5" />
            </Button>
          )
        }
      />
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <FormSection>
          <PhotoPicker value={photos} onChange={setPhotos} max={1} compact />
          <Field label="Name" error={error}>
            {(fid) => (
              <Input
                id={fid}
                value={meal.name}
                onChange={(e) => {
                  set({ name: e.target.value })
                  setError(undefined)
                }}
                placeholder="e.g. Lebanese breakfast"
                className="h-12 text-base"
              />
            )}
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.8125rem] font-medium text-ink-2">Usually eaten as</span>
            <CategoryPicker value={meal.category} onChange={(category) => set({ category })} />
          </div>
          <Field label="Description" optional>
            {(fid) => <Textarea id={fid} value={meal.description ?? ''} onChange={(e) => set({ description: e.target.value })} rows={2} />}
          </Field>
        </FormSection>

        <FormSection title="Foods & ingredients" description="Linked library foods use their saved details each time you log this meal.">
          {meal.items.map((item) => (
            <TemplateItemRow
              key={item.id}
              item={item}
              food={item.foodId ? foodMap.get(item.foodId) : undefined}
              onChange={(next) => setItems(meal.items.map((i) => (i.id === item.id ? next : i)))}
              onRemove={() => setItems(meal.items.filter((i) => i.id !== item.id))}
            />
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="soft" size="sm" onClick={() => setPicker(true)}>
              <Library className="size-4" /> Add saved food
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setItems([...meal.items, { id: uid(), name: '', unit: 'g' }])}>
              <Plus className="size-4" /> Custom ingredient
            </Button>
          </div>
        </FormSection>

        <FormSection title="Preparation" description="Optional instructions or notes.">
          <Textarea value={meal.instructions ?? ''} onChange={(e) => set({ instructions: e.target.value })} rows={3} aria-label="Preparation instructions" />
        </FormSection>

        {nutrition && meal.items.length > 0 && (
          <FormSection title="Nutrition per portion" description="Calculated from ingredients that have nutritional data. Nothing is estimated.">
            <NutritionTable summary={nutrition} emptyText="None of these ingredients has nutritional data." />
          </FormSection>
        )}

        {id && (
          <Button variant="danger-soft" onClick={() => void remove()}>
            <Trash2 className="size-4" /> Delete meal
          </Button>
        )}

        <div className="sticky bottom-0 z-20 -mx-4 mt-2 border-t border-line bg-canvas/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-2xl lg:border lg:px-4">
          <div className="flex gap-2.5">
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => void save(true)} disabled={saving}>
              Save & log
            </Button>
            <Button type="submit" size="lg" className="flex-1" disabled={saving}>
              {saving && <Spinner />} Save meal
            </Button>
          </div>
        </div>
      </form>
      <LibraryPicker open={picker} onOpenChange={setPicker} onPickFood={addFood} title="Add a saved food" />
    </div>
  )
}
