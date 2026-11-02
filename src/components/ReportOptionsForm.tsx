import { useEffect, useState } from 'react'
import { addDays, diffDays } from '@/lib/datetime'
import type { ReportOptions } from '@/lib/types'
import { Field, FormSection, Input } from './ui/Field'
import { Chip, Switch } from './ui/misc'

export interface ReportConfig {
  start: string
  end: string
  title: string
  patientName: string
  options: ReportOptions
}

const PRESETS = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '14', label: 'Last 14 days', days: 14 },
  { id: '30', label: 'Last 30 days', days: 30 },
]

export function defaultConfig(today: string, options: ReportOptions, patientName?: string): ReportConfig {
  return { start: addDays(today, -6), end: today, title: 'Food Diary', patientName: patientName ?? '', options: { ...options } }
}

export function ReportOptionsForm({
  value,
  onChange,
  today,
}: {
  value: ReportConfig
  onChange: (c: ReportConfig) => void
  today: string
}) {
  const set = (patch: Partial<ReportConfig>) => onChange({ ...value, ...patch })
  const setOpt = (patch: Partial<ReportOptions>) => onChange({ ...value, options: { ...value.options, ...patch } })
  const [preset, setPreset] = useState<string | null>('7')

  useEffect(() => {
    const match = PRESETS.find((p) => value.end === today && value.start === addDays(today, -(p.days - 1)))
    setPreset(match?.id ?? null)
  }, [value.start, value.end, today])

  const tooLong = diffDays(value.start, value.end) > 366
  const invalid = value.end < value.start

  return (
    <div className="flex flex-col gap-4">
      <FormSection title="Period">
        <div className="-mx-1 flex flex-wrap gap-2 px-1">
          {PRESETS.map((p) => (
            <Chip key={p.id} active={preset === p.id} onClick={() => set({ start: addDays(today, -(p.days - 1)), end: today })}>
              {p.label}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">{(id) => <Input id={id} type="date" value={value.start} max={value.end} onChange={(e) => set({ start: e.target.value })} />}</Field>
          <Field label="To">{(id) => <Input id={id} type="date" value={value.end} min={value.start} onChange={(e) => set({ end: e.target.value })} />}</Field>
        </div>
        {(invalid || tooLong) && (
          <p className="text-xs text-danger">{invalid ? 'The end date must be after the start date.' : 'Please choose a period of at most one year.'}</p>
        )}
      </FormSection>

      <FormSection title="Include" description="Only what you switch on is placed in the report.">
        <Switch checked={value.options.includePhotos} onChange={(v) => setOpt({ includePhotos: v })} label="Photos" />
        <Switch checked={value.options.includeIngredients} onChange={(v) => setOpt({ includeIngredients: v })} label="Ingredients & quantities" />
        <Switch checked={value.options.includeNotes} onChange={(v) => setOpt({ includeNotes: v })} label="Descriptions & notes" />
        <Switch checked={value.options.includeNutrition} onChange={(v) => setOpt({ includeNutrition: v })} label="Nutrition per entry" />
        <Switch
          checked={value.options.includeSummaries}
          onChange={(v) => setOpt({ includeSummaries: v })}
          label="Daily totals & meal breakdowns"
          description="Nutrition summed per day and per ingredient, with incomplete data clearly marked."
        />
      </FormSection>

      <FormSection title="Report details">
        <Field label="Title">{(id) => <Input id={id} value={value.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} />}</Field>
        <Field label="Your name" optional hint="Shown on the report so your dietitian knows whose diary it is.">
          {(id) => <Input id={id} value={value.patientName} onChange={(e) => set({ patientName: e.target.value })} autoComplete="name" maxLength={120} />}
        </Field>
      </FormSection>
    </div>
  )
}

export function configValid(c: ReportConfig): boolean {
  return c.end >= c.start && diffDays(c.start, c.end) <= 366
}
