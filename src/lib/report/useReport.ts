import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../db'
import { entriesBetween } from '../repo'
import type { ReportOptions } from '../types'
import { buildReport, reportPhotoIds } from './buildReport'
import type { ReportData } from './types'

/** Live report for a period, built from the local diary. */
export function useLocalReport(cfg: {
  start: string
  end: string
  title: string
  patientName: string
  options: ReportOptions
  timeZone: string
  enabled: boolean
}): { report: ReportData | null; photoCount: number } {
  const entries = useLiveQuery(
    () => (cfg.enabled ? entriesBetween(cfg.start, cfg.end) : Promise.resolve([])),
    [cfg.start, cfg.end, cfg.enabled],
  )
  const photoIds = useMemo(() => [...new Set((entries ?? []).flatMap((e) => e.photoIds))], [entries])
  const meta = useLiveQuery(async () => {
    const photos = await db.photos.bulkGet(photoIds)
    return new Map(photos.filter((p) => !!p).map((p) => [p!.id, { width: p!.width, height: p!.height }]))
  }, [photoIds.join(',')])

  const report = useMemo(() => {
    if (!entries || !meta || !cfg.enabled) return null
    return buildReport({
      entries,
      photoMeta: meta,
      periodStart: cfg.start,
      periodEnd: cfg.end,
      options: cfg.options,
      title: cfg.title,
      patientName: cfg.patientName,
      timeZone: cfg.timeZone,
    })
  }, [entries, meta, cfg.enabled, cfg.start, cfg.end, cfg.options, cfg.title, cfg.patientName, cfg.timeZone])

  return { report, photoCount: report ? reportPhotoIds(report).length : 0 }
}

/** Object URLs for the photos of a local report preview. */
export function useLocalPhotoUrls(report: ReportData | null): Record<string, string> {
  const ids = useMemo(() => (report ? reportPhotoIds(report) : []), [report])
  const key = ids.join(',')
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    let cancelled = false
    const created: string[] = []
    void db.photos.bulkGet(ids).then((photos) => {
      if (cancelled) return
      const map: Record<string, string> = {}
      for (const p of photos) {
        if (!p) continue
        const u = URL.createObjectURL(p.blob)
        created.push(u)
        map[p.id] = u
      }
      setUrls(map)
    })
    return () => {
      cancelled = true
      created.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [key])
  return urls
}
