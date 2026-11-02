import { Download, ExternalLink, FileText, Link2, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { configValid, defaultConfig, ReportOptionsForm, type ReportConfig } from '@/components/ReportOptionsForm'
import { ReportView } from '@/components/ReportView'
import { Button } from '@/components/ui/Button'
import { Card, PageHeader, SectionTitle, Spinner } from '@/components/ui/misc'
import { Sheet } from '@/components/ui/Sheet'
import { updateSettings } from '@/lib/db'
import { useNow, useSettings, useStoredSettings } from '@/lib/hooks'
import { reportEntryCount } from '@/lib/report/buildReport'
import { generateReportPdf, localPdfImages, reportFilename, sharePdf } from '@/lib/report/export'
import { useLocalPhotoUrls, useLocalReport } from '@/lib/report/useReport'
import { downloadBlob, formatBytes, pluralise } from '@/lib/utils'

export default function ReportPage() {
  const { date: today } = useNow()
  const settings = useSettings()
  const stored = useStoredSettings()
  const navigate = useNavigate()
  const [cfg, setCfg] = useState<ReportConfig | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<{ blob: Blob; url: string; filename: string } | null>(null)

  // Initialise from saved preferences once they have loaded from the database.
  useEffect(() => {
    if (!cfg && stored) setCfg(defaultConfig(today, stored.reportOptions, stored.patientName))
  }, [stored, today, cfg])

  const { report, photoCount } = useLocalReport({
    start: cfg?.start ?? today,
    end: cfg?.end ?? today,
    title: cfg?.title ?? '',
    patientName: cfg?.patientName ?? '',
    options: cfg?.options ?? settings.reportOptions,
    timeZone: settings.timeZone,
    enabled: !!cfg && configValid(cfg),
  })
  const photoUrls = useLocalPhotoUrls(report)

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url)
  }, [result])

  function change(c: ReportConfig) {
    setCfg(c)
    void updateSettings({ reportOptions: c.options, patientName: c.patientName.trim() || undefined })
  }

  async function makePdf() {
    if (!report) return
    try {
      setBusy('Preparing photos…')
      const images = await localPdfImages(report, (d, t) => setBusy(`Preparing photos ${d} of ${t}…`))
      setBusy('Building PDF…')
      const blob = await generateReportPdf(report, images)
      setResult({ blob, url: URL.createObjectURL(blob), filename: reportFilename(report) })
    } catch (e) {
      console.error(e)
      toast.error(`Could not create the PDF: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  if (!cfg) return null
  const count = report ? reportEntryCount(report) : 0
  const canShareFiles = typeof navigator.canShare === 'function'

  return (
    <div>
      <PageHeader title="Report" subtitle="For your dietitian" large back />

      <div className="grid gap-6 xl:grid-cols-[22rem_1fr] xl:items-start">
        <div className="flex flex-col gap-4 xl:sticky xl:top-6">
          <ReportOptionsForm value={cfg} onChange={change} today={today} />

          <Card className="p-4">
            <p className="text-sm text-ink-2">
              {report ? (
                <>
                  <strong className="font-semibold text-ink">{pluralise(count, 'entry', 'entries')}</strong>
                  {cfg.options.includePhotos && <> · {pluralise(photoCount, 'photo')}</>} in this period
                </>
              ) : (
                'Choose a valid period.'
              )}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <Button size="lg" onClick={() => void makePdf()} disabled={!report || !!busy}>
                {busy ? (
                  <>
                    <Spinner /> {busy}
                  </>
                ) : (
                  <>
                    <FileText className="size-4.5" /> Create PDF
                  </>
                )}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                disabled={!report}
                onClick={() => navigate('/sharing', { state: { config: cfg } })}
              >
                <Link2 className="size-4.5" /> Create private link
              </Button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">The PDF is created on this device. Nothing is uploaded.</p>
          </Card>
        </div>

        <div>
          <SectionTitle>Preview</SectionTitle>
          {report ? (
            <ReportView report={report} photo={(id) => photoUrls[id]} />
          ) : (
            <Card className="p-8 text-center text-sm text-muted">The preview appears here.</Card>
          )}
        </div>
      </div>

      <Sheet
        open={!!result}
        onOpenChange={(o) => !o && setResult(null)}
        title="Your PDF is ready"
        description={result ? `${result.filename} · ${formatBytes(result.blob.size)}` : undefined}
        size="sm"
      >
        {result && (
          <div className="flex flex-col gap-2.5 pb-1">
            <Button size="lg" onClick={() => downloadBlob(result.blob, result.filename)}>
              <Download className="size-4.5" /> Download PDF
            </Button>
            {canShareFiles && (
              <Button
                size="lg"
                variant="secondary"
                onClick={async () => {
                  const ok = await sharePdf(result.blob, result.filename, report?.title ?? 'Food diary')
                  if (!ok) toast.message('Sharing files is not supported here – download the PDF instead.')
                }}
              >
                <Share2 className="size-4.5" /> Share…
              </Button>
            )}
            <Button size="lg" variant="ghost" onClick={() => window.open(result.url, '_blank', 'noopener')}>
              <ExternalLink className="size-4.5" /> Open PDF
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  )
}
