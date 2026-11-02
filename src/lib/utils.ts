import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function uid(): string {
  return crypto.randomUUID()
}

/** Remove empty strings / whitespace-only values from optional text fields. */
export function clean(v: string | undefined | null): string | undefined {
  const t = v?.trim()
  return t ? t : undefined
}

export function parseNumber(v: string): number | undefined {
  if (v.trim() === '') return undefined
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

export function numberToInput(n: number | undefined): string {
  return n === undefined || n === null ? '' : String(n)
}

export function deepCopy<T>(v: T): T {
  return structuredClone(v)
}

export function pluralise(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function matchesQuery(query: string, ...fields: (string | undefined)[]): boolean {
  const q = normalise(query.trim())
  if (!q) return true
  const hay = normalise(fields.filter(Boolean).join(' '))
  return q.split(/\s+/).every((t) => hay.includes(t))
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
