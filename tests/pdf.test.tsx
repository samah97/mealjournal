// @vitest-environment node
import { renderToBuffer } from '@react-pdf/renderer'
import { describe, expect, it } from 'vitest'
import { buildReport } from '../src/lib/report/buildReport'
import { PDFDocument } from '@cantoo/pdf-lib'
import { addPageFooters, pdfSafeText, ReportDocument } from '../src/lib/report/pdf'
import type { DiaryEntry } from '../src/lib/types'

function entry(i: number, date: string): DiaryEntry {
  return {
    id: `e${i}`,
    date,
    time: `${String(7 + (i % 12)).padStart(2, '0')}:30`,
    category: (['breakfast', 'lunch', 'dinner', 'snack', 'drink'] as const)[i % 5]!,
    name: `Entry ${i} – labneh, pita & olives`,
    description: 'A long description that should wrap gracefully across the available width of the page. '.repeat(i % 3 + 1),
    notes: i % 2 ? 'Felt full afterwards.' : undefined,
    photoIds: [],
    items: [
      { id: 'a', name: 'Labneh', amount: 100, unit: 'g', ingredients: [], conversions: [], nutrition: { basis: 'per100g', values: { energyKcal: 160 }, extras: [] } },
      { id: 'b', name: 'Pita bread', amount: 1, unit: 'piece', ingredients: [], conversions: [] },
    ],
    source: { kind: 'free' },
    createdAt: i,
    updatedAt: i,
  }
}

describe('PDF rendering', () => {
  it('renders a multi-page A4 report, including days without entries', async () => {
    // 2026-11-04 is deliberately left empty.
    const dates = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06', '2026-11-07']
    const entries = dates.flatMap((d, di) => [0, 1, 2, 3].map((k) => entry(di * 4 + k, d)))
    const report = buildReport({
      entries,
      photoMeta: new Map(),
      periodStart: '2026-11-01',
      periodEnd: '2026-11-07',
      options: { includePhotos: true, includeIngredients: true, includeNotes: true, includeNutrition: true, includeSummaries: true },
      patientName: 'Test Patient',
      timeZone: 'Europe/Amsterdam',
    })
    const buf = await renderToBuffer(<ReportDocument report={report} images={{}} />)
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')

    const stamped = await addPageFooters(new Uint8Array(buf), 'MealJournal – Food Diary')
    const doc = await PDFDocument.load(stamped)
    expect(doc.getPageCount()).toBeGreaterThan(1)
    const [w, h] = [doc.getPage(0).getWidth(), doc.getPage(0).getHeight()]
    expect(Math.round(w)).toBe(595) // A4 portrait
    expect(Math.round(h)).toBe(842)
  }, 30_000)

  it('maps characters the built-in PDF font cannot draw', () => {
    expect(pdfSafeText('Crème brûlée – 1 × “café”')).toBe('Crème brûlée – 1 × “café”')
    expect(pdfSafeText('Łódź ≥ 2')).toBe('Lódz >= 2')
    expect(pdfSafeText('لبنة')).toBe('????')
  })
})
