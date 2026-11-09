import { Download, KeyRound, Lock, ShieldCheck, TimerOff } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ReportView } from '@/components/ReportView'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Card, Spinner } from '@/components/ui/misc'
import { formatPeriod } from '@/lib/datetime'
import { generateReportPdf, remotePdfImages, reportFilename } from '@/lib/report/export'
import type { ReportData } from '@/lib/report/types'
import { fetchSharedReport, type SharedReportResult } from '@/lib/share/api'
import { downloadBlob } from '@/lib/utils'

function Centered({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-4">
      <Card className="w-full max-w-sm p-6 text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-accent-soft text-accent-ink">{icon}</div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {children && <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>}
      </Card>
    </div>
  )
}

/** Public, read-only view of a shared report. Uses no local data and needs no account. */
export default function SharedReportPage() {
  const [token, setToken] = useState(() => location.hash.replace(/^#/, ''))
  const [state, setState] = useState<SharedReportResult | { status: 'loading' }>({ status: 'loading' })
  const [pin, setPin] = useState('')
  const [checking, setChecking] = useState(false)
  const [pdfBusy, setPdfBusy] = useState<string | null>(null)

  // Opening a different link in the same tab only changes the fragment: start over for it.
  useEffect(() => {
    const onHash = () => {
      setState({ status: 'loading' })
      setPin('')
      setToken(location.hash.replace(/^#/, ''))
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const load = useCallback(
    async (p?: string) => {
      if (!token) return setState({ status: 'unavailable' })
      const r = await fetchSharedReport(token, p)
      setState(r)
    },
    [token],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    document.title = state.status === 'ok' ? `${state.report.title} – ${formatPeriod(state.report.periodStart, state.report.periodEnd)}` : 'Shared food diary'
  }, [state])

  async function downloadPdf(report: ReportData, photos: Record<string, string>) {
    try {
      setPdfBusy('Preparing photos…')
      // Photo URLs are short-lived; fetch fresh ones in case the page has been open a while.
      const fresh = report.options.includePhotos ? await fetchSharedReport(token, pin || undefined) : null
      const urls = fresh?.status === 'ok' ? fresh.photos : photos
      const images = await remotePdfImages(report, urls,(d, t) => setPdfBusy(`Preparing photos ${d} of ${t}…`))
      setPdfBusy('Building PDF…')
      downloadBlob(await generateReportPdf(report, images), reportFilename(report))
    } catch (e) {
      alert(`Could not create the PDF: ${(e as Error).message}`)
    } finally {
      setPdfBusy(null)
    }
  }

  const header = (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/85 pt-safe backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="" className="size-7 rounded-lg" />
          <span className="font-semibold tracking-tight">MealJournal</span>
          <span className="hidden text-sm text-muted sm:inline">· Shared food diary</span>
        </div>
        {state.status === 'ok' && (
          <Button size="sm" onClick={() => void downloadPdf(state.report, state.photos)} disabled={!!pdfBusy}>
            {pdfBusy ? <Spinner /> : <Download className="size-4" />}
            <span className="max-w-40 truncate">{pdfBusy ?? 'Download PDF'}</span>
          </Button>
        )}
      </div>
    </header>
  )

  let body: ReactNode
  switch (state.status) {
    case 'loading':
      body = (
        <div className="grid min-h-[70dvh] place-items-center text-muted">
          <Spinner className="size-6" />
        </div>
      )
      break
    case 'pin_required':
    case 'pin_invalid':
      body = (
        <Centered icon={<KeyRound className="size-6" />} title="Enter the PIN">
          <p>This food diary is protected. Enter the PIN you received separately.</p>
          <form
            className="mt-4 flex flex-col gap-2.5"
            onSubmit={async (e) => {
              e.preventDefault()
              setChecking(true)
              await load(pin)
              setChecking(false)
            }}
          >
            <Input value={pin} onChange={(e) => setPin(e.target.value)} autoFocus autoComplete="off" className="text-center tracking-[0.3em]" aria-label="PIN" maxLength={12} />
            {state.status === 'pin_invalid' && (
              <p className="text-xs text-danger">
                Incorrect PIN. {state.attemptsLeft} {state.attemptsLeft === 1 ? 'attempt' : 'attempts'} left.
              </p>
            )}
            <Button type="submit" disabled={checking || pin.length < 4}>
              {checking && <Spinner />} View diary
            </Button>
          </form>
        </Centered>
      )
      break
    case 'locked':
      body = (
        <Centered icon={<Lock className="size-6" />} title="Too many attempts">
          For security, this link is locked for {Math.ceil(state.retryAfterSeconds / 60)} minutes. Please try again later.
        </Centered>
      )
      break
    case 'unavailable':
      body = (
        <Centered icon={<TimerOff className="size-6" />} title="This link is not available">
          It may have expired or been revoked by its owner. Please ask them for a new link.
        </Centered>
      )
      break
    case 'error':
      body = (
        <Centered icon={<TimerOff className="size-6" />} title="Something went wrong">
          {state.message}
          <div className="mt-4">
            <Button variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        </Centered>
      )
      break
    case 'ok':
      body = (
        <div className="mx-auto max-w-3xl px-3 py-5 sm:px-4 sm:py-8">
          <ReportView report={state.report} photo={(id) => state.photos[id]} />
          <p className="mt-5 flex items-center justify-center gap-1.5 px-4 text-center text-xs text-muted">
            <ShieldCheck className="size-3.5 shrink-0" /> Private, read-only report shared by the patient. Please don't forward this link.
          </p>
        </div>
      )
      break
  }

  return (
    <div className="min-h-dvh pb-safe">
      {header}
      {body}
    </div>
  )
}
