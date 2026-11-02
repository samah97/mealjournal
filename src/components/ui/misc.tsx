import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router'
import { cn } from '@/lib/utils'

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-card bg-surface border border-line/70 shadow-card', className)} {...props}>
      {children}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}) {
  return (
    <label className={cn('flex cursor-pointer items-center justify-between gap-4 py-1', disabled && 'opacity-50')}>
      <span className="min-w-0">
        <span className="block text-[0.9375rem] text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-7 w-12 rounded-full bg-line-strong transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2" />
        <span className="absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  )
}

export function Chip({
  active,
  onClick,
  children,
  className,
  color,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  className?: string
  color?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
        active
          ? 'border-transparent bg-ink text-canvas'
          : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
        className,
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />}
      {children}
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  className?: string
}) {
  return (
    <div className={cn('inline-flex rounded-control bg-subtle p-1', className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 flex-1 rounded-[0.65rem] px-3 text-sm font-medium transition-all',
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode
  title: ReactNode
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {icon && <div className="mb-4 grid size-14 place-items-center rounded-full bg-accent-soft text-accent-ink">{icon}</div>}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {children && <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Sticky page header: back button, title, trailing actions. */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  large,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: string | boolean
  actions?: ReactNode
  large?: boolean
}) {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-30 -mx-4 mb-2 bg-canvas/85 px-4 pt-safe backdrop-blur-xl sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
      <div className={cn('flex items-center gap-2', large ? 'min-h-16 pt-3 pb-1' : 'min-h-14')}>
        {back && (
          <button
            type="button"
            onClick={() => (typeof back === 'string' ? navigate(back) : history.length > 1 ? navigate(-1) : navigate('/'))}
            className="-ml-2 grid size-10 shrink-0 place-items-center rounded-full text-ink hover:bg-subtle"
            aria-label="Back"
          >
            <ChevronLeft className="size-6" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className={cn('truncate font-semibold tracking-tight text-ink', large ? 'text-[1.75rem] leading-tight' : 'text-lg')}>
            {title}
          </h1>
          {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
    </header>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-7 flex items-center justify-between px-0.5">
      <h2 className="text-[0.8125rem] font-semibold uppercase tracking-[0.06em] text-muted">{children}</h2>
      {action}
    </div>
  )
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warn'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5.5 items-center gap-1 rounded-full px-2 text-[0.6875rem] font-medium',
        tone === 'neutral' && 'bg-subtle text-ink-2',
        tone === 'accent' && 'bg-accent-soft text-accent-ink',
        tone === 'warn' && 'bg-warn-soft text-warn',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
      aria-hidden
    />
  )
}
