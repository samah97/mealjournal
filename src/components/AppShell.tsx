import { BookOpen, CalendarDays, ChefHat, CloudOff, FileText, Home, Link2, Plus, Settings } from 'lucide-react'
import { Suspense, useEffect } from 'react'
import { NavLink, Outlet, useLocation, useMatches } from 'react-router'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useOnline } from '@/lib/hooks'
import { describeSync, useSync } from '@/lib/sync/useSync'
import { cn } from '@/lib/utils'
import { ButtonLink } from './ui/Button'
import { Spinner } from './ui/misc'

const PRIMARY = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/diary', label: 'Diary', icon: CalendarDays },
  { to: '/foods', label: 'Foods', icon: BookOpen },
  { to: '/meals', label: 'Meals', icon: ChefHat },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const SECONDARY = [
  { to: '/report', label: 'PDF report', icon: FileText },
  { to: '/sharing', label: 'Shared links', icon: Link2 },
]

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/logo.svg" alt="" className="size-8 rounded-[0.6rem]" />
      <span className="text-[1.0625rem] font-semibold tracking-tight">MealJournal</span>
    </div>
  )
}

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  useEffect(() => {
    if (!needRefresh) return
    toast('A new version of MealJournal is available.', {
      duration: Infinity,
      action: { label: 'Update', onClick: () => void updateServiceWorker(true) },
    })
  }, [needRefresh, updateServiceWorker])
  return null
}

export function OfflineBadge({ className }: { className?: string }) {
  const online = useOnline()
  if (online) return null
  return (
    <div className={cn('flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1.5 text-xs font-medium text-warn', className)} role="status">
      <CloudOff className="size-3.5" />
      Offline · entries are saved and will sync later
    </div>
  )
}

/** Small, quiet sync status: a dot and a short line. */
export function SyncStatusLine({ className }: { className?: string }) {
  const sync = useSync()
  const tone = sync.status === 'error' ? 'bg-danger' : sync.status === 'offline' ? 'bg-warn' : 'bg-accent'
  return (
    <span className={cn('flex items-center gap-1.5', className)} role="status">
      <span className={cn('size-1.5 rounded-full', tone, sync.status === 'syncing' && 'animate-pulse')} />
      {describeSync(sync)}
    </span>
  )
}

export function AppShell() {
  const matches = useMatches()
  const location = useLocation()
  const handles = matches.map((m) => (m.handle ?? {}) as { hideNav?: boolean; wide?: boolean })
  const hideNav = handles.some((h) => h.hideNav)
  const wide = handles.some((h) => h.wide)
  const showFab = location.pathname === '/' || location.pathname === '/diary'
  const online = useOnline()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="min-h-dvh">
      <UpdatePrompt />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-surface/60 px-4 py-6 backdrop-blur lg:flex">
        <div className="px-2">
          <Logo />
        </div>
        <ButtonLink to="/add" className="mt-7" block>
          <Plus className="size-4.5" /> New entry
        </ButtonLink>
        <nav className="mt-6 flex flex-col gap-0.5" aria-label="Main">
          {PRIMARY.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex h-10 items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-medium transition-colors',
                  isActive ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-subtle hover:text-ink',
                )
              }
            >
              <Icon className="size-[1.15rem]" /> {label}
            </NavLink>
          ))}
          <div className="mx-3 my-3 h-px bg-line" />
          {SECONDARY.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex h-10 items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-medium transition-colors',
                  isActive ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-subtle hover:text-ink',
                )
              }
            >
              <Icon className="size-[1.15rem]" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-2 text-xs text-muted">
          {online ? <SyncStatusLine /> : <OfflineBadge />}
        </div>
      </aside>

      <main
        className={cn(
          'w-full px-4 sm:px-6 lg:py-6 lg:pl-[calc(16rem+2.5rem)] lg:pr-10',
          hideNav ? 'pb-10' : 'pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-12',
        )}
      >
        <div className={cn('mx-auto w-full', wide ? 'max-w-3xl lg:max-w-6xl' : 'max-w-3xl')}>
          <Suspense
            fallback={
              <div className="grid min-h-[50vh] place-items-center text-muted">
                <Spinner className="size-6" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </main>

      {showFab && (
        <ButtonLink
          to="/add"
          size="icon"
          aria-label="Add entry"
          className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-40 size-15 shadow-float lg:hidden"
        >
          <Plus className="size-7" strokeWidth={2.25} />
        </ButtonLink>
      )}

      {/* Mobile bottom navigation */}
      {!hideNav && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-surface/90 pb-safe backdrop-blur-xl lg:hidden"
          aria-label="Main"
        >
          <div className="mx-auto grid h-16 max-w-xl grid-cols-5">
            {PRIMARY.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors',
                    isActive ? 'text-accent-ink' : 'text-muted',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cn('grid h-7 w-12 place-items-center rounded-full transition-colors', isActive && 'bg-accent-soft')}>
                      <Icon className="size-5" strokeWidth={isActive ? 2.25 : 1.9} />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
