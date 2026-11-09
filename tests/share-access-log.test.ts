import { describe, expect, it } from 'vitest'
import { clientIp, isIpAddress, truncateUserAgent, USER_AGENT_MAX_LENGTH } from '../supabase/functions/_shared/access.ts'
import { describeUserAgent } from '@/lib/share/userAgent'

const h = (init: Record<string, string>) => new Headers(init)

describe('clientIp', () => {
  it('prefers the edge proxy headers over X-Forwarded-For', () => {
    expect(clientIp(h({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' }))).toBe('203.0.113.7')
    expect(clientIp(h({ 'x-real-ip': '203.0.113.8', 'x-forwarded-for': '198.51.100.1' }))).toBe('203.0.113.8')
  })

  it('takes the first X-Forwarded-For hop', () => {
    expect(clientIp(h({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }))).toBe('198.51.100.1')
  })

  it('handles IPv6 and ports', () => {
    expect(clientIp(h({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1')
    expect(clientIp(h({ 'x-forwarded-for': '[2001:db8::2]:443' }))).toBe('2001:db8::2')
    expect(clientIp(h({ 'x-forwarded-for': '198.51.100.3:5000' }))).toBe('198.51.100.3')
  })

  it('ignores garbage and falls through to the next header', () => {
    expect(clientIp(h({ 'cf-connecting-ip': "1.2.3.4'); drop table x;--", 'x-forwarded-for': '198.51.100.4' }))).toBe('198.51.100.4')
    expect(clientIp(h({ 'x-forwarded-for': 'unknown' }))).toBeNull()
    expect(clientIp(h({}))).toBeNull()
  })
})

describe('isIpAddress', () => {
  it('accepts valid addresses only', () => {
    for (const ok of ['0.0.0.0', '255.255.255.255', '::1', 'fe80::1', '::ffff:192.0.2.1']) expect(isIpAddress(ok)).toBe(true)
    for (const bad of ['256.1.1.1', '1.2.3', '01.2.3.4', 'gggg::1', '1:2:3:4:5:6:7:8:9', ':', 'localhost']) expect(isIpAddress(bad)).toBe(false)
  })
})

describe('truncateUserAgent', () => {
  it('caps length and drops empty values', () => {
    expect(truncateUserAgent('x'.repeat(1000))).toHaveLength(USER_AGENT_MAX_LENGTH)
    expect(truncateUserAgent('  ')).toBeNull()
    expect(truncateUserAgent(null)).toBeNull()
  })
})

describe('describeUserAgent', () => {
  it('names common browsers and platforms', () => {
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36')).toBe('Chrome on Windows')
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0')).toBe('Edge on Windows')
    expect(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone')
    expect(describeUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36')).toBe('Chrome on Android')
    expect(describeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('Firefox on Mac')
    expect(describeUserAgent('curl/8.4.0')).toBe('Other client')
    expect(describeUserAgent(null)).toBe('Unknown device')
  })
})
