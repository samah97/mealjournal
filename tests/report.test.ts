import { describe, expect, it } from 'vitest'
import { buildReport, reportEntryCount, reportPhotoIds } from '../src/lib/report/buildReport'
import type { DiaryEntry, ReportOptions } from '../src/lib/types'

const ALL: ReportOptions = {
  includePhotos: true,
  includeIngredients: true,
  includeNotes: true,
  includeNutrition: true,
  includeSummaries: true,
}
const NONE: ReportOptions = {
  includePhotos: false,
  includeIngredients: false,
  includeNotes: false,
  includeNutrition: false,
  includeSummaries: false,
}

function e(id: string, date: string, time: string, extra: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id,
    date,
    time,
    category: 'lunch',
    name: `Meal ${id}`,
    description: `desc ${id}`,
    notes: `secret note ${id}`,
    photoIds: [`p-${id}`],
    items: [
      {
        id: 'i1',
        name: 'Labneh',
        amount: 100,
        unit: 'g',
        ingredients: [],
        conversions: [],
        nutrition: { basis: 'per100g', values: { energyKcal: 160 }, extras: [] },
      },
      { id: 'i2', name: 'Bread', amount: 1, unit: 'piece', ingredients: [], conversions: [] },
    ],
    source: { kind: 'free' },
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  }
}

const entries = [
  e('a', '2026-10-31', '12:00'),
  e('b', '2026-11-01', '19:30'),
  e('c', '2026-11-01', '08:15'),
  e('d', '2026-11-08', '09:00'),
]
const photoMeta = new Map(entries.map((x) => [`p-${x.id}`, { width: 1600, height: 1200 }]))
const base = {
  entries,
  photoMeta,
  periodStart: '2026-11-01',
  periodEnd: '2026-11-07',
  timeZone: 'Europe/Amsterdam',
  now: new Date('2026-11-08T10:00:00Z'),
}

describe('buildReport', () => {
  it('covers every day of the period and only entries inside it, in chronological order', () => {
    const r = buildReport({ ...base, options: ALL })
    expect(r.days.map((d) => d.date)).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
    ])
    expect(reportEntryCount(r)).toBe(2)
    expect(r.days[0]!.entries.map((x) => x.time)).toEqual(['08:15', '19:30'])
    expect(JSON.stringify(r)).not.toContain('Meal a')
    expect(JSON.stringify(r)).not.toContain('Meal d')
  })

  it('includes photos, ingredients, notes and nutrition when selected', () => {
    const r = buildReport({ ...base, options: ALL })
    const x = r.days[0]!.entries[0]!
    expect(x.photos).toEqual([{ id: 'p-c', width: 1600, height: 1200 }])
    expect(x.items.map((i) => i.quantity)).toEqual(['100 g', '1 piece'])
    expect(x.notes).toBe('secret note c')
    expect(x.nutrition?.values.energyKcal).toBe(160)
    expect(x.nutrition?.note).toMatch(/Incomplete/)
    expect(r.days[0]!.nutrition?.values.energyKcal).toBe(320)
    expect(reportPhotoIds(r)).toEqual(['p-c', 'p-b'])
  })

  it('omits everything that was not selected – nothing excluded is present in the payload', () => {
    const r = buildReport({ ...base, options: NONE })
    const json = JSON.stringify(r)
    expect(json).not.toContain('secret note')
    expect(json).not.toContain('desc ')
    expect(json).not.toContain('Labneh')
    expect(json).not.toContain('p-c')
    expect(json).not.toContain('energyKcal')
    expect(r.days[0]!.entries[0]!.name).toBe('Meal c')
    expect(reportPhotoIds(r)).toEqual([])
  })

  it('shows a single-food entry as one line with its quantity', () => {
    const single = e('s', '2026-11-02', '10:00', {
      name: 'Labneh',
      items: [
        {
          id: 'i',
          name: 'Labneh',
          amount: 150,
          unit: 'g',
          ingredients: [{ id: 'x', name: 'strained yoghurt' }],
          conversions: [],
        },
      ],
    })
    const r = buildReport({ ...base, entries: [single], options: ALL })
    const x = r.days[1]!.entries[0]!
    expect(x.quantity).toBe('150 g')
    expect(x.items).toEqual([])
    expect(x.ingredients).toEqual(['strained yoghurt'])
  })
})
