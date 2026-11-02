import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ConversionsEditor, IngredientsEditor } from '@/components/editors'
import { QuantityInput } from '@/components/inputs'
import { NutritionEditor } from '@/components/nutrition'
import { draftsOf, PhotoPicker, slotsFromIds, type PhotoSlot } from '@/components/photos'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/confirm'
import { Field, FormSection, Input, Textarea } from '@/components/ui/Field'
import { PageHeader, Spinner, Switch } from '@/components/ui/misc'
import { FOOD_CATEGORIES } from '@/lib/categories'
import { db } from '@/lib/db'
import { profileHasData } from '@/lib/nutrition'
import { deleteFood, newFood, saveFood } from '@/lib/repo'
import type { Food } from '@/lib/types'
import { formatQuantity, isMetric } from '@/lib/units'
import { clean, deepCopy } from '@/lib/utils'

export function FoodFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const [food, setFood] = useState<Food | null>(null)
  const [photos, setPhotos] = useState<PhotoSlot[]>([])
  const [tagsText, setTagsText] = useState('')
  const [withNutrition, setWithNutrition] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!id) {
      const f = newFood({ defaultServing: { amount: 100, unit: 'g' } })
      setFood(f)
      return
    }
    void db.foods.get(id).then((f) => {
      if (!f) return setMissing(true)
      setFood(deepCopy(f))
      setPhotos(slotsFromIds([f.photoId]))
      setTagsText(f.tags.join(', '))
      setWithNutrition(!!f.nutrition)
    })
  }, [id])

  if (missing) {
    return (
      <div>
        <PageHeader title="Food not found" back="/foods" />
      </div>
    )
  }
  if (!food) return null

  const set = (patch: Partial<Food>) => setFood((f) => (f ? { ...f, ...patch } : f))
  const serving = food.defaultServing
  const needsConversion =
    serving && !isMetric(serving.unit) && serving.unit !== 'serving' && !food.conversions.some((c) => c.unit === serving.unit)

  async function save() {
    if (!food) return
    const name = clean(food.name)
    if (!name) {
      setError('Please give this food a name.')
      return
    }
    setSaving(true)
    const nutrition =
      withNutrition && food.nutrition
        ? { ...food.nutrition, extras: food.nutrition.extras.filter((e) => e.name.trim() && Number.isFinite(e.amount)) }
        : undefined
    const final: Food = {
      ...food,
      name,
      brand: clean(food.brand),
      description: clean(food.description),
      category: clean(food.category),
      preparationNotes: clean(food.preparationNotes),
      tags: tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      defaultServing: serving && Number.isFinite(serving.amount) && serving.amount > 0 ? serving : undefined,
      conversions: food.conversions.filter((c) => c.amount > 0),
      ingredients: food.ingredients.filter((i) => i.name.trim()),
      nutrition: nutrition && profileHasData(nutrition) ? nutrition : undefined,
      photoId: photos[0]?.id,
      isExample: false,
    }
    try {
      await saveFood(final, draftsOf(photos))
      toast.success(id ? 'Food updated' : 'Food saved to your library')
      navigate(-1)
    } catch (e) {
      toast.error((e as Error).message)
      setSaving(false)
    }
  }

  async function remove() {
    if (!food) return
    const ok = await confirm({
      title: `Delete “${food.name}”?`,
      message: 'It will be removed from your library. Diary entries where you logged it keep their recorded details.',
      confirmLabel: 'Delete food',
      danger: true,
    })
    if (!ok) return
    await deleteFood(food.id)
    toast.success('Food deleted')
    navigate('/foods', { replace: true })
  }

  return (
    <div>
      <PageHeader
        title={id ? 'Edit food' : 'New food'}
        back
        actions={
          id && (
            <Button variant="soft" size="sm" onClick={() => navigate(`/entry/new?food=${food.id}`)}>
              <Plus className="size-4" /> Log
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
                value={food.name}
                onChange={(e) => {
                  set({ name: e.target.value })
                  setError(undefined)
                }}
                placeholder="e.g. Labneh, Mum's lentil soup"
                className="h-12 text-base"
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Brand" optional>
              {(fid) => <Input id={fid} value={food.brand ?? ''} onChange={(e) => set({ brand: e.target.value })} />}
            </Field>
            <Field label="Category" optional>
              {(fid) => (
                <>
                  <Input id={fid} list="food-categories" value={food.category ?? ''} onChange={(e) => set({ category: e.target.value })} placeholder="Choose or type" />
                  <datalist id="food-categories">
                    {FOOD_CATEGORIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
          </div>
          <Field label="Description" optional>
            {(fid) => <Textarea id={fid} value={food.description ?? ''} onChange={(e) => set({ description: e.target.value })} rows={2} />}
          </Field>
          <Field label="Tags" optional hint="Separate with commas, e.g. homemade, lebanese">
            {(fid) => <Input id={fid} value={tagsText} onChange={(e) => setTagsText(e.target.value)} />}
          </Field>
          <Switch checked={food.favourite} onChange={(favourite) => set({ favourite })} label="Favourite" description="Shown first when adding to your diary." />
        </FormSection>

        <FormSection title="Serving" description="The amount you usually have. Pre-filled when you log this food – you can always change it.">
          <QuantityInput
            amount={serving && Number.isFinite(serving.amount) ? serving.amount : undefined}
            unit={serving?.unit ?? 'g'}
            onChange={(q) => set({ defaultServing: q.amount !== undefined && q.unit ? { amount: q.amount, unit: q.unit } : q.unit ? { amount: NaN, unit: q.unit } : undefined })}
          />
          <div className="flex flex-col gap-2">
            <span className="text-[0.8125rem] font-medium text-ink-2">Unit conversions</span>
            <p className="-mt-1 text-xs leading-relaxed text-muted">
              A piece, slice or tablespoon has no universal weight. Tell MealJournal what yours weighs so nutrition can be calculated.
            </p>
            {needsConversion && (
              <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">
                Add a conversion for “{formatQuantity(1, serving!.unit)}” to calculate nutrition per 100 g or 100 ml.
              </p>
            )}
            <ConversionsEditor value={food.conversions} onChange={(conversions) => set({ conversions })} />
          </div>
        </FormSection>

        <FormSection title="Ingredients" description="Optional – useful for homemade foods.">
          <IngredientsEditor value={food.ingredients} onChange={(ingredients) => set({ ingredients })} />
          <Field label="Preparation notes" optional>
            {(fid) => (
              <Textarea id={fid} value={food.preparationNotes ?? ''} onChange={(e) => set({ preparationNotes: e.target.value })} rows={2} placeholder="e.g. baked, no added salt" />
            )}
          </Field>
        </FormSection>

        <FormSection title="Nutrition" description="Optional. Fill in only what you know – empty fields stay unknown, never zero.">
          <Switch checked={withNutrition} onChange={setWithNutrition} label="Add nutritional information" />
          {withNutrition && (
            <NutritionEditor
              value={food.nutrition}
              onChange={(nutrition) => set({ nutrition })}
              servingDescription={serving && Number.isFinite(serving.amount) ? formatQuantity(serving.amount, serving.unit) : undefined}
            />
          )}
        </FormSection>

        {id && (
          <Button variant="danger-soft" onClick={() => void remove()}>
            <Trash2 className="size-4" /> Delete food
          </Button>
        )}

        <div className="sticky bottom-0 z-20 -mx-4 mt-2 border-t border-line bg-canvas/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-2xl lg:border lg:px-4">
          <div className="flex gap-2.5">
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" size="lg" className="flex-[2]" disabled={saving}>
              {saving && <Spinner />} Save food
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
