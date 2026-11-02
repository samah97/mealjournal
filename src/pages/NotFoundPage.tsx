import { Compass } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/misc'

export function NotFoundPage() {
  return (
    <EmptyState icon={<Compass className="size-6" />} title="Page not found" action={<ButtonLink to="/">Go home</ButtonLink>} className="mt-16">
      This page doesn't exist.
    </EmptyState>
  )
}
