import type { MealCategory } from './types'

export const MEAL_CATEGORIES: { id: MealCategory; label: string; color: string }[] = [
  { id: 'breakfast', label: 'Breakfast', color: 'var(--color-cat-breakfast)' },
  { id: 'lunch', label: 'Lunch', color: 'var(--color-cat-lunch)' },
  { id: 'dinner', label: 'Dinner', color: 'var(--color-cat-dinner)' },
  { id: 'snack', label: 'Snack', color: 'var(--color-cat-snack)' },
  { id: 'drink', label: 'Drink', color: 'var(--color-cat-drink)' },
  { id: 'other', label: 'Other', color: 'var(--color-cat-other)' },
]

export function categoryLabel(c: MealCategory): string {
  return MEAL_CATEGORIES.find((x) => x.id === c)?.label ?? 'Other'
}

export function categoryColor(c: MealCategory): string {
  return MEAL_CATEGORIES.find((x) => x.id === c)?.color ?? 'var(--color-cat-other)'
}

/** A sensible default category for the current time of day. */
export function suggestCategory(time: string): MealCategory {
  const h = Number(time.slice(0, 2))
  if (h >= 5 && h < 11) return 'breakfast'
  if (h >= 11 && h < 15) return 'lunch'
  if (h >= 17 && h < 22) return 'dinner'
  return 'snack'
}

export const FOOD_CATEGORIES = [
  'Bread & grains',
  'Dairy & cheese',
  'Meat & fish',
  'Eggs',
  'Legumes',
  'Vegetables',
  'Fruit',
  'Nuts & seeds',
  'Oils & spreads',
  'Dips & sauces',
  'Homemade dishes',
  'Sweets & pastries',
  'Snacks',
  'Drinks',
  'Herbs & spices',
  'Other',
]
