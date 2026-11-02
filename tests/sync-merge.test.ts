import { describe, expect, it } from 'vitest'
import { newFood } from '../src/lib/repo'
import {
  backoffDelay,
  bindingAction,
  fromRemoteData,
  photoPaths,
  remoteWins,
  toPushRecord,
  toRemoteData,
  unusedStarterFoods,
} from '../src/lib/sync/merge'
import type { Settings } from '../src/lib/types'

describe('serialisation', () => {
  it('strips photo blobs', () => {
    const data = toRemoteData('photos', { id: 'p', blob: new Blob(['x']), thumb: new Blob(['y']), width: 4, height: 3, createdAt: 1 })
    expect(data).toEqual({ id: 'p', width: 4, height: 3, createdAt: 1 })
  })

  it('keeps settings.onboarded on the device', () => {
    const local: Settings = {
      id: 'app',
      timeZone: 'Europe/Amsterdam',
      reportOptions: { includePhotos: true, includeIngredients: true, includeNotes: true, includeNutrition: false, includeSummaries: false },
      showNutritionOnHome: false,
      onboarded: true,
    }
    const data = toRemoteData('settings', local)
    expect(data).not.toHaveProperty('onboarded')
    expect(fromRemoteData<Settings>('settings', { ...data, timeZone: 'Asia/Beirut' }, local)).toMatchObject({
      timeZone: 'Asia/Beirut',
      onboarded: true,
    })
    expect(fromRemoteData<Settings>('settings', data, undefined).onboarded).toBe(false)
  })

  it('never uploads the raw share URL and keeps the local one', () => {
    const link = { id: 'l', title: 't', url: 'https://x/shared#secret', viewCount: 3, hasPin: false }
    const data = toRemoteData('shareLinks', link)
    expect(JSON.stringify(data)).not.toContain('secret')
    expect(data).not.toHaveProperty('viewCount')
    expect(fromRemoteData<typeof link>('shareLinks', { ...data, title: 'renamed' }, link)).toMatchObject({
      title: 'renamed',
      url: 'https://x/shared#secret',
    })
    expect(fromRemoteData<typeof link>('shareLinks', data, undefined).url).toBeUndefined()
  })

  it('drops undefined fields', () => {
    expect(toRemoteData('foods', { id: 'f', brand: undefined, name: 'x' })).toEqual({ id: 'f', name: 'x' })
  })

  it('pushes a tombstone when the record no longer exists', () => {
    const item = { collection: 'entries' as const, recordId: 'e', op: 'put' as const, queuedAt: 42 }
    expect(toPushRecord(item, undefined)).toEqual({ collection: 'entries', record_id: 'e', updated_at: 42, deleted: true, data: null })
    expect(toPushRecord({ ...item, op: 'delete' }, { id: 'e', name: 'Lunch' })).toMatchObject({ deleted: false, data: { name: 'Lunch' } })
  })
})

describe('last writer wins', () => {
  it('applies the server version when nothing is pending locally', () => {
    expect(remoteWins({ updated_at: 1 }, undefined)).toBe(true)
  })

  it('keeps a newer local change', () => {
    expect(remoteWins({ updated_at: 100 }, { queuedAt: 200 })).toBe(false)
  })

  it('takes a newer remote change (including deletes) over an older pending one', () => {
    expect(remoteWins({ updated_at: 300 }, { queuedAt: 200 })).toBe(true)
  })

  it('keeps ours on a tie (our own echo)', () => {
    expect(remoteWins({ updated_at: 200 }, { queuedAt: 200 })).toBe(false)
  })
})

describe('account binding', () => {
  it('decides what to do with local data on sign-in', () => {
    expect(bindingAction('u1', 'u1', true)).toBe('ready')
    expect(bindingAction('u1', 'u2', true)).toBe('wipe')
    expect(bindingAction(undefined, 'u1', true)).toBe('ask-migrate')
    expect(bindingAction(undefined, 'u1', false)).toBe('bind')
  })
})

describe('helpers', () => {
  it('finds starter foods that were never used', () => {
    const unused = newFood({ name: 'Hummus', isExample: true })
    const used = newFood({ name: 'Labneh', isExample: true, useCount: 2, lastUsedAt: 5 })
    const own = newFood({ name: 'Mine' })
    expect(unusedStarterFoods([unused, used, own]).map((f) => f.name)).toEqual(['Hummus'])
  })

  it('places photos in the owner folder', () => {
    expect(photoPaths('u', 'p')).toEqual({ full: 'u/p.jpg', thumb: 'u/p.thumb.jpg' })
  })

  it('backs off exponentially up to five minutes', () => {
    expect([0, 1, 2, 3, 10].map(backoffDelay)).toEqual([0, 5_000, 10_000, 20_000, 300_000])
  })
})
