/**
 * Change tracking: a Dexie DBCore middleware that records every put/delete on a synced
 * table in the `outbox`, inside the same transaction. It sees *all* writes (repo,
 * favourites, settings, backup restore, starter foods …) without touching call sites.
 */
import type { DBCore, DBCoreMutateRequest, DBCoreTable, DBCoreTransaction, Middleware, Transaction } from 'dexie'
import { isSyncedCollection, type OutboxItem } from './merge'

export const OUTBOX = 'outbox'

type TrackedTransaction = DBCoreTransaction & { mjSkipTracking?: boolean }

/** Writes in this transaction come from the server and must not be echoed back. */
export function skipTracking(tx: Transaction): void {
  ;(tx.idbtrans as unknown as TrackedTransaction).mjSkipTracking = true
}

// ---------------------------------------------------------------- change clock

const CLOCK_KEY = 'mealjournal.syncClock'
let floor = 0
try {
  floor = Number(localStorage.getItem(CLOCK_KEY)) || 0
} catch {
  /* no localStorage (tests) */
}

/**
 * Timestamp for a local change: wall-clock time, but never older than a change we have
 * already seen from another device (whose clock may be ahead), so an edit made after
 * seeing a record always counts as newer than it.
 */
export function changeTimestamp(): number {
  floor = Math.max(Date.now(), floor + 1)
  return floor
}

export function observeTimestamp(ts: number): void {
  if (ts <= floor) return
  floor = ts
  try {
    localStorage.setItem(CLOCK_KEY, String(ts))
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- middleware

let onChange: (() => void) | undefined
/** Called after a local change was queued (the engine schedules a sync). */
export function setChangeListener(fn: (() => void) | undefined): void {
  onChange = fn
}

async function affectedKeys(table: DBCoreTable, req: DBCoreMutateRequest): Promise<unknown[]> {
  switch (req.type) {
    case 'add':
    case 'put':
      return [
        ...(req.keys ?? []),
        ...req.values.map((v: { id?: unknown } | undefined) => v?.id),
        ...(req.type === 'put' ? (req.updates?.keys ?? []) : []),
      ]
    case 'delete':
      return req.keys
    case 'deleteRange': {
      const res = await table.query({
        trans: req.trans,
        query: { index: table.schema.primaryKey, range: req.range },
        values: false,
      })
      return res.result
    }
  }
}

export const trackingMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'sync-tracking',
  create(down) {
    return {
      ...down,
      transaction(stores, mode, options) {
        const withOutbox =
          mode === 'readwrite' && stores.some(isSyncedCollection) && !stores.includes(OUTBOX) ? [...stores, OUTBOX] : stores
        return down.transaction(withOutbox, mode, options)
      },
      table(name) {
        const table = down.table(name)
        if (!isSyncedCollection(name)) return table
        return {
          ...table,
          async mutate(req) {
            if ((req.trans as TrackedTransaction).mjSkipTracking) return table.mutate(req)
            // Keys must be read before a range delete removes them.
            const before = req.type === 'deleteRange' ? await affectedKeys(table, req) : []
            const res = await table.mutate(req)
            const keys = req.type === 'deleteRange' ? before : [...(await affectedKeys(table, req)), ...(res.results ?? [])]
            const ids = [...new Set(keys.filter((k): k is string => typeof k === 'string'))]
            if (ids.length) {
              const op: OutboxItem['op'] = req.type === 'delete' || req.type === 'deleteRange' ? 'delete' : 'put'
              const queuedAt = changeTimestamp()
              await down.table(OUTBOX).mutate({
                type: 'put',
                trans: req.trans,
                values: ids.map((recordId): OutboxItem => ({ collection: name, recordId, op, queuedAt })),
              })
              onChange?.()
            }
            return res
          },
        }
      },
    }
  },
}
