import { db } from '../db'
import { blobToDataUrl, resizeForReport } from '../images'
import { reportPhotoIds } from './buildReport'
import type { PdfImage } from './pdf'
import type { ReportData } from './types'

/** PDF photos: re-encoded at ~1000 px so the file stays small but food stays identifiable. */
const PDF_EDGE = 1000
const PDF_QUALITY = 0.72

async function toPdfImage(blob: Blob): Promise<PdfImage> {
  const r = await resizeForReport(blob, PDF_EDGE, PDF_QUALITY)
  return { src: await blobToDataUrl(r.blob), width: r.width, height: r.height }
}

export async function localPdfImages(report: ReportData, onProgress?: (done: number, total: number) => void) {
  const ids = reportPhotoIds(report)
  const out: Record<string, PdfImage> = {}
  for (const [i, id] of ids.entries()) {
    const p = await db.photos.get(id)
    if (p) out[id] = await toPdfImage(p.blob)
    onProgress?.(i + 1, ids.length)
  }
  return out
}

export async function remotePdfImages(
  report: ReportData,
  urls: Record<string, string>,
  onProgress?: (done: number, total: number) => void,
) {
  const ids = reportPhotoIds(report)
  const out: Record<string, PdfImage> = {}
  for (const [i, id] of ids.entries()) {
    const url = urls[id]
    if (url) {
      try {
        const res = await fetch(url, { referrerPolicy: 'no-referrer' })
        if (res.ok) out[id] = await toPdfImage(await res.blob())
      } catch {
        /* the PDF is still produced without this photo */
      }
    }
    onProgress?.(i + 1, ids.length)
  }
  return out
}

export async function generateReportPdf(report: ReportData, images: Record<string, PdfImage>): Promise<Blob> {
  const { renderReportPdf } = await import('./pdf')
  return renderReportPdf(report, images)
}

export function reportFilename(report: ReportData): string {
  const base = report.patientName ? `${report.patientName} ` : ''
  return `${base}Food diary ${report.periodStart} to ${report.periodEnd}.pdf`.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ')
}

/** Share the PDF through the OS share sheet (WhatsApp, e-mail, Drive…) where supported. */
export async function sharePdf(blob: Blob, filename: string, title: string): Promise<boolean> {
  const file = new File([blob], filename, { type: 'application/pdf' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return true
    } catch (e) {
      if ((e as Error).name === 'AbortError') return true
    }
  }
  return false
}
