import { Camera, NotebookPen } from 'lucide-react'
import { Link } from 'react-router'
import { categoryColor, categoryLabel } from '@/lib/categories'
import type { DiaryEntry } from '@/lib/types'
import { formatQuantity } from '@/lib/units'
import { cn } from '@/lib/utils'
import { CategoryDot } from './inputs'
import { StoredPhoto } from './photos'

export function entrySummaryLine(e: DiaryEntry): string {
  if (e.items.length === 1 && e.items[0]!.name.toLowerCase() === e.name.toLowerCase()) {
    const i = e.items[0]!
    return [i.brand, i.amount !== undefined ? formatQuantity(i.amount, i.unit) : ''].filter(Boolean).join(' · ')
  }
  if (e.items.length) {
    return e.items.map((i) => (i.amount !== undefined ? `${formatQuantity(i.amount, i.unit)} ${i.name}` : i.name)).join(', ')
  }
  return e.description ?? ''
}

export function EntryCard({ entry, className }: { entry: DiaryEntry; className?: string }) {
  const line = entrySummaryLine(entry)
  const photo = entry.photoIds[0]
  return (
    <Link
      to={`/entry/${entry.id}`}
      className={cn(
        'group flex items-stretch gap-3 rounded-card border border-line/70 bg-surface p-3 shadow-card transition-all hover:border-line-strong active:scale-[0.995]',
        className,
      )}
    >
      {photo ? (
        <div className="relative size-18 shrink-0 overflow-hidden rounded-xl sm:size-20">
          <StoredPhoto id={photo} className="size-full" alt="" />
          {entry.photoIds.length > 1 && (
            <span className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[0.625rem] font-medium text-white">
              <Camera className="size-2.5" /> {entry.photoIds.length}
            </span>
          )}
        </div>
      ) : (
        <CategoryDot category={entry.category} className="mt-0.5 size-10" />
      )}
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <span className="size-1.5 rounded-full" style={{ background: categoryColor(entry.category) }} aria-hidden />
          <span className="text-ink-2">{categoryLabel(entry.category)}</span>
        </div>
        <p className="mt-0.5 truncate text-[0.9375rem] font-semibold text-ink">{entry.name}</p>
        {line && <p className="mt-0.5 line-clamp-2 text-[0.8125rem] leading-snug text-muted">{line}</p>}
        {entry.notes && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted">
            <NotebookPen className="size-3" /> Note
          </p>
        )}
      </div>
    </Link>
  )
}

/** Chronological timeline for one day: time column, rail, cards. */
export function DayTimeline({ entries }: { entries: DiaryEntry[] }) {
  return (
    <ol className="relative flex flex-col gap-2.5">
      {entries.map((e, i) => (
        <li key={e.id} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2.5">
          <div className="relative flex flex-col items-center pt-3.5">
            <time className="tabular text-[0.8125rem] font-semibold text-ink">{e.time}</time>
            {i < entries.length - 1 && <span className="mt-2 w-px flex-1 bg-line" aria-hidden />}
          </div>
          <EntryCard entry={e} />
        </li>
      ))}
    </ol>
  )
}
