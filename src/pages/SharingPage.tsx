import type { User } from '@supabase/supabase-js'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Copy, History, KeyRound, Link2, Mail, MessageCircle, Plus, Share2, Trash2, Unplug } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { toast } from 'sonner'
import { configValid, defaultConfig, ReportOptionsForm, type ReportConfig } from '@/components/ReportOptionsForm'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/confirm'
import { Field, FormSection, Input } from '@/components/ui/Field'
import { Badge, Card, EmptyState, PageHeader, Segmented, SectionTitle, Spinner, Switch } from '@/components/ui/misc'
import { Sheet } from '@/components/ui/Sheet'
import { db } from '@/lib/db'
import { formatPeriod, formatTimestamp } from '@/lib/datetime'
import { useNow, useOnline, useSettings } from '@/lib/hooks'
import { reportEntryCount } from '@/lib/report/buildReport'
import { useLocalReport } from '@/lib/report/useReport'
import {
  deleteShareLink,
  fetchAccessLog,
  publishReport,
  type AccessLogEntry,
  revokeShareLink,
  syncShareLinks,
} from '@/lib/share/api'
import { getSupabase, isSharingConfigured } from '@/lib/share/supabase'
import { describeUserAgent } from '@/lib/share/userAgent'
import type { ShareLinkRecord } from '@/lib/types'
import { pluralise } from '@/lib/utils'
import { isValidPin } from '../../supabase/functions/_shared/access.ts'

function NotConfigured() {
  return (
    <Card className="p-6">
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-subtle text-ink-2">
          <Unplug className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold">Online sharing isn't set up</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Private links need a secure backend (Supabase) that hosts only the reports you publish. This installation has no
            backend configured, so no links can be created. Your diary, food library and PDF reports work fully without it.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            To enable sharing, set <code className="rounded bg-subtle px-1 text-xs">VITE_SUPABASE_URL</code> and{' '}
            <code className="rounded bg-subtle px-1 text-xs">VITE_SUPABASE_PUBLISHABLE_KEY</code> and follow the Supabase steps in
            the README.
          </p>
        </div>
      </div>
    </Card>
  )
}

function linkStatus(l: ShareLinkRecord): { label: string; tone: 'accent' | 'warn' | 'neutral'; active: boolean } {
  if (l.pendingRevoke) return { label: 'Revocation pending', tone: 'warn', active: false }
  if (l.revokedAt) return { label: 'Revoked', tone: 'neutral', active: false }
  if (l.expiresAt <= Date.now()) return { label: 'Expired', tone: 'neutral', active: false }
  const days = Math.ceil((l.expiresAt - Date.now()) / 86_400_000)
  return { label: `Active · ${days === 1 ? 'expires tomorrow' : `${days} days left`}`, tone: 'accent', active: true }
}

function ShareActions({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false)
  const message = `My food diary (${title}): ${url}`
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        variant="secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(url)
          setCopied(true)
          setTimeout(() => setCopied(false), 1800)
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy link'}
      </Button>
      <Button variant="secondary" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener')}>
        <MessageCircle className="size-4" /> WhatsApp
      </Button>
      <Button
        variant="secondary"
        onClick={() => (location.href = `mailto:?subject=${encodeURIComponent(`Food diary – ${title}`)}&body=${encodeURIComponent(`Hello,\n\nHere is my food diary:\n${url}\n\nKind regards`)}`)}
      >
        <Mail className="size-4" /> Email
      </Button>
      {'share' in navigator ? (
        <Button variant="secondary" onClick={() => void navigator.share({ title: 'Food diary', text: `My food diary (${title})`, url }).catch(() => {})}>
          <Share2 className="size-4" /> More…
        </Button>
      ) : (
        <span />
      )}
    </div>
  )
}

function AccessLogSheet({ link, timeZone, onClose }: { link: ShareLinkRecord | null; timeZone: string; onClose: () => void }) {
  const [entries, setEntries] = useState<AccessLogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!link) return
    let cancelled = false
    setEntries(null)
    setError(null)
    fetchAccessLog(link.id).then(
      (e) => !cancelled && setEntries(e),
      (e: Error) => !cancelled && setError(e.message),
    )
    return () => {
      cancelled = true
    }
  }, [link])

  return (
    <Sheet open={!!link} onOpenChange={(o) => !o && onClose()} title="Access log" description={link?.title} size="sm">
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : !entries ? (
        <div className="grid place-items-center py-8 text-muted">
          <Spinner className="size-5" />
        </div>
      ) : entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">Nobody has opened this link yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line/70">
          {entries.map((e) => (
            <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-2.5">
              <span className="truncate text-sm font-medium">{formatTimestamp(e.at, timeZone)}</span>
              {e.kind === 'pin_failed' ? <Badge tone="warn">Wrong PIN</Badge> : <Badge>Opened</Badge>}
              <span className="truncate font-mono text-xs text-ink-2">{e.ip ?? 'IP unknown'}</span>
              <span className="truncate text-right text-xs text-muted">{describeUserAgent(e.userAgent)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs leading-relaxed text-muted">
        Repeat visits from the same browser within 30 minutes count once. An IP address shows roughly where the connection came
        from (a home, an office, a mobile network); VPNs and mobile networks can hide or share it. Entries are kept for 90 days
        and deleted with the link. Visitors are told that opening the report is logged.
      </p>
    </Sheet>
  )
}

export default function SharingPage() {
  const location = useLocation()
  const settings = useSettings()
  const { date: today } = useNow()
  const confirm = useConfirm()
  const online = useOnline()
  const configured = isSharingConfigured()
  const [user, setUser] = useState<User | null | undefined>(configured ? undefined : null)
  const initial = (location.state as { config?: ReportConfig } | null)?.config
  const [cfg, setCfg] = useState<ReportConfig | null>(initial ?? null)
  const [expiry, setExpiry] = useState<'7' | '30' | '90'>('30')
  const [usePin, setUsePin] = useState(false)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [published, setPublished] = useState<ShareLinkRecord | null>(null)
  const [logFor, setLogFor] = useState<ShareLinkRecord | null>(null)
  const links = useLiveQuery(() => db.shareLinks.orderBy('createdAt').reverse().toArray(), [], [])

  useEffect(() => {
    if (!configured) return
    let unsub: (() => void) | undefined
    void getSupabase().then(async (sb) => {
      const { data } = await sb.auth.getSession()
      setUser(data.session?.user ?? null)
      const sub = sb.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null))
      unsub = () => sub.data.subscription.unsubscribe()
    })
    return () => unsub?.()
  }, [configured])

  useEffect(() => {
    if (user) void syncShareLinks()
  }, [user, online])

  const { report, photoCount } = useLocalReport({
    start: cfg?.start ?? today,
    end: cfg?.end ?? today,
    title: cfg?.title ?? '',
    patientName: cfg?.patientName ?? '',
    options: cfg?.options ?? settings.reportOptions,
    timeZone: settings.timeZone,
    enabled: !!cfg && configValid(cfg),
  })

  async function publish() {
    if (!report || !cfg) return
    if (usePin && !isValidPin(pin)) {
      toast.error('The PIN must be 4–12 letters or digits.')
      return
    }
    const ok = await confirm({
      title: 'Publish this report?',
      message: (
        <>
          A read-only copy of <strong>{pluralise(reportEntryCount(report), 'entry', 'entries')}</strong>
          {report.options.includePhotos ? ` and ${pluralise(photoCount, 'photo')}` : ''} from{' '}
          {formatPeriod(report.periodStart, report.periodEnd)} will be uploaded to the sharing server. Nothing else from your
          diary is uploaded. Anyone with the link{usePin ? ' and PIN' : ''} can view it for {expiry} days or until you revoke it.
          You'll see when it was opened and from which IP address.
        </>
      ),
      confirmLabel: 'Publish link',
    })
    if (!ok) return
    try {
      setBusy('Preparing…')
      const record = await publishReport(
        { report, expiresInDays: Number(expiry) as 7 | 30 | 90, pin: usePin ? pin : undefined },
        setBusy,
      )
      setPublished(record)
      setCfg(null)
      setPin('')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function revoke(l: ShareLinkRecord) {
    const ok = await confirm({
      title: 'Revoke this link?',
      message: 'The link stops working immediately and its uploaded contents and photos are removed. This cannot be undone.',
      confirmLabel: 'Revoke link',
      danger: true,
    })
    if (!ok) return
    try {
      const r = await revokeShareLink(l.id)
      toast.success(r === 'queued' ? "You're offline – the link will be revoked as soon as you reconnect." : 'Link revoked')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function remove(l: ShareLinkRecord) {
    const ok = await confirm({
      title: 'Delete this link?',
      message: 'The link and everything uploaded for it are deleted from the server.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteShareLink(l.id)
      toast.success('Link deleted')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div>
      <PageHeader title="Shared links" subtitle="Private, read-only reports" large back />

      {!configured ? (
        <NotConfigured />
      ) : user === undefined ? (
        <div className="grid place-items-center py-16 text-muted">
          <Spinner className="size-6" />
        </div>
      ) : !user ? (
        <div className="grid place-items-center py-16 text-muted">
          <Spinner className="size-6" />
        </div>
      ) : (
        <>
          {cfg ? (
            <div className="flex flex-col gap-4">
              <ReportOptionsForm value={cfg} onChange={setCfg} today={today} />
              <FormSection title="Access">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[0.8125rem] font-medium text-ink-2">Link expires after</span>
                  <Segmented
                    value={expiry}
                    onChange={setExpiry}
                    options={[
                      { value: '7', label: '7 days' },
                      { value: '30', label: '30 days' },
                      { value: '90', label: '90 days' },
                    ]}
                  />
                </div>
                <Switch checked={usePin} onChange={setUsePin} label="Protect with a PIN" description="Send the PIN separately from the link, e.g. by phone." />
                {usePin && (
                  <Field label="PIN" hint="4–12 letters or digits">
                    {(id) => <Input id={id} value={pin} onChange={(e) => setPin(e.target.value.replace(/[^0-9A-Za-z]/g, ''))} maxLength={12} autoComplete="off" className="tabular tracking-[0.2em]" />}
                  </Field>
                )}
              </FormSection>
              <Card className="p-4">
                <p className="text-sm text-ink-2">
                  {report ? (
                    <>
                      Will share <strong className="text-ink">{pluralise(reportEntryCount(report), 'entry', 'entries')}</strong>
                      {cfg.options.includePhotos && <> and {pluralise(photoCount, 'photo')}</>}. Later edits to your diary won't change
                      this link – create a new one if needed.
                    </>
                  ) : (
                    'Choose a valid period.'
                  )}
                </p>
                <div className="mt-3 flex gap-2.5">
                  <Button variant="secondary" size="lg" className="flex-1" onClick={() => setCfg(null)} disabled={!!busy}>
                    Cancel
                  </Button>
                  <Button size="lg" className="flex-[2]" onClick={() => void publish()} disabled={!report || !!busy || !online}>
                    {busy ? (
                      <>
                        <Spinner /> {busy}
                      </>
                    ) : (
                      <>
                        <Link2 className="size-4.5" /> Publish link
                      </>
                    )}
                  </Button>
                </div>
                {!online && <p className="mt-2 text-xs text-warn">You're offline. Connect to publish a link.</p>}
              </Card>
            </div>
          ) : (
            <Button size="lg" block onClick={() => setCfg(defaultConfig(today, settings.reportOptions, settings.patientName))}>
              <Plus className="size-4.5" /> New private link
            </Button>
          )}
        </>
      )}

      {links.length > 0 && (
        <>
          <SectionTitle>Your links</SectionTitle>
          <div className="flex flex-col gap-3">
            {links.map((l) => {
              const st = linkStatus(l)
              return (
                <Card key={l.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{l.title}</p>
                      <p className="text-sm text-muted">{formatPeriod(l.periodStart, l.periodEnd)}</p>
                    </div>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {l.hasPin && (
                      <Badge>
                        <KeyRound className="size-3" /> PIN
                      </Badge>
                    )}
                    {l.includesPhotos && <Badge>Photos</Badge>}
                    {typeof l.viewCount === 'number' && <Badge>{pluralise(l.viewCount, 'view')}</Badge>}
                    <span className="text-xs text-muted">Created {formatTimestamp(l.createdAt, settings.timeZone)}</span>
                  </div>
                  {st.active && l.url && (
                    <div className="mt-3">
                      <ShareActions url={l.url} title={formatPeriod(l.periodStart, l.periodEnd)} />
                    </div>
                  )}
                  {st.active && !l.url && <p className="mt-2 text-xs text-muted">The link itself is only stored on the device that created it.</p>}
                  {user && (
                    <div className="mt-3 flex justify-end gap-2 border-t border-line/70 pt-3">
                      <Button variant="ghost" size="sm" className="mr-auto" onClick={() => setLogFor(l)} disabled={!online}>
                        <History className="size-4" /> Access log
                      </Button>
                      {st.active && (
                        <Button variant="danger-soft" size="sm" onClick={() => void revoke(l)}>
                          Revoke
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => void remove(l)}>
                        <Trash2 className="size-4" /> Delete
                      </Button>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </>
      )}
      {configured && user && links.length === 0 && !cfg && (
        <EmptyState icon={<Link2 className="size-6" />} title="No links yet" className="mt-4">
          Create a private link to let your dietitian view a read-only report in their browser – no account or app needed.
        </EmptyState>
      )}

      <AccessLogSheet link={logFor} timeZone={settings.timeZone} onClose={() => setLogFor(null)} />

      <Sheet open={!!published} onOpenChange={(o) => !o && setPublished(null)} title="Your link is ready" size="sm">
        {published?.url && (
          <div className="flex flex-col gap-4">
            <div className="break-all rounded-xl bg-subtle px-3 py-2.5 font-mono text-xs text-ink-2">{published.url}</div>
            <ShareActions url={published.url} title={formatPeriod(published.periodStart, published.periodEnd)} />
            <p className="text-xs leading-relaxed text-muted">
              Anyone with this link{published.hasPin ? ' and the PIN' : ''} can view this report until{' '}
              {formatTimestamp(published.expiresAt, settings.timeZone)}. You can revoke it at any time on this page.
            </p>
          </div>
        )}
      </Sheet>
    </div>
  )
}
