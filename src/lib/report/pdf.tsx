/**
 * A4 PDF rendering of a report. Loaded on demand – the PDF engine is large.
 * Uses the built-in Helvetica family so the PDF needs no font downloads.
 */
import { Document, Font, Image, Page, pdf, StyleSheet, Text, View } from '@react-pdf/renderer'
import { categoryLabel } from '../categories'
import { formatLongDate, formatPeriod } from '../datetime'
import { pluralise } from '../utils'
import { reportEntryCount } from './buildReport'
import { dayCountsText, generatedText, includedText, nutritionParts } from './format'
import type { ReportData, ReportEntry, ReportNutrition } from './types'

export interface PdfImage {
  src: string
  width: number
  height: number
}

// Never hyphenate words – food names should stay intact.
Font.registerHyphenationCallback((word) => [word])

const C = {
  ink: '#1D231F',
  ink2: '#48504A',
  muted: '#6F766F',
  line: '#E4E2DB',
  accent: '#4F7052',
  accentSoft: '#EEF3EC',
  subtle: '#F4F3EF',
  warn: '#9A6A1F',
}

const CATEGORY_COLORS: Record<string, string> = {
  breakfast: '#A9812A',
  lunch: '#4F7A52',
  dinner: '#4D6189',
  snack: '#A3634B',
  drink: '#3F7A85',
  other: '#77776F',
}

const s = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 56, paddingHorizontal: 46, fontFamily: 'Helvetica', fontSize: 9.5, color: C.ink, lineHeight: 1.4 },
  brand: { fontSize: 7.5, letterSpacing: 1.6, color: C.accent, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  title: { fontSize: 20, fontFamily: 'Helvetica-Bold', marginTop: 6, letterSpacing: -0.3 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  metaCell: { width: '50%', marginBottom: 6 },
  metaLabel: { fontSize: 7.5, color: C.muted },
  metaValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  small: { fontSize: 7.5, color: C.muted, marginTop: 4 },
  header: { borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 12, marginBottom: 4 },
  day: { marginTop: 14 },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1.2, borderBottomColor: C.ink, paddingBottom: 4 },
  dayTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  dayCounts: { fontSize: 7.5, color: C.muted },
  empty: { fontSize: 9, color: C.muted, fontStyle: 'italic', marginTop: 6 },
  entry: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 0.6, borderBottomColor: C.line },
  timeCol: { width: 58 },
  time: { fontSize: 10.5, fontFamily: 'Helvetica-Bold' },
  cat: { fontSize: 6.8, fontFamily: 'Helvetica-Bold', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 2 },
  body: { flex: 1 },
  name: { fontSize: 10.5, fontFamily: 'Helvetica-Bold' },
  qty: { fontFamily: 'Helvetica', color: C.ink2 },
  text: { fontSize: 9, color: C.ink2, marginTop: 3 },
  label: { color: C.muted },
  photos: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  photo: { marginRight: 6, marginBottom: 6, borderRadius: 3 },
  item: { flexDirection: 'row', marginTop: 2 },
  bullet: { width: 8, color: C.muted, fontSize: 9 },
  itemText: { fontSize: 9, color: C.ink2 },
  note: { marginTop: 5, backgroundColor: C.subtle, borderRadius: 3, paddingVertical: 4, paddingHorizontal: 6, fontSize: 9, color: C.ink2 },
  nutrition: { marginTop: 4, flexDirection: 'row', flexWrap: 'wrap' },
  nutri: { fontSize: 8, color: C.ink2, marginRight: 9 },
  nutriNote: { fontSize: 7.3, color: C.warn, marginTop: 1 },
  summary: { marginTop: 8, backgroundColor: C.accentSoft, borderRadius: 4, paddingVertical: 7, paddingHorizontal: 9 },
  summaryTitle: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.accent, letterSpacing: 0.8, textTransform: 'uppercase' },
})

function Nutrition({ n }: { n: ReportNutrition }) {
  if (!n.hasAnyData) return <Text style={[s.nutriNote, { color: C.muted }]}>No nutritional information recorded.</Text>
  return (
    <View>
      <View style={s.nutrition}>
        {nutritionParts(n).map((p) => (
          <Text key={p.label} style={s.nutri}>
            <Text style={s.label}>{p.label} </Text>
            {p.value}
            {p.incomplete ? '*' : ''}
          </Text>
        ))}
      </View>
      {n.note && <Text style={s.nutriNote}>{n.note}</Text>}
    </View>
  )
}

/** Fit an image inside a box, keeping its aspect ratio. */
function fit(img: PdfImage, maxW: number, maxH: number) {
  const scale = Math.min(maxW / img.width, maxH / img.height, 1.5)
  return { width: Math.round(img.width * scale), height: Math.round(img.height * scale) }
}

function Entry({ e, images }: { e: ReportEntry; images: Record<string, PdfImage> }) {
  const photos = e.photos.map((p) => images[p.id]).filter((x): x is PdfImage => !!x)
  const single = photos.length === 1
  // Keep an entry on one page unless it is too long to ever fit.
  const textLength = (e.description?.length ?? 0) + (e.notes?.length ?? 0) + e.items.length * 60
  return (
    <View style={s.entry} wrap={textLength > 1400}>
      <View style={s.timeCol}>
        <Text style={s.time}>{e.time}</Text>
        <Text style={[s.cat, { color: CATEGORY_COLORS[e.category] }]}>{categoryLabel(e.category)}</Text>
      </View>
      <View style={s.body}>
        <Text style={s.name}>
          {e.name}
          {e.quantity ? <Text style={s.qty}> — {e.quantity}</Text> : null}
        </Text>
        {photos.length > 0 && (
          <View style={s.photos}>
            {photos.map((img, i) => (
              <Image key={i} src={img.src} style={[s.photo, single ? fit(img, 250, 175) : fit(img, 150, 110)]} />
            ))}
          </View>
        )}
        {e.description ? <Text style={s.text}>{e.description}</Text> : null}
        {e.items.length > 0 && (
          <View style={{ marginTop: 3 }}>
            {e.items.map((i, idx) => (
              <View key={idx} style={s.item}>
                <Text style={s.bullet}>•</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.itemText}>
                    {i.quantity ? `${i.quantity} ` : ''}
                    <Text style={{ color: C.ink }}>{i.name}</Text>
                    {i.brand ? <Text style={s.label}> ({i.brand})</Text> : null}
                    {i.ingredients ? <Text style={s.label}> – {i.ingredients.join(', ')}</Text> : null}
                    {i.note ? <Text style={s.label}> – {i.note}</Text> : null}
                  </Text>
                  {i.nutrition && <Nutrition n={i.nutrition} />}
                </View>
              </View>
            ))}
          </View>
        )}
        {e.ingredients ? (
          <Text style={s.text}>
            <Text style={s.label}>Ingredients: </Text>
            {e.ingredients.join(', ')}
          </Text>
        ) : null}
        {e.preparation ? (
          <Text style={s.text}>
            <Text style={s.label}>Preparation: </Text>
            {e.preparation}
          </Text>
        ) : null}
        {e.notes ? (
          <Text style={s.note}>
            <Text style={{ fontFamily: 'Helvetica-Bold', color: C.ink }}>Note: </Text>
            {e.notes}
          </Text>
        ) : null}
        {e.nutrition && <Nutrition n={e.nutrition} />}
      </View>
    </View>
  )
}

export function ReportDocument({ report, images }: { report: ReportData; images: Record<string, PdfImage> }) {
  const period = formatPeriod(report.periodStart, report.periodEnd)
  const count = reportEntryCount(report)
  return (
    <Document title={`${report.title} – ${period}`} author={report.patientName ?? 'MealJournal'} creator="MealJournal" producer="MealJournal" language="en-GB">
      {/* The footer with page numbers is stamped on afterwards (see addPageFooters). */}
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.brand}>MealJournal – Food Diary</Text>
          <Text style={s.title}>{report.title}</Text>
          <View style={s.metaRow}>
            {report.patientName ? (
              <View style={s.metaCell}>
                <Text style={s.metaLabel}>Name</Text>
                <Text style={s.metaValue}>{report.patientName}</Text>
              </View>
            ) : null}
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>Reporting period</Text>
              <Text style={s.metaValue}>{period}</Text>
            </View>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>Recorded</Text>
              <Text style={s.metaValue}>
                {pluralise(count, 'entry', 'entries')} over {pluralise(report.days.length, 'day')}
              </Text>
            </View>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>Report generated</Text>
              <Text style={s.metaValue}>{generatedText(report)}</Text>
            </View>
          </View>
          <Text style={s.small}>
            {includedText(report)} {report.options.includeNutrition || report.options.includeSummaries ? PDF_MISSING_NOTE : ''}
          </Text>
        </View>

        {report.days.map((day) => (
          <View key={day.date} style={s.day}>
            {/* The heading travels with the first entry so it is never stranded at a page bottom. */}
            <View wrap={false}>
              <View style={s.dayHead}>
                <Text style={s.dayTitle}>{formatLongDate(day.date)}</Text>
                <Text style={s.dayCounts}>{day.entries.length ? `${pluralise(day.entries.length, 'entry', 'entries')} · ${dayCountsText(day)}` : ''}</Text>
              </View>
              {day.entries.length === 0 ? (
                <Text style={s.empty}>No entries recorded.</Text>
              ) : (
                <Entry e={day.entries[0]!} images={images} />
              )}
            </View>
            {day.entries.slice(1).map((e) => (
              <Entry key={e.id} e={e} images={images} />
            ))}
            {day.nutrition && (
              <View style={s.summary} wrap={false}>
                <Text style={s.summaryTitle}>Daily nutrition total</Text>
                <Nutrition n={day.nutrition} />
              </View>
            )}
          </View>
        ))}
      </Page>
    </Document>
  )
}

const PDF_MISSING_NOTE = '* Incomplete total: at least one item had no value. Missing values are never counted as zero.'

// The built-in PDF fonts cover the Windows-1252 (Latin) character set.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')

/** Replace characters the PDF font cannot draw (e.g. "ł" → "l"); unknown scripts become "?". */
export function pdfSafeText(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || ch === '\n' || WIN_ANSI_EXTRA.has(ch)) {
      out += ch
      continue
    }
    if (ch === '≥') out += '>='
    else if (ch === '\t') out += ' '
    else {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
      out += base && base.codePointAt(0)! < 0x250 && base !== ch ? base : ch === 'ł' ? 'l' : ch === 'Ł' ? 'L' : '?'
    }
  }
  return out
}

function sanitize<T>(value: T): T {
  if (typeof value === 'string') return pdfSafeText(value) as T
  if (Array.isArray(value)) return value.map(sanitize) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v)])) as T
  }
  return value
}

/**
 * Draw the footer – reporting period and "Page X of Y" – on every page.
 * Done as a post-processing step because react-pdf 4.7–4.9 silently drops
 * `fixed` views and `render`-prop page numbers.
 */
export async function addPageFooters(pdfBytes: Uint8Array, footerText: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('@cantoo/pdf-lib')
  const doc = await PDFDocument.load(pdfBytes)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const text = rgb(0x6f / 255, 0x76 / 255, 0x6f / 255)
  const rule = rgb(0xe4 / 255, 0xe2 / 255, 0xdb / 255)
  const size = 7.5
  const margin = 46
  const pages = doc.getPages()
  pages.forEach((page, i) => {
    const { width } = page.getSize()
    page.drawLine({ start: { x: margin, y: 40 }, end: { x: width - margin, y: 40 }, thickness: 0.6, color: rule })
    page.drawText(footerText, { x: margin, y: 28, size, font, color: text })
    const label = `Page ${i + 1} of ${pages.length}`
    page.drawText(label, { x: width - margin - font.widthOfTextAtSize(label, size), y: 28, size, font, color: text })
  })
  return doc.save()
}

export async function renderReportPdf(report: ReportData, images: Record<string, PdfImage>): Promise<Blob> {
  const safe = sanitize(report)
  const raw = await pdf(<ReportDocument report={safe} images={images} />).toBlob()
  const footer = pdfSafeText(`MealJournal – Food Diary · ${formatPeriod(report.periodStart, report.periodEnd)}`)
  const stamped = await addPageFooters(new Uint8Array(await raw.arrayBuffer()), footer)
  return new Blob([stamped.slice().buffer as ArrayBuffer], { type: 'application/pdf' })
}
