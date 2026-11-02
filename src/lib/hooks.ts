import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { db, DEFAULT_SETTINGS, getSettings } from './db'
import { nowInZone } from './datetime'
import type { Settings } from './types'

/** Settings, falling back to defaults while they load. */
export function useSettings(): Settings {
  return useLiveQuery(getSettings, [], DEFAULT_SETTINGS)
}

/** Settings as stored, or undefined while loading – use when initialising state from them. */
export function useStoredSettings(): Settings | undefined {
  return useLiveQuery(getSettings, [])
}

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}

/** Current date/time in the diary's time zone, refreshed every 30 seconds. */
export function useNow(): { date: string; time: string } {
  const { timeZone } = useSettings()
  const [now, setNow] = useState(() => nowInZone(timeZone))
  useEffect(() => {
    setNow(nowInZone(timeZone))
    const t = setInterval(() => setNow(nowInZone(timeZone)), 30_000)
    return () => clearInterval(t)
  }, [timeZone])
  return now
}

/** Object URL for a stored photo, revoked automatically. */
export function usePhotoUrl(photoId: string | undefined, variant: 'thumb' | 'full' = 'thumb'): string | undefined {
  const photo = useLiveQuery(() => (photoId ? db.photos.get(photoId) : undefined), [photoId])
  const blob = photo ? (variant === 'thumb' ? photo.thumb : photo.blob) : undefined
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) {
      setUrl(undefined)
      return
    }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

/** Object URL for an in-memory blob (unsaved photo drafts). */
export function useBlobUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return setUrl(undefined)
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
