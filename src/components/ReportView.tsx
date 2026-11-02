import { categoryColor, categoryLabel } from '@/lib/categories'
import { formatLongDate, formatPeriod } from '@/lib/datetime'
import { reportEntryCount } from '@/lib/report/buildReport'
import { dayCountsText, generatedText, includedText, MISSING_NOTE, nutritionParts } from '@/lib/report/format'
import type { PhotoResolver, ReportData, ReportEntry, ReportNutrition } from '@/lib/report/types'
import { cn, pluralise } from '@/lib/utils'

function NutritionLine({ n, className }: { n: ReportNutrition; className?: string }) {
  if (!n.hasAnyData) return <p className={cn('text-xs italic text-muted', className)}>No nutritional information recorded.</p>
  return (
    <div className={className}>
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-2">
        {nutritionParts(n).map((p) => (
          <span key={p.label} className="tabular">
            <span className="text-muted">{p.label}</span> {p.incomplete && <span className="text-warn">≥ </span>}
            {p.value}
          </span>
        ))}
      </p>
      {n.note && <p className="mt-0.5 text-[0.6875rem] text-warn">{n.note}</p>}
    </div>
  )
}

function EntryBlock({ e, photo }: { e: ReportEntry; photo: PhotoResolver }) {
  return (
    <article className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 border-t border-line py-4 first:border-t-0 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
      <div>
        <p className="tabular text-sm font-semibold">{e.time}</p>
        <p className="mt-0.5 flex items-center gap-1 text-[0.6875rem] font-medium uppercase tracking-wide" style={{ color: categoryColor(e.category) }}>
          {categoryLabel(e.category)}
        </p>
      </div>
      <div className="min-w-0">
        <h4 className="text-[0.9375rem] font-semibold leading-snug">
          {e.name}
          {e.quantity && <span className="font-normal text-ink-2"> — {e.quantity}</span>}
        </h4>
        {e.photos.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {e.photos.map((p) => {
              const src = photo(p.id)
              return src ? (
                <img
                  key={p.id}
                  src={src}
                  alt={`Photo of ${e.name}`}
                  className={cn(
                    'h-auto rounded-lg border border-line object-contain',
                    e.photos.length === 1 ? 'max-h-72 max-w-full' : 'max-h-44 max-w-[calc(50%-0.25rem)]',
                  )}
                  style={{ aspectRatio: `${p.width} / ${p.height}` }}
                  loading="lazy"
                />
              ) : (
                <div key={p.id} className="h-28 w-36 animate-pulse rounded-lg bg-subtle" />
              )
            })}
          </div>
        )}
        {e.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{e.description}</p>}
        {e.items.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-sm text-ink-2">
            {e.items.map((i, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="text-muted">•</span>
                <span className="min-w-0">
                  {i.quantity && <span className="tabular">{i.quantity} </span>}
                  <span className="text-ink">{i.name}</span>
                  {i.brand && <span className="text-muted"> ({i.brand})</span>}
                  {i.ingredients && <span className="text-muted"> – {i.ingredients.join(', ')}</span>}
                  {i.note && <span className="italic text-muted"> – {i.note}</span>}
                  {i.nutrition && <NutritionLine n={i.nutrition} className="mt-0.5" />}
                </span>
              </li>
            ))}
          </ul>
        )}
        {e.ingredients && <p className="mt-1.5 text-sm text-ink-2"><span className="text-muted">Ingredients:</span> {e.ingredients.join(', ')}</p>}
        {e.preparation && <p className="mt-1 text-sm text-ink-2"><span className="text-muted">Preparation:</span> {e.preparation}</p>}
        {e.notes && (
          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-subtle px-3 py-2 text-sm leading-relaxed text-ink-2">
            <span className="font-medium text-ink">Note: </span>
            {e.notes}
          </p>
        )}
        {e.nutrition && <NutritionLine n={e.nutrition} className="mt-2" />}
      </div>
    </article>
  )
}

/** The report as a clean, read-only document. Used for the in-app preview and the shared link page. */
export function ReportView({ report, photo }: { report: ReportData; photo: PhotoResolver }) {
  const count = reportEntryCount(report)
  const showNutritionNote = report.options.includeNutrition || report.options.includeSummaries
  return (
    <div className="paper rounded-[1.25rem] border border-line bg-surface text-ink shadow-card">
      <header className="border-b border-line px-5 pb-5 pt-6 sm:px-8 sm:pt-8">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-accent">MealJournal – Food Diary</p>
        <h2 className="mt-2 text-[1.5rem] font-semibold leading-tight tracking-tight sm:text-[1.75rem]">{report.title}</h2>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {report.patientName && (
            <div>
              <dt className="text-xs text-muted">Name</dt>
              <dd className="font-medium">{report.patientName}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted">Period</dt>
            <dd className="font-medium">{formatPeriod(report.periodStart, report.periodEnd)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Recorded</dt>
            <dd className="font-medium">
              {pluralise(count, 'entry', 'entries')} over {pluralise(report.days.length, 'day')}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Generated</dt>
            <dd className="font-medium">{generatedText(report)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">
          {includedText(report)} {showNutritionNote && MISSING_NOTE}
        </p>
      </header>

      <div className="px-5 pb-4 sm:px-8">
        {report.days.map((day) => (
          <section key={day.date} className="border-b border-line py-5 last:border-b-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-base font-semibold">{formatLongDate(day.date)}</h3>
              <span className="text-xs text-muted">{day.entries.length ? `${pluralise(day.entries.length, 'entry', 'entries')} · ${dayCountsText(day)}` : ''}</span>
            </div>
            {day.entries.length === 0 ? (
              <p className="mt-2 text-sm italic text-muted">No entries recorded.</p>
            ) : (
              <div className="mt-1">
                {day.entries.map((e) => (
                  <EntryBlock key={e.id} e={e} photo={photo} />
                ))}
              </div>
            )}
            {day.nutrition && (
              <div className="mt-2 rounded-xl bg-accent-soft/60 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">Daily nutrition total</p>
                <NutritionLine n={day.nutrition} className="mt-1" />
              </div>
            )}
          </section>
        ))}
      </div>
      <footer className="border-t border-line px-5 py-4 text-center text-[0.6875rem] text-muted sm:px-8">
        Recorded by the patient with MealJournal · {formatPeriod(report.periodStart, report.periodEnd)}
      </footer>
    </div>
  )
}
