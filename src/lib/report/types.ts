import type { ExtraNutrient, MealCategory, NutrientKey, NutrientValues, ReportOptions } from '../types'

/**
 * A report is a self-contained, read-only snapshot. It is what gets rendered as
 * HTML, rendered to PDF, and – for share links – uploaded. Only fields allowed
 * by the chosen options are ever placed in it.
 */
export interface ReportNutrition {
  values: NutrientValues
  extras: ExtraNutrient[]
  incompleteKeys: NutrientKey[]
  sources: number
  withData: number
  hasAnyData: boolean
  note: string | null
}

export interface ReportItem {
  name: string
  brand?: string
  quantity?: string
  ingredients?: string[]
  note?: string
  nutrition?: ReportNutrition
}

export interface ReportPhoto {
  id: string
  width: number
  height: number
}

export interface ReportEntry {
  id: string
  time: string
  category: MealCategory
  name: string
  quantity?: string
  description?: string
  notes?: string
  preparation?: string
  ingredients?: string[]
  items: ReportItem[]
  photos: ReportPhoto[]
  nutrition?: ReportNutrition
}

export interface ReportDay {
  date: string
  entries: ReportEntry[]
  counts: Partial<Record<MealCategory, number>>
  nutrition?: ReportNutrition
}

export interface ReportData {
  version: 1
  title: string
  patientName?: string
  periodStart: string
  periodEnd: string
  generatedAt: string
  timeZone: string
  options: ReportOptions
  days: ReportDay[]
}

/** Resolves a report photo id to an image source (object URL, data URL or signed URL). */
export type PhotoResolver = (id: string) => string | undefined
