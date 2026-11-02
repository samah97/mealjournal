import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/share/supabase', () => ({
  supabaseConfig: { url: 'https://abc.supabase.co', key: 'sb_publishable_test' },
  isSharingConfigured: () => true,
  getSupabase: () => Promise.reject(new Error('not used')),
}))

const { fetchSharedReport } = await import('../src/lib/share/api')

afterEach(() => vi.unstubAllGlobals())

function respond(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))
}

describe('fetchSharedReport', () => {
  it('resolves relative signed photo URLs against the public Supabase URL', async () => {
    respond(200, {
      status: 'ok',
      report: { days: [] },
      photos: { p1: '/storage/v1/object/sign/report-photos/u/r/p1.jpg?token=abc' },
      expiresAt: '2026-12-01T00:00:00Z',
    })
    const r = await fetchSharedReport('t'.repeat(43))
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.photos.p1).toBe('https://abc.supabase.co/storage/v1/object/sign/report-photos/u/r/p1.jpg?token=abc')
    }
  })

  it('passes through access decisions from the server', async () => {
    respond(401, { status: 'pin_required' })
    expect(await fetchSharedReport('t'.repeat(43))).toEqual({ status: 'pin_required' })
    respond(404, { status: 'unavailable' })
    expect(await fetchSharedReport('t'.repeat(43))).toEqual({ status: 'unavailable' })
  })

  it('reports network failures without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))
    expect((await fetchSharedReport('t'.repeat(43))).status).toBe('error')
  })
})
