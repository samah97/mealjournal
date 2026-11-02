import type { User } from '@supabase/supabase-js'
import { Mail, ShieldCheck, Unplug } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { db, wipeLocalData } from '@/lib/db'
import { useOnline } from '@/lib/hooks'
import { CODE_SENT_MESSAGE, sendSignInCode, verifySignInCode } from '@/lib/share/api'
import { getSupabase, isSharingConfigured } from '@/lib/share/supabase'
import { accountHasData, bindAccount, getMeta, hasLocalDiary, startSync } from '@/lib/sync/engine'
import { bindingAction, unusedStarterFoods } from '@/lib/sync/merge'
import { pluralise } from '@/lib/utils'
import { Button } from './ui/Button'
import { Input } from './ui/Field'
import { Card, Spinner } from './ui/misc'

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10 pt-safe">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <img src="/logo.svg" alt="" className="size-9 rounded-[0.6rem]" />
          <span className="text-xl font-semibold tracking-tight">MealJournal</span>
        </div>
        {children}
      </div>
    </div>
  )
}

function NotConfigured() {
  return (
    <Screen>
      <Card className="p-6">
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-subtle text-ink-2">
            <Unplug className="size-5" />
          </span>
          <div>
            <h1 className="font-semibold">This installation isn't set up yet</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              MealJournal keeps your diary in your own account so it follows you across devices. No account backend (Supabase) is
              configured here, so sign-in is unavailable.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Set <code className="rounded bg-subtle px-1 text-xs">VITE_SUPABASE_URL</code> and{' '}
              <code className="rounded bg-subtle px-1 text-xs">VITE_SUPABASE_PUBLISHABLE_KEY</code> and follow the README.
            </p>
          </div>
        </div>
      </Card>
    </Screen>
  )
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const online = useOnline()

  return (
    <Screen>
      <Card className="p-5">
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
            <ShieldCheck className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold">Sign in</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              MealJournal is private and invite-only. Enter the email address your account was created for and we'll send a
              one-time code – no password needed.
            </p>
            {!sent ? (
              <form
                className="mt-4 flex flex-col gap-2.5"
                onSubmit={async (e) => {
                  e.preventDefault()
                  setBusy(true)
                  try {
                    await sendSignInCode(email.trim())
                    setSent(true)
                    toast(CODE_SENT_MESSAGE)
                  } catch (err) {
                    toast.error((err as Error).message)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
                <Button type="submit" disabled={busy || !online}>
                  {busy ? <Spinner /> : <Mail className="size-4" />} Send code
                </Button>
              </form>
            ) : (
              <form
                className="mt-4 flex flex-col gap-2.5"
                onSubmit={async (e) => {
                  e.preventDefault()
                  setBusy(true)
                  try {
                    await verifySignInCode(email.trim(), code)
                  } catch (err) {
                    toast.error((err as Error).message)
                    setBusy(false)
                  }
                }}
              >
                <p className="text-sm text-ink-2">
                  {CODE_SENT_MESSAGE} Enter the 6-digit code for <strong>{email}</strong>. It is valid for 10 minutes.
                </p>
                <div className="flex gap-2.5">
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    maxLength={10}
                    className="tabular flex-1 tracking-[0.3em]"
                    aria-label="Sign-in code"
                  />
                  <Button type="submit" disabled={busy || code.length < 6}>
                    {busy && <Spinner />} Verify
                  </Button>
                </div>
                <button type="button" className="self-start text-xs font-medium text-accent-ink" onClick={() => { setSent(false); setCode('') }}>
                  Use a different email
                </button>
              </form>
            )}
            {!online && <p className="mt-2 text-xs text-warn">You're offline. Connect to sign in.</p>}
          </div>
        </div>
      </Card>
    </Screen>
  )
}

function Migrate({ user, accountHasDiary, onDone }: { user: User; accountHasDiary: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [counts, setCounts] = useState<string>()
  useEffect(() => {
    void (async () => {
      const [e, f, m] = await Promise.all([db.entries.count(), db.foods.count(), db.mealTemplates.count()])
      setCounts(`${pluralise(e, 'entry', 'entries')}, ${pluralise(f, 'food')} and ${pluralise(m, 'meal')}`)
    })()
  }, [])

  async function choose(move: boolean) {
    setBusy(true)
    try {
      if (move) {
        // The account already has a diary: our never-used starter foods would only be duplicates.
        const drop = accountHasDiary ? unusedStarterFoods(await db.foods.toArray()).map((f) => f.id) : []
        await bindAccount(user.id, true, drop)
      } else {
        await wipeLocalData()
        await bindAccount(user.id, false)
      }
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Card className="p-5">
        <h1 className="font-semibold">Move this device's diary into your account?</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          This browser already holds a diary{counts ? ` (${counts})` : ''} from before accounts existed. Moving it uploads it to
          your account{accountHasDiary ? ', next to what your account already contains' : ''}, so all your devices see it.
        </p>
        <div className="mt-4 flex flex-col gap-2.5">
          <Button size="lg" disabled={busy} onClick={() => void choose(true)}>
            {busy && <Spinner />} Move it into my account
          </Button>
          <Button size="lg" variant="secondary" disabled={busy} onClick={() => void choose(false)}>
            Discard this device's diary
          </Button>
        </div>
      </Card>
    </Screen>
  )
}

type Phase =
  | { name: 'loading' }
  | { name: 'signed-out' }
  | { name: 'binding'; user: User }
  | { name: 'migrate'; user: User; accountHasDiary: boolean }
  | { name: 'ready'; user: User }
  | { name: 'offline'; user: User }
  | { name: 'error'; message: string }

/** Requires a signed-in account and a diary bound to it; starts background sync once ready. */
export function AuthGate({ children }: { children: ReactNode }) {
  const configured = isSharingConfigured()
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [phase, setPhase] = useState<Phase>({ name: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const online = useOnline()

  useEffect(() => {
    if (!configured) return
    let unsub: (() => void) | undefined
    let cancelled = false
    void getSupabase().then(async (sb) => {
      const { data } = await sb.auth.getSession()
      if (cancelled) return
      setUser(data.session?.user ?? null)
      const sub = sb.auth.onAuthStateChange((_e, session) => setUser((prev) => (prev?.id === session?.user?.id ? prev : (session?.user ?? null))))
      unsub = () => sub.data.subscription.unsubscribe()
    })
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [configured])

  useEffect(() => {
    if (user === undefined) return
    if (user === null) {
      setPhase({ name: 'signed-out' })
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const action = bindingAction(await getMeta<string>('accountId'), user.id, await hasLocalDiary())
        if (action === 'ready') return !cancelled && setPhase({ name: 'ready', user })
        // Binding needs the server (the account may already hold a diary).
        if (!navigator.onLine) return !cancelled && setPhase({ name: 'offline', user })
        if (action === 'wipe') {
          // Leftovers of another account: never mix diaries.
          await wipeLocalData()
          await bindAccount(user.id, false)
        } else if (action === 'bind') {
          await bindAccount(user.id, false)
        } else {
          const has = await accountHasData()
          return !cancelled && setPhase({ name: 'migrate', user, accountHasDiary: has })
        }
        if (!cancelled) setPhase({ name: 'ready', user })
      } catch (e) {
        if (!cancelled) setPhase({ name: 'error', message: (e as Error).message })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, attempt, online])

  const ready = phase.name === 'ready'
  useEffect(() => {
    if (!ready) return
    return startSync()
  }, [ready])

  if (!configured) return <NotConfigured />
  switch (phase.name) {
    case 'loading':
    case 'binding':
      return (
        <div className="grid min-h-dvh place-items-center text-muted">
          <Spinner className="size-6" />
        </div>
      )
    case 'signed-out':
      return <SignIn />
    case 'migrate':
      return <Migrate user={phase.user} accountHasDiary={phase.accountHasDiary} onDone={() => setPhase({ name: 'ready', user: phase.user })} />
    case 'offline':
      return (
        <Screen>
          <Card className="p-5 text-sm text-ink-2">Connect to the internet to finish signing in on this device.</Card>
        </Screen>
      )
    case 'error':
      return (
        <Screen>
          <Card className="p-5">
            <p className="text-sm text-ink-2">Something went wrong while setting up this device: {phase.message}</p>
            <Button className="mt-3" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </Card>
        </Screen>
      )
    case 'ready':
      return <>{children}</>
  }
}
