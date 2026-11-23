import * as React from 'react'
import { toast } from 'sonner'
import { useLiveQuery } from 'dexie-react-hooks'
import { HardDrive, ShieldCheck, Palette, Trash2, Sparkles, Eraser, Info, CheckCircle2, AlertTriangle, Smartphone } from 'lucide-react'
import { useApp } from '@/AppContext'
import { PageHeader } from '@/components/PageHeader'
import { StorageWarning } from '@/components/StorageWarning'
import { Button } from '@/components/ui/button'
import { Label, Select } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm'
import { clearAllData, db, setMeta } from '@/lib/db'
import { loadDemoData, removeDemoData } from '@/lib/seed'

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(1)} GB`
}

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <section className="panel grid gap-4 p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Icon className="size-5 text-accent" /> {title}
      </h2>
      {children}
    </section>
  )
}

export default function SettingsPage() {
  const { t, lang, setLang, theme, setTheme, density, setDensity, setActiveProjectId } = useApp()
  const confirm = useConfirm()
  const [estimate, setEstimate] = React.useState<{ usage?: number; quota?: number }>({})
  const [persisted, setPersisted] = React.useState<boolean | null>(null)
  const [swReady, setSwReady] = React.useState(false)
  const hasDemo = useLiveQuery(() => db.projects.filter((p) => !!p.demo).count(), []) ?? 0

  const refresh = React.useCallback(async () => {
    try {
      setEstimate(await navigator.storage.estimate())
      setPersisted(await navigator.storage.persisted())
    } catch {
      setPersisted(null)
    }
  }, [])
  React.useEffect(() => {
    refresh()
    navigator.serviceWorker?.getRegistration().then((r) => setSwReady(!!r?.active))
  }, [refresh])

  const requestPersist = async () => {
    const ok = await navigator.storage?.persist?.()
    if (!ok) toast.warning(t('persistDenied'))
    refresh()
  }

  const deleteWord = lang === 'es' ? 'BORRAR' : 'DELETE'

  return (
    <div className="grid gap-5">
      <PageHeader title={t('settingsTitle')} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Section icon={Palette} title={t('appearance')}>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="set-lang">{t('language')}</Label>
              <Select id="set-lang" value={lang} onChange={(e) => setLang(e.target.value as 'en' | 'es')}>
                <option value="en">English</option>
                <option value="es">Español</option>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="set-theme">{t('theme')}</Label>
              <Select id="set-theme" value={theme} onChange={(e) => setTheme(e.target.value as 'dark' | 'light')}>
                <option value="dark">{t('themeDark')}</option>
                <option value="light">{t('themeLight')}</option>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="set-density">{t('defaultDensity')}</Label>
              <Select id="set-density" value={density} onChange={(e) => setDensity(e.target.value as 'comfortable' | 'compact')}>
                <option value="comfortable">{t('densityComfortable')}</option>
                <option value="compact">{t('densityCompact')}</option>
              </Select>
            </div>
          </div>
        </Section>

        <Section icon={HardDrive} title={t('storage')}>
          <StorageWarning />
          {estimate.usage !== undefined && estimate.quota !== undefined && (
            <p className="text-sm">{t('storageUsage', { used: fmtBytes(estimate.usage), quota: fmtBytes(estimate.quota) })}</p>
          )}
          {persisted !== null && (
            <p className="flex items-start gap-2 text-sm">
              {persisted ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />}
              {persisted ? t('storagePersisted') : t('storageNotPersisted')}
            </p>
          )}
          {persisted === false && (
            <div>
              <Button variant="outline" onClick={requestPersist}>
                {t('requestPersist')}
              </Button>
            </div>
          )}
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Smartphone className="mt-0.5 size-4 shrink-0" /> {t('installHint')}
          </p>
        </Section>

        <Section icon={ShieldCheck} title={t('privacy')}>
          <ul className="grid gap-2 text-sm">
            {(['privacy1', 'privacy2', 'privacy3', 'privacy5', 'privacy4'] as const).map((k) => (
              <li key={k} className="flex items-start gap-2">
                {k === 'privacy4' ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                ) : (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                )}
                {t(k)}
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={Trash2} title={t('dangerZone')}>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                const id = await loadDemoData()
                setActiveProjectId(id)
                toast.success(t('demoLoaded'))
              }}
            >
              <Sparkles /> {t('loadDemo')}
            </Button>
            {hasDemo > 0 && (
              <Button
                variant="outline"
                onClick={async () => {
                  await removeDemoData()
                  toast.success(t('demoRemoved'))
                }}
              >
                <Eraser /> {t('removeDemo')}
              </Button>
            )}
            <Button variant="outline" onClick={() => setMeta('welcomeSeen', false)}>
              <Info /> {t('showWelcome')}
            </Button>
          </div>
          <div>
            <Button
              variant="destructive"
              onClick={async () => {
                const ok = await confirm({
                  title: t('deleteAllTitle'),
                  description: t('deleteAllText'),
                  confirmLabel: t('deleteAll'),
                  cancelLabel: t('cancel'),
                  destructive: true,
                  typeToConfirm: deleteWord,
                  typeToConfirmLabel: t('typeDelete'),
                })
                if (!ok) return
                await clearAllData()
                await setMeta('welcomeSeen', true)
                setActiveProjectId(null)
                toast.success(t('allDeleted'))
              }}
            >
              <Trash2 /> {t('deleteAll')}
            </Button>
          </div>
        </Section>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('version')} {__APP_VERSION__}
        {swReady && ` · ${t('offlineReady')}`}
      </p>
    </div>
  )
}
