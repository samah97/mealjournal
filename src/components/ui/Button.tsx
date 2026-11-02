import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'danger-soft'
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const base =
  'inline-flex items-center justify-center gap-2 font-medium select-none transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 whitespace-nowrap'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-[0_1px_2px_rgb(0_0_0/0.08)]',
  secondary: 'bg-surface text-ink border border-line hover:bg-subtle',
  soft: 'bg-accent-soft text-accent-ink hover:brightness-[0.97]',
  ghost: 'text-ink-2 hover:bg-subtle hover:text-ink',
  danger: 'bg-danger text-white hover:brightness-95',
  'danger-soft': 'bg-danger-soft text-danger hover:brightness-[0.97]',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm rounded-[0.75rem]',
  md: 'h-11 px-4.5 text-[0.9375rem] rounded-control',
  lg: 'h-13 px-6 text-base rounded-[1rem]',
  icon: 'size-11 rounded-full',
  'icon-sm': 'size-9 rounded-full',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  block?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block, className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(base, variants[variant], sizes[size], block && 'w-full', className)}
      {...props}
    />
  )
})

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  block,
  className,
  ...props
}: LinkProps & { variant?: Variant; size?: Size; block?: boolean }) {
  return <Link className={cn(base, variants[variant], sizes[size], block && 'w-full', className)} {...props} />
}
