import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarSearch, FileText, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { DayTimeline } from '@/components/timeline'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, EmptyState, PageHeader } from '@/components/ui/misc'
import { db } from '@/lib/db'
import { addDays, diffDays, formatLongDate, relativeDayLabel } from '@/lib/datetime'
import { useNow } from '@/lib/hooks'
import { entriesBetween, sortEntries } from '@/lib/repo'
import type { DiaryEntry } from '@/lib/types'
import { cn, pluralise } from '@/lib/utils'

export function DiaryPage() {
  const { date: today } = useNow()
  const [days, setDays] = useState(14)
  const [focus, setFocus] = useState<string | null>(null)
  const dateInput = useRef<HTMLInputElement>(null)

  const start = addDays(today, -(days - 1))
  const entries = useLiveQuery(() => entriesBetween(start, addDays(today, 7)), [start, today])
  const earliest = useLiveQuery(() => db.entries.orderBy('date').first(), [])

  const groups = useMemo(() => {
    const map = new Map<string, DiaryEntry[]>()
    for (const e of sortEntries(entries ?? [])) map.set(e.date, [...(map.get(e.date) ?? []), e])
    if (!map.has(today)) map.set(today, [])
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [entries, today])

  const hasOlder = !!earliest && earliest.date < start

  useEffect(() => {
    if (!focus) return
    const el = document.getElementById(`day-${focus}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focus, groups])

  function jumpTo(date: string) {
    if (!date) return
    if (date < start) setDays(diffDays(date, today) + 1)
    setFocus(date)
  }

  return (
    <div>
      <PageHeader
        title="Diary"
        large
        actions={
          <>
            <Button variant="ghost" size="icon" aria-label="Go to date" onClick={() => dateInput.current?.showPicker?.() ?? dateInput.current?.focus()}>
              <CalendarSearch className="size-5" />
            </Button>
            <ButtonLink to="/report" variant="ghost" size="icon" aria-label="Create report">
              <FileText className="size-5" />
            </ButtonLink>
          </>
        }
      />
      <input
        ref={dateInput}
        type="date"
        className="sr-only"
        tabIndex={-1}
        aria-label="Go to date"
        max={addDays(today, 7)}
        onChange={(e) => jumpTo(e.target.value)}
      />

      <div className="flex flex-col gap-7 pt-1">
        {groups.map(([date, list]) => {
          const empty = list.length === 0
          if (empty && date !== today && date !== focus) return null
          return (
            <section key={date} id={`day-${date}`} className="scroll-mt-20">
              <div className="mb-3 flex items-baseline justify-between gap-3 px-0.5">
                <h2 className="text-[1.0625rem] font-semibold tracking-tight">
                  {relativeDayLabel(date, today)}
                  <span className={cn('ml-2 text-sm font-normal text-muted', date === focus && 'text-accent-ink')}>
                    {diffDays(date, today) <= 1 && diffDays(date, today) >= -1 ? formatLongDate(date) : ''}
                  </span>
                </h2>
                <span className="text-xs text-muted">{empty ? '' : pluralise(list.length, 'entry', 'entries')}</span>
              </div>
              {empty ? (
                <Card className="flex items-center justify-between gap-3 p-4">
                  <p className="text-sm text-muted">No entries {date === today ? 'yet today' : 'on this day'}.</p>
                  <ButtonLink to={`/add?date=${date}`} size="sm" variant="soft">
                    <Plus className="size-4" /> Add
                  </ButtonLink>
                </Card>
              ) : (
                <DayTimeline entries={list} />
              )}
            </section>
          )
        })}
      </div>

      {entries && entries.length === 0 && !hasOlder && (
        <EmptyState title="Your diary starts here" className="mt-4">
          Entries you add appear here, grouped by day, so you can look back at any time.
        </EmptyState>
      )}

      <div className="mt-8 flex flex-col items-center gap-2">
        {hasOlder ? (
          <Button variant="secondary" onClick={() => setDays((d) => d + 14)}>
            Show earlier days
          </Button>
        ) : (
          entries &&
          entries.length > 0 && (
            <p className="text-xs text-muted">
              That's everything. <Link to="/report" className="font-medium text-accent-ink">Create a report</Link>
            </p>
          )
        )}
      </div>
    </div>
  )
}
