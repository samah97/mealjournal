import { ArrowLeft, ArrowRight, Check, Salad, SlidersHorizontal, UserRound } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { DEFAULT_TIME_ZONE, listTimeZones } from '@/lib/datetime'
import { updateSettings } from '@/lib/db'
import { addStarterFoods } from '@/lib/starter'
import { cn } from '@/lib/utils'
import { Button } from './ui/Button'
import { Field, Input, Select } from './ui/Field'
import { Card, Spinner, Switch } from './ui/misc'

const STEPS = ['name', 'preferences', 'starter'] as const

function guessTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE
  } catch {
    return DEFAULT_TIME_ZONE
  }
}

function StepHeader({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">{icon}</span>
      <div className="min-w-0">
        <h1 className="font-semibold">{title}</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">{children}</p>
      </div>
    </div>
  )
}

/** First-run setup for a brand-new account. Every step can be skipped and changed later in Settings. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [timeZone, setTimeZone] = useState(guessTimeZone)
  const [showNutrition, setShowNutrition] = useState(false)
  const [busy, setBusy] = useState(false)
  const zones = listTimeZones(timeZone)
  const current = STEPS[step]!

  async function finish(starter: boolean) {
    setBusy(true)
    try {
      await updateSettings({ patientName: name.trim() || undefined, timeZone, showNutritionOnHome: showNutrition, onboarded: true })
      if (starter) toast.success(`Added ${await addStarterFoods()} starter foods`)
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <span key={s} className={cn('h-1.5 w-8 rounded-full transition-colors', i <= step ? 'bg-accent' : 'bg-line-strong')} />
        ))}
      </div>
      <Card className="p-5">
        {current === 'name' && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              setStep(1)
            }}
          >
            <StepHeader icon={<UserRound className="size-5" />} title="Welcome to MealJournal">
              What should we call you? Your name only appears on reports you choose to create for your dietitian.
            </StepHeader>
            <Field label="Your name" optional>
              {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />}
            </Field>
            <Button type="submit" size="lg">
              {name.trim() ? 'Continue' : 'Skip'} <ArrowRight className="size-4" />
            </Button>
          </form>
        )}

        {current === 'preferences' && (
          <div className="flex flex-col gap-4">
            <StepHeader icon={<SlidersHorizontal className="size-5" />} title="A couple of preferences">
              You can change these at any time in Settings.
            </StepHeader>
            <Field label="Time zone" hint="Entries use this zone's local date and 24-hour time.">
              {(id) => (
                <Select id={id} value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z.replace(/_/g, ' ')}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Switch
              checked={showNutrition}
              onChange={setShowNutrition}
              label="Show today's nutrition on Home"
              description="Off by default – MealJournal is a diary, not a calorie counter."
            />
            <div className="flex gap-2.5">
              <Button size="lg" variant="secondary" onClick={() => setStep(0)} aria-label="Back">
                <ArrowLeft className="size-4" />
              </Button>
              <Button size="lg" className="flex-1" onClick={() => setStep(2)}>
                Continue <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {current === 'starter' && (
          <div className="flex flex-col gap-4">
            <StepHeader icon={<Salad className="size-5" />} title="Start with a few foods?">
              We can add a handful of common foods (names and serving sizes only, no nutrition values) so logging your first meal is quicker. They are
              labelled “Starter” and you can remove them in Settings.
            </StepHeader>
            <div className="flex flex-col gap-2.5">
              <Button size="lg" disabled={busy} onClick={() => void finish(true)}>
                {busy ? <Spinner /> : <Check className="size-4" />} Add starter foods
              </Button>
              <Button size="lg" variant="secondary" disabled={busy} onClick={() => void finish(false)}>
                Start with an empty library
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setStep(1)}>
                <ArrowLeft className="size-4" /> Back
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
