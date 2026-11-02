import { suggestCategory } from './categories'
import type { DiaryEntry, DiaryEntryItem, Food, MealTemplate, MealTemplateItem, Quantity } from './types'
import { deepCopy, uid } from './utils'

/**
 * A new diary entry for one library food at the given moment. The food's photo
 * is used as the entry photo by default (photos are shared and ref-counted, so
 * later library edits never remove it from the entry).
 */
export function entryFromFood(food: Food, at: { date: string; time: string }): DiaryEntry {
  const now = Date.now()
  return {
    id: uid(),
    date: at.date,
    time: at.time,
    category: food.category === 'Drinks' ? 'drink' : suggestCategory(at.time),
    name: food.name,
    photoIds: food.photoId ? [food.photoId] : [],
    items: [foodToEntryItem(food)],
    source: { kind: 'food', refId: food.id, refName: food.name },
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * A favourite library food made from a diary entry (e.g. a coffee recorded as
 * free text), so it can be logged again in one tap. A single-item entry keeps
 * that item's serving, conversions and nutrition; nothing is invented.
 */
export function favouriteFoodFromEntry(entry: DiaryEntry): Omit<Food, 'id' | 'createdAt' | 'updatedAt' | 'useCount'> {
  const only = entry.items.length === 1 ? entry.items[0] : undefined
  const serving = only?.amount !== undefined && only.unit ? { amount: only.amount, unit: only.unit } : undefined
  return {
    name: entry.name,
    brand: only?.brand,
    description: entry.description,
    category: entry.category === 'drink' ? 'Drinks' : undefined,
    tags: [],
    // Per-serving nutrition only stays valid for the serving it was entered for.
    defaultServing: only?.nutrition?.basis === 'perServing' ? (only.servingSize ?? serving) : serving,
    conversions: only ? deepCopy(only.conversions) : [],
    ingredients: only ? deepCopy(only.ingredients) : [],
    preparationNotes: only?.preparation ?? entry.preparationMethod,
    nutrition: only?.nutrition ? deepCopy(only.nutrition) : undefined,
    photoId: entry.photoIds[0],
    favourite: true,
  }
}

/** Copy a library food into a self-contained diary item. */
export function foodToEntryItem(food: Food, consumed?: Partial<Quantity>): DiaryEntryItem {
  return {
    id: uid(),
    name: food.name,
    brand: food.brand,
    amount: consumed?.amount ?? food.defaultServing?.amount,
    unit: consumed?.unit ?? food.defaultServing?.unit,
    ingredients: deepCopy(food.ingredients),
    preparation: food.preparationNotes,
    nutrition: food.nutrition ? deepCopy(food.nutrition) : undefined,
    servingSize: food.defaultServing ? { ...food.defaultServing } : undefined,
    conversions: deepCopy(food.conversions),
    sourceFoodId: food.id,
  }
}

function scaleAmount(amount: number | undefined, factor: number): number | undefined {
  if (amount === undefined) return undefined
  return Math.round(amount * factor * 100) / 100
}

/**
 * Resolve a template item against the current library.
 * Linked foods are snapshotted now; a deleted food falls back to the stored name.
 */
export function templateItemToEntryItem(
  item: MealTemplateItem,
  foods: Map<string, Food>,
  portionFactor = 1,
): DiaryEntryItem {
  const amount = scaleAmount(item.amount, portionFactor)
  const food = item.foodId ? foods.get(item.foodId) : undefined
  if (food) {
    const out = foodToEntryItem(food, { amount, unit: item.unit ?? food.defaultServing?.unit })
    if (item.note) out.note = item.note
    return out
  }
  return {
    id: uid(),
    name: item.name,
    amount,
    unit: item.unit,
    note: item.note,
    ingredients: [],
    nutrition: item.nutrition ? deepCopy(item.nutrition) : undefined,
    servingSize: item.servingSize ? { ...item.servingSize } : undefined,
    conversions: [],
  }
}

export function templateToEntryItems(
  template: MealTemplate,
  foods: Map<string, Food>,
  portionFactor = 1,
): DiaryEntryItem[] {
  return template.items.map((i) => templateItemToEntryItem(i, foods, portionFactor))
}

/** Template items as nutrition sources, resolved live against the library. */
export function templateNutritionSources(template: Pick<MealTemplate, 'items'>, foods: Map<string, Food>) {
  return template.items.map((i) => templateItemToEntryItem(i, foods, 1))
}

/** Turn a diary entry's items back into template items (for "Save as meal"). */
export function entryItemsToTemplateItems(items: DiaryEntryItem[], foods: Map<string, Food>): MealTemplateItem[] {
  return items.map((i) => {
    const linked = i.sourceFoodId && foods.has(i.sourceFoodId)
    return {
      id: uid(),
      foodId: linked ? i.sourceFoodId : undefined,
      name: i.name,
      amount: i.amount,
      unit: i.unit,
      note: i.note,
      nutrition: linked ? undefined : i.nutrition ? deepCopy(i.nutrition) : undefined,
      servingSize: linked ? undefined : i.servingSize,
    }
  })
}

export function scaleEntryItems(items: DiaryEntryItem[], factor: number): DiaryEntryItem[] {
  return items.map((i) => ({ ...i, amount: scaleAmount(i.amount, factor) }))
}
