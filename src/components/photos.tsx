import * as Dialog from '@radix-ui/react-dialog'
import { Camera, ImagePlus, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useBlobUrl, usePhotoUrl } from '@/lib/hooks'
import { compressPhoto } from '@/lib/images'
import type { Photo } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Spinner } from './ui/misc'

/** A photo in a form: either already stored (id only) or a new, unsaved draft. */
export interface PhotoSlot {
  id: string
  draft?: Photo
}

export function slotsFromIds(ids: (string | undefined)[]): PhotoSlot[] {
  return ids.filter((x): x is string => !!x).map((id) => ({ id }))
}

export function draftsOf(slots: PhotoSlot[]): Photo[] {
  return slots.flatMap((s) => (s.draft ? [s.draft] : []))
}

export function StoredPhoto({
  id,
  variant = 'thumb',
  className,
  alt = '',
}: {
  id: string
  variant?: 'thumb' | 'full'
  className?: string
  alt?: string
}) {
  const url = usePhotoUrl(id, variant)
  return url ? (
    <img src={url} alt={alt} className={cn('object-cover', className)} draggable={false} />
  ) : (
    <div className={cn('animate-pulse bg-subtle', className)} />
  )
}

function SlotImage({ slot, variant, className }: { slot: PhotoSlot; variant: 'thumb' | 'full'; className?: string }) {
  const draftUrl = useBlobUrl(slot.draft ? (variant === 'thumb' ? slot.draft.thumb : slot.draft.blob) : undefined)
  if (slot.draft) return draftUrl ? <img src={draftUrl} alt="" className={cn('object-cover', className)} /> : null
  return <StoredPhoto id={slot.id} variant={variant} className={className} />
}

/** Full-screen photo viewer. */
export function PhotoViewer({ slot, onClose }: { slot: PhotoSlot | null; onClose: () => void }) {
  return (
    <Dialog.Root open={!!slot} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/90 animate-fade-in" />
        <Dialog.Content className="fixed inset-0 z-50 grid place-items-center p-3 outline-none animate-fade-in" onClick={onClose}>
          <Dialog.Title className="sr-only">Photo</Dialog.Title>
          <Dialog.Description className="sr-only">Full size photo</Dialog.Description>
          {slot && <SlotImage slot={slot} variant="full" className="max-h-full max-w-full rounded-lg object-contain" />}
          <Dialog.Close
            className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] grid size-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur"
            aria-label="Close"
          >
            <X className="size-5" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Horizontal strip of tappable stored photos. */
export function PhotoStrip({ ids, className }: { ids: string[]; className?: string }) {
  const [open, setOpen] = useState<PhotoSlot | null>(null)
  if (!ids.length) return null
  return (
    <>
      <div className={cn('flex gap-2 overflow-x-auto scrollbar-none', className)}>
        {ids.map((id) => (
          <button key={id} type="button" onClick={() => setOpen({ id })} className="shrink-0 overflow-hidden rounded-xl">
            <StoredPhoto id={id} className="size-28 sm:size-36" alt="Meal photo" />
          </button>
        ))}
      </div>
      <PhotoViewer slot={open} onClose={() => setOpen(null)} />
    </>
  )
}

/**
 * Camera capture + gallery selection. Images are compressed on the device
 * before they are kept; nothing is uploaded anywhere.
 */
export function PhotoPicker({
  value,
  onChange,
  max = 6,
  compact,
}: {
  value: PhotoSlot[]
  onChange: (slots: PhotoSlot[]) => void
  max?: number
  compact?: boolean
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(0)
  const [viewing, setViewing] = useState<PhotoSlot | null>(null)

  async function addFiles(files: FileList | null) {
    if (!files?.length) return
    const list = Array.from(files).slice(0, Math.max(0, max - value.length))
    if (list.length < files.length) toast.message(`You can add up to ${max} photos.`)
    setBusy(list.length)
    const added: PhotoSlot[] = []
    for (const f of list) {
      try {
        const photo = await compressPhoto(f)
        added.push({ id: photo.id, draft: photo })
      } catch (e) {
        toast.error((e as Error).message)
      }
      setBusy((b) => b - 1)
    }
    onChange([...value, ...added])
  }

  const full = value.length >= max
  const tile = compact ? 'size-20' : 'size-24 sm:size-28'

  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        {value.map((slot) => (
          <div key={slot.id} className={cn('group relative overflow-hidden rounded-2xl bg-subtle', tile)}>
            <button type="button" className="size-full" onClick={() => setViewing(slot)} aria-label="View photo">
              <SlotImage slot={slot} variant="thumb" className="size-full" />
            </button>
            <button
              type="button"
              onClick={() => onChange(value.filter((s) => s.id !== slot.id))}
              className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm"
              aria-label="Remove photo"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
        {Array.from({ length: busy }).map((_, i) => (
          <div key={`busy-${i}`} className={cn('grid place-items-center rounded-2xl bg-subtle text-muted', tile)}>
            <Spinner />
          </div>
        ))}
        {!full && (
          <>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className={cn(
                'flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line-strong bg-surface text-ink-2 transition-colors hover:border-accent hover:text-accent-ink',
                tile,
              )}
            >
              <Camera className="size-5.5" />
              <span className="text-xs font-medium">Camera</span>
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className={cn(
                'flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line-strong bg-surface text-ink-2 transition-colors hover:border-accent hover:text-accent-ink',
                tile,
              )}
            >
              <ImagePlus className="size-5.5" />
              <span className="text-xs font-medium">Gallery</span>
            </button>
          </>
        )}
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple={max > 1}
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <PhotoViewer slot={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}
