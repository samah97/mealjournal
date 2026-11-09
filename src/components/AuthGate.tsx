import type { User } from '@supabase/supabase-js'
import { Mail, ShieldCheck, Unplug, UserPlus } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { db, getSettings, markOnboarded, wipeLocalData } from '@/lib/db'
import { useOnline } from '@/lib/hooks'
import { onboardingAction, PRIVACY_VERSION } from '@/lib/onboarding'
import { CODE_SENT_MESSAGE, sendSignInCode, sendSignUpCode, SIGNUP_CODE_SENT_MESSAGE, verifySignInCode } from '@/lib/share/api'
import { getSupabase, isSharingConfigured } from '@/lib/share/supabase'
import { accountHasData, bindAccount, getMeta, hasLocalDiary, startSync } from '@/lib/sync/engine'
import { bindingAction, unusedStarterFoods } from '@/lib/sync/merge'
import { pluralise } from '@/lib/utils'
import { Button } from './ui/Button'
import { Input } from './ui/Field'
import { Onboarding } from './Onboarding'
import { Card, Segmented, Spinner } from './ui/misc'

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

type Mode = 'signup' | 'signin'

/** Sign-up and sign-in share one flow: email → one-time code. No passwords. */
function SignIn() {
  const [mode, setMode] = useState<Mode>('signup')
  const [email, setEmail] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const online = useOnline()
  const signup = mode === 'signup'
  const sentMessage = signup ? SIGNUP_CODE_SENT_MESSAGE : CODE_SENT_MESSAGE

  return (
    <Screen>
      <Card className="p-5">
        {!sent && (
          <Segmented
            className="mb-5 flex"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'signup', label: 'Create account' },
              { value: 'signin', label: 'Sign in' },
            ]}
          />
        )}
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
            {signup ? <UserPlus className="size-5" /> : <ShieldCheck className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold">{signup ? 'Create your private food diary' : 'Sign in'}</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {signup
                ? 'All we need is your email address. We send a one-time code to confirm it – no password to remember.'
                : "Enter your account's email address and we'll send a one-time code – no password needed."}
            </p>
          </div>
        </div>
        <div>
          {!sent ? (
            <form
              className="mt-4 flex flex-col gap-2.5"
              onSubmit={async (e) => {
                e.preventDefault()
                setBusy(true)
                try {
                  if (signup) await sendSignUpCode(email.trim(), PRIVACY_VERSION)
                  else await sendSignInCode(email.trim())
                  setSent(true)
                  toast(sentMessage)
                } catch (err) {
                  toast.error((err as Error).message)
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                aria-label="Email address"
              />
              {signup && <PrivacySummary agreed={agreed} onAgreedChange={setAgreed} />}
              <Button type="submit" disabled={busy || !online || (signup && !agreed)}>
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
                {sentMessage} Enter the 6-digit code for <strong>{email}</strong>. It is valid for 10 minutes.
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
          {!online && <p className="mt-2 text-xs text-warn">You're offline. Connect to {signup ? 'create an account' : 'sign in'}.</p>}
        </div>
      </Card>
    </Screen>
  )
}

function PrivacySummary({ agreed, onAgreedChange }: { agreed: boolean; onAgreedChange: (v: boolean) => void }) {
  return (
    <div className="rounded-control bg-subtle p-3.5 text-xs leading-relaxed text-ink-2">
      <p className="font-medium text-ink">How we handle your data</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-4">
        <li>Your account needs only your email address. A name is optional.</li>
        <li>
          Your diary and photos are stored on your device and synced to your own account on our server (EU). Only you can access them,
          but they are not end-to-end encrypted.
        </li>
        <li>No ads, analytics or trackers. A report is shared only when you publish a private link.</li>
        <li>You can delete your account and everything in it at any time in Settings.</li>
      </ul>
      <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          required
          checked={agreed}
          onChange={(e) => onAgreedChange(e.target.checked)}
          className="mt-0.5 size-4.5 shrink-0 accent-accent"
        />
        I agree to MealJournal storing my diary, which may include health information, as described above.
      </label>
    </div>
  )
}

function Migrate({ user, accountHasDiary, onDone }: { user: User; accountHasDiary: boolean; onDone: (moved: boolean) => void }) {
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
      onDone(move)
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
  | { name: 'onboarding'; user: User }
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

  /** Device is bound: brand-new accounts get the setup steps, everyone else goes straight in. */
  async function afterBinding(user: User, accountHadData: boolean): Promise<Phase> {
    const action = onboardingAction(accountHadData, (await getSettings()).onboarded)
    if (action === 'show') return { name: 'onboarding', user }
    if (action === 'skip') await markOnboarded()
    return { name: 'ready', user }
  }

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
        // Already bound earlier: this device is set up (or its user left onboarding half-way).
        if (action === 'ready') {
          const next = await afterBinding(user, true)
          return !cancelled && setPhase(next)
        }
        // Binding needs the server (the account may already hold a diary).
        if (!navigator.onLine) return !cancelled && setPhase({ name: 'offline', user })
        const has = await accountHasData()
        if (action === 'ask-migrate') return !cancelled && setPhase({ name: 'migrate', user, accountHasDiary: has })
        // Leftovers of another account: never mix diaries.
        if (action === 'wipe') await wipeLocalData()
        await bindAccount(user.id, false)
        const next = await afterBinding(user, has)
        if (!cancelled) setPhase(next)
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
      return (
        <Migrate
          user={phase.user}
          accountHasDiary={phase.accountHasDiary}
          onDone={(moved) => void afterBinding(phase.user, phase.accountHasDiary || moved).then(setPhase)}
        />
      )
    case 'onboarding':
      return (
        <Screen>
          <Onboarding onDone={() => setPhase({ name: 'ready', user: phase.user })} />
        </Screen>
      )
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
