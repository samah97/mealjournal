import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowRight,
  Database,
  Download,
  FileText,
  HardDrive,
  Link2,
  Lock,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/confirm'
import { Field, Input, Select } from '@/components/ui/Field'
import { Card, PageHeader, SectionTitle, Spinner, Switch } from '@/components/ui/misc'
import { backupFilename, backupStats, createBackup, parseBackup, restoreBackup } from '@/lib/backup'
import { db, updateSettings } from '@/lib/db'
import { useSettings } from '@/lib/hooks'
import { useInstallPrompt } from '@/lib/install'
import { deleteAllData } from '@/lib/repo'
import { getSupabase, isSharingConfigured } from '@/lib/share/supabase'
import { addStarterFoods, removeStarterFoods } from '@/lib/starter'
import { downloadBlob, formatBytes, pluralise } from '@/lib/utils'

function Row({ icon, title, description, children }: { icon: ReactNode; title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-subtle text-ink-2">{icon}</span>
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-medium">{title}</p>
          {description && <div className="mt-0.5 text-xs leading-relaxed text-muted">{description}</div>}
        </div>
      </div>
      {children && <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">{children}</div>}
    </div>
  )
}

function useStorageInfo() {
  const [info, setInfo] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({})
  useEffect(() => {
    void (async () => {
      const est = await navigator.storage?.estimate?.()
      const persisted = await navigator.storage?.persisted?.()
      setInfo({ usage: est?.usage, quota: est?.quota, persisted })
    })()
  }, [])
  return info
}

export function SettingsPage() {
  const settings = useSettings()
  const confirm = useConfirm()
  const { canInstall, install, installed } = useInstallPrompt()
  const storage = useStorageInfo()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const counts = useLiveQuery(
    async () => ({
      entries: await db.entries.count(),
      foods: await db.foods.count(),
      meals: await db.mealTemplates.count(),
      photos: await db.photos.count(),
      examples: await db.foods.filter((f) => !!f.isExample).count(),
    }),
    [],
  )
  const zones = (() => {
    try {
      return Intl.supportedValuesOf('timeZone')
    } catch {
      return [settings.timeZone]
    }
  })()

  async function exportBackup() {
    try {
      setBusy('Exporting…')
      const b = await createBackup((d, t) => setBusy(`Packing photos ${d}/${t}…`))
      downloadBlob(new Blob([JSON.stringify(b)], { type: 'application/json' }), backupFilename())
      toast.success('Backup downloaded – keep it somewhere safe and private.')
    } catch (e) {
      toast.error(`Backup failed: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  async function importBackup(file: File) {
    try {
      const backup = parseBackup(await file.text())
      const s = backupStats(backup)
      const ok = await confirm({
        title: 'Restore this backup?',
        message: `This replaces everything on this device with the backup from ${new Date(backup.exportedAt).toLocaleString('en-GB')}: ${pluralise(s.entries, 'entry', 'entries')}, ${pluralise(s.foods, 'food')}, ${pluralise(s.mealTemplates, 'meal')} and ${pluralise(s.photos, 'photo')}.`,
        confirmLabel: 'Replace & restore',
        danger: true,
      })
      if (!ok) return
      setBusy('Restoring…')
      await restoreBackup(backup)
      toast.success('Backup restored')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function wipe() {
    const ok = await confirm({
      title: 'Delete all data on this device?',
      message:
        'Every diary entry, food, meal, photo and setting on this device will be permanently deleted. Shared links stay online until you revoke them – revoke them first if needed. Consider exporting a backup first.',
      confirmLabel: 'Delete everything',
      danger: true,
    })
    if (!ok) return
    const sure = await confirm({ title: 'Are you absolutely sure?', message: 'This cannot be undone.', confirmLabel: 'Yes, delete', danger: true })
    if (!sure) return
    await deleteAllData()
    if (isSharingConfigured()) await getSupabase().then((sb) => sb.auth.signOut()).catch(() => {})
    toast.success('All data deleted')
  }

  return (
    <div>
      <PageHeader title="Settings" large />

      <SectionTitle>Diary</SectionTitle>
      <Card className="flex flex-col gap-4 p-4">
        <Field label="Time zone" hint="Entries use this zone's local date and 24-hour time.">
          {(id) => (
            <Select id={id} value={settings.timeZone} onChange={(e) => void updateSettings({ timeZone: e.target.value })}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Your name" optional hint="Used on reports for your dietitian.">
          {(id) => (
            <Input id={id} defaultValue={settings.patientName ?? ''} key={settings.patientName} onBlur={(e) => void updateSettings({ patientName: e.target.value.trim() || undefined })} autoComplete="name" />
          )}
        </Field>
        <Switch
          checked={settings.showNutritionOnHome}
          onChange={(v) => void updateSettings({ showNutritionOnHome: v })}
          label="Show today's nutrition on Home"
          description="Off by default – MealJournal is a diary, not a calorie counter."
        />
      </Card>

      <SectionTitle>Reports & sharing</SectionTitle>
      <Card className="divide-y divide-line/70">
        <Link to="/report" className="block">
          <Row icon={<FileText className="size-4.5" />} title="PDF report" description="Create a printable report for any period.">
            <ArrowRight className="size-4.5 text-muted" />
          </Row>
        </Link>
        <Link to="/sharing" className="block">
          <Row
            icon={<Link2 className="size-4.5" />}
            title="Shared links"
            description={isSharingConfigured() ? 'Create, view and revoke private links.' : 'Requires backend configuration (see README).'}
          >
            <ArrowRight className="size-4.5 text-muted" />
          </Row>
        </Link>
      </Card>

      <SectionTitle>App</SectionTitle>
      <Card className="divide-y divide-line/70">
        <Row
          icon={<Smartphone className="size-4.5" />}
          title={installed ? 'Installed on this device' : 'Install MealJournal'}
          description={
            installed
              ? 'You are using the installed app.'
              : canInstall
                ? 'Add MealJournal to your home screen for a full-screen, app-like experience.'
                : 'In Chrome or Samsung Internet, open the browser menu and choose “Add to Home screen” or “Install app”.'
          }
        >
          {canInstall && !installed && <Button size="sm" onClick={() => void install()}>Install</Button>}
        </Row>
        <Row
          icon={<HardDrive className="size-4.5" />}
          title="Storage on this device"
          description={
            <>
              {counts && `${pluralise(counts.entries, 'entry', 'entries')}, ${pluralise(counts.foods, 'food')}, ${pluralise(counts.meals, 'meal')}, ${pluralise(counts.photos, 'photo')}. `}
              {storage.usage !== undefined && `Using ${formatBytes(storage.usage)}. `}
              {storage.persisted === true
                ? 'Persistent storage is granted – the browser will not clear your data automatically.'
                : storage.persisted === false
                  ? 'Persistent storage not yet granted; installing the app usually grants it. Keep regular backups.'
                  : ''}
            </>
          }
        />
      </Card>

      <SectionTitle>Backup</SectionTitle>
      <Card className="divide-y divide-line/70">
        <Row
          icon={<Database className="size-4.5" />}
          title="Backup & restore"
          description="A complete JSON file including photos. Restoring replaces all data on this device."
        >
          <Button size="sm" variant="secondary" onClick={() => void exportBackup()} disabled={!!busy}>
            {busy ? <Spinner /> : <Download className="size-4" />} {busy ?? 'Export'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={!!busy}>
            <Upload className="size-4" /> Restore
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importBackup(f)
              e.target.value = ''
            }}
          />
        </Row>
        <Row
          icon={<Sparkles className="size-4.5" />}
          title="Starter foods"
          description={
            counts?.examples
              ? `${pluralise(counts.examples, 'starter food')} in your library, labelled “Starter”. Editing one makes it yours.`
              : 'Common Mediterranean foods with typical serving units – no nutritional values.'
          }
        >
          {counts?.examples ? (
            <Button size="sm" variant="secondary" onClick={async () => toast.success(`Removed ${await removeStarterFoods()} starter foods`)}>
              Remove
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={async () => toast.success(`Added ${await addStarterFoods()} starter foods`)}>
              Add
            </Button>
          )}
        </Row>
      </Card>

      <SectionTitle>Privacy</SectionTitle>
      <Card className="p-4">
        <div className="flex gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
            <Lock className="size-4.5" />
          </span>
          <div className="space-y-2 text-sm leading-relaxed text-ink-2">
            <p>Your diary and photos are stored only in this browser on this device. There are no ads, analytics or trackers, and photos are never analysed or uploaded automatically.</p>
            <p>Data leaves this device only when you explicitly publish a private link – and then only the report you selected.</p>
          </div>
        </div>
      </Card>

      <SectionTitle>Danger zone</SectionTitle>
      <Card className="p-4">
        <Button variant="danger-soft" block onClick={() => void wipe()}>
          <Trash2 className="size-4" /> Delete all data on this device
        </Button>
      </Card>

      <p className="mt-8 text-center text-xs text-muted">MealJournal {__APP_VERSION__}</p>
    </div>
  )
}
