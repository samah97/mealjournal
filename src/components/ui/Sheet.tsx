import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Bottom sheet on phones, centred dialog on larger screens.
 * Built on Radix Dialog for focus trapping, Escape handling and ARIA.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  size = 'md',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgb(20_24_21/0.38)] backdrop-blur-[2px] animate-fade-in" />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex flex-col bg-surface text-ink shadow-float outline-none',
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[1.5rem] animate-slide-up pb-safe',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[1.5rem] sm:max-h-[85dvh] sm:animate-pop sm:pb-0',
            size === 'sm' && 'sm:w-[26rem]',
            size === 'md' && 'sm:w-[34rem]',
            size === 'lg' && 'sm:w-[44rem]',
            className,
          )}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-3 sm:pt-5">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold tracking-tight">{title}</Dialog.Title>
              {description && <Dialog.Description className="mt-0.5 text-sm text-muted">{description}</Dialog.Description>}
            </div>
            <Dialog.Close className="-mr-1.5 grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-subtle hover:text-ink" aria-label="Close">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-2">{children}</div>
          {footer && <div className="border-t border-line px-5 py-3.5">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
