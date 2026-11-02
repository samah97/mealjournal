import { db } from './db'
import { newFood } from './repo'
import type { Food } from './types'

/**
 * Optional starter library. Names, categories and default serving units only –
 * no nutritional values are invented. Every record is flagged `isExample` so it
 * is labelled in the UI and can be removed in one action.
 */
const STARTER: Pick<Food, 'name' | 'category' | 'defaultServing' | 'tags'>[] = [
  { name: 'Labneh', category: 'Dairy & cheese', defaultServing: { amount: 50, unit: 'g' }, tags: ['lebanese'] },
  { name: 'Pita bread', category: 'Bread & grains', defaultServing: { amount: 1, unit: 'piece' }, tags: ['lebanese'] },
  { name: "Manoushe (za'atar)", category: 'Bread & grains', defaultServing: { amount: 1, unit: 'piece' }, tags: ['lebanese'] },
  { name: 'Halloumi', category: 'Dairy & cheese', defaultServing: { amount: 50, unit: 'g' }, tags: [] },
  { name: 'Lebanese white cheese', category: 'Dairy & cheese', defaultServing: { amount: 40, unit: 'g' }, tags: ['lebanese'] },
  { name: 'Olive oil', category: 'Oils & spreads', defaultServing: { amount: 1, unit: 'tbsp' }, tags: [] },
  { name: 'Olives', category: 'Vegetables', defaultServing: { amount: 20, unit: 'g' }, tags: [] },
  { name: 'Hummus', category: 'Dips & sauces', defaultServing: { amount: 50, unit: 'g' }, tags: ['lebanese'] },
  { name: 'Chicken breast', category: 'Meat & fish', defaultServing: { amount: 150, unit: 'g' }, tags: [] },
  { name: 'Rice (cooked)', category: 'Bread & grains', defaultServing: { amount: 150, unit: 'g' }, tags: [] },
  { name: 'Greek yoghurt', category: 'Dairy & cheese', defaultServing: { amount: 150, unit: 'g' }, tags: [] },
  { name: 'Cucumber', category: 'Vegetables', defaultServing: { amount: 1, unit: 'piece' }, tags: [] },
  { name: 'Tomato', category: 'Vegetables', defaultServing: { amount: 1, unit: 'piece' }, tags: [] },
  { name: 'Black tea', category: 'Drinks', defaultServing: { amount: 250, unit: 'ml' }, tags: [] },
  { name: 'Water', category: 'Drinks', defaultServing: { amount: 250, unit: 'ml' }, tags: [] },
]

export async function addStarterFoods(): Promise<number> {
  const existing = new Set((await db.foods.toArray()).map((f) => f.name.toLowerCase()))
  const toAdd = STARTER.filter((s) => !existing.has(s.name.toLowerCase())).map((s) =>
    newFood({ ...s, isExample: true }),
  )
  await db.foods.bulkAdd(toAdd)
  return toAdd.length
}

/** Removes starter foods that were never edited by the user. */
export async function removeStarterFoods(): Promise<number> {
  const examples = await db.foods.filter((f) => !!f.isExample).toArray()
  await db.foods.bulkDelete(examples.map((f) => f.id))
  return examples.length
}
