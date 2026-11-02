/**
 * Domain model.
 *
 * Library records (Food, MealTemplate) are *reusable and editable*.
 * Diary records (DiaryEntry, DiaryEntryItem) are *historical snapshots*: when a
 * food or meal is logged, everything needed to describe it – name, ingredients,
 * serving conversions and the nutrient profile – is copied into the entry, so
 * later edits to the library never rewrite history.
 */

export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink' | 'other'

export type UnitId = string

export interface Quantity {
  amount: number
  unit: UnitId
}

/** "1 <unit> = <amount> <base>", e.g. 1 piece = 60 g. Defined by the user, never assumed. */
export interface UnitConversion {
  unit: UnitId
  amount: number
  base: 'g' | 'ml'
}

export type NutrientKey =
  | 'energyKcal'
  | 'protein'
  | 'carbohydrates'
  | 'sugars'
  | 'fat'
  | 'saturatedFat'
  | 'fibre'
  | 'salt'

/** A missing key means "unknown" – it is never the same as 0. */
export type NutrientValues = Partial<Record<NutrientKey, number>>

/** Optional vitamins / minerals, e.g. { name: 'Vitamin C', amount: 12, unit: 'mg' }. */
export interface ExtraNutrient {
  name: string
  amount: number
  unit: string
}

/**
 * per100g / per100ml: values refer to 100 g or 100 ml.
 * perServing: values refer to one serving as defined by the owning record's `servingSize`.
 */
export type NutritionBasis = 'per100g' | 'per100ml' | 'perServing'

export interface NutrientProfile {
  basis: NutritionBasis
  values: NutrientValues
  extras: ExtraNutrient[]
}

/** FoodIngredient – an ingredient line of a food or entry. */
export interface Ingredient {
  id: string
  name: string
  amount?: number
  unit?: UnitId
}

export interface Food {
  id: string
  name: string
  brand?: string
  description?: string
  category?: string
  tags: string[]
  defaultServing?: Quantity
  conversions: UnitConversion[]
  ingredients: Ingredient[]
  preparationNotes?: string
  nutrition?: NutrientProfile
  photoId?: string
  favourite: boolean
  /** Starter content created by "Add starter foods" – clearly labelled and removable. */
  isExample?: boolean
  useCount: number
  lastUsedAt?: number
  createdAt: number
  updatedAt: number
}

/**
 * Item of a meal template. Either references a saved food (foodId, resolved live
 * while the template is in the library) or is a custom ingredient with its own data.
 */
export interface MealTemplateItem {
  id: string
  foodId?: string
  name: string
  amount?: number
  unit?: UnitId
  note?: string
  /** Custom ingredients only: optional nutrition (perServing = for `servingSize`). */
  nutrition?: NutrientProfile
  servingSize?: Quantity
}

export interface MealTemplate {
  id: string
  name: string
  description?: string
  category: MealCategory
  instructions?: string
  photoId?: string
  items: MealTemplateItem[]
  favourite: boolean
  useCount: number
  lastUsedAt?: number
  createdAt: number
  updatedAt: number
}

/** Self-contained snapshot of one food/ingredient as consumed. */
export interface DiaryEntryItem {
  id: string
  name: string
  brand?: string
  amount?: number
  unit?: UnitId
  note?: string
  ingredients: Ingredient[]
  preparation?: string
  nutrition?: NutrientProfile
  servingSize?: Quantity
  conversions: UnitConversion[]
  /** Where the snapshot came from – informational only, never followed for data. */
  sourceFoodId?: string
}

export type EntrySourceKind = 'food' | 'meal' | 'free' | 'repeat'

export interface DiaryEntry {
  id: string
  /** Local calendar date in the diary's time zone, YYYY-MM-DD. */
  date: string
  /** Local wall-clock time, HH:mm (24h). */
  time: string
  category: MealCategory
  name: string
  description?: string
  notes?: string
  preparationMethod?: string
  totalAmount?: Quantity
  photoIds: string[]
  items: DiaryEntryItem[]
  /** Optional nutrition for the whole entry as eaten; overrides item-based totals. */
  manualNutrition?: NutrientValues
  source: { kind: EntrySourceKind; refId?: string; refName?: string; portionFactor?: number }
  createdAt: number
  updatedAt: number
}

/** DiaryEntryPhoto (and library photos). Stored as compressed JPEG blobs. */
export interface Photo {
  id: string
  blob: Blob
  thumb: Blob
  width: number
  height: number
  createdAt: number
}

export interface ReportOptions {
  includePhotos: boolean
  includeIngredients: boolean
  includeNotes: boolean
  includeNutrition: boolean
  includeSummaries: boolean
}

export interface Settings {
  id: 'app'
  timeZone: string
  patientName?: string
  reportOptions: ReportOptions
  showNutritionOnHome: boolean
  onboarded: boolean
}

/** Local record of a published share link (the server holds only the token hash). */
export interface ShareLinkRecord {
  id: string
  title: string
  periodStart: string
  periodEnd: string
  createdAt: number
  expiresAt: number
  revokedAt?: number
  url?: string
  hasPin: boolean
  includesPhotos: boolean
  photoPaths: string[]
  viewCount?: number
  /** Revocation requested while offline – executed when connectivity returns. */
  pendingRevoke?: boolean
}
