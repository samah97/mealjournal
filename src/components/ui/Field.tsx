import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export const controlClass =
  'w-full bg-surface border border-line rounded-control px-3.5 text-[0.9375rem] text-ink placeholder:text-muted/80 transition-colors focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 disabled:opacity-60'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(controlClass, 'h-11', className)} {...props} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(controlClass, 'py-2.5 leading-relaxed resize-y min-h-20', className)} {...props} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <div className={cn('relative', className)}>
      <select ref={ref} className={cn(controlClass, 'h-11 appearance-none pr-9')} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
    </div>
  )
})

export function Field({
  label,
  hint,
  error,
  children,
  className,
  optional,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string
  optional?: boolean
  className?: string
  children: (id: string) => ReactNode
}) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[0.8125rem] font-medium text-ink-2">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children(id)}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted leading-relaxed">{hint}</p>
      ) : null}
    </div>
  )
}

/** Section of a form, rendered as a quiet card with a heading. */
export function FormSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-card bg-surface border border-line/70 p-4 sm:p-5 shadow-card', className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-[0.9375rem] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  )
}
