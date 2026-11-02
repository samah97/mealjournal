import { describe, expect, it } from 'vitest'
import { addDays, dateRange, nowInZone, relativeDayLabel } from '../src/lib/datetime'

describe('datetime', () => {
  it('reports local Amsterdam time in 24h format, across DST', () => {
    expect(nowInZone('Europe/Amsterdam', new Date('2026-07-01T21:30:00Z'))).toEqual({ date: '2026-07-01', time: '23:30' })
    expect(nowInZone('Europe/Amsterdam', new Date('2026-12-31T23:30:00Z'))).toEqual({ date: '2027-01-01', time: '00:30' })
  })

  it('does date arithmetic on calendar dates', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(dateRange('2026-11-01', '2026-11-07')).toHaveLength(7)
    expect(dateRange('2026-11-07', '2026-11-01')).toEqual([])
  })

  it('labels recent days', () => {
    expect(relativeDayLabel('2026-11-02', '2026-11-02')).toBe('Today')
    expect(relativeDayLabel('2026-11-01', '2026-11-02')).toBe('Yesterday')
  })
})
