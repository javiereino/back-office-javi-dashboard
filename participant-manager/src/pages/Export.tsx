import * as React from 'react'
import { toast } from 'sonner'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileSpreadsheet, FileText, FileType2, Globe, Contact, DatabaseBackup, Upload, Loader2, Lock, ShieldCheck, AlertTriangle, HardDriveDownload } from 'lucide-react'
import { useApp } from '@/AppContext'
import { PageHeader } from '@/components/PageHeader'
import { StorageWarning } from '@/components/StorageWarning'
import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useConfirm } from '@/components/ui/confirm'
import { cn } from '@/components/ui/utils'
import { flagUrl } from '@/components/Flag'
import { useParticipants } from '@/hooks/useProjectData'
import { getMeta } from '@/lib/db'
import { downloadBlob, downloadText, todayStamp } from '@/lib/download'
import { safeFileName } from '@/lib/text'
import { participantsToVCards } from '@/lib/vcard'
import { buildCsv, buildXlsx } from '@/lib/export/spreadsheet'
import { buildPdf } from '@/lib/export/pdf'
import { buildHtmlPayload, buildStandaloneHtml } from '@/lib/export/html'
import { backupBlob, BackupError, decryptBackup, parseBackupText, restoreBackup, type Backup } from '@/lib/export/backup'
import { WrongPasswordError, type EncryptedEnvelope } from '@/lib/export/crypto'

function PasswordFields({ id, enabled, setEnabled, pw, setPw, pw2, setPw2 }: {
  id: string
  enabled: boolean
  setEnabled: (v: boolean) => void
  pw: string
  setPw: (v: string) => void
  pw2: string
  setPw2: (v: string) => void
}) {
  const { t } = useApp()
  return (
    <div className="grid gap-3">
      <label className="flex items-center gap-2 text-sm font-semibold">
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={t('protectWithPassword')} />
        <Lock className="size-4 text-accent" /> {t('protectWithPassword')}
      </label>
      {enabled && (
        <div className="grid gap-3 rounded-xl border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-pw`}>{t('password')}</Label>
              <Input id={`${id}-pw`} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-pw2`}>{t('passwordRepeat')}</Label>
              <Input id={`${id}-pw2`} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t('passwordHelp')}</p>
          {pw && pw.length < 8 && <p className="text-xs font-semibold text-warning">{t('passwordShort')}</p>}
          {pw2 && pw !== pw2 && <p className="text-xs font-semibold text-destructive">{t('passwordMismatch')}</p>}
        </div>
      )}
    </div>
  )
}

const pwOk = (enabled: boolean, pw: string, pw2: string) => !enabled || (pw.length >= 8 && pw === pw2)

export default function ExportPage() {
  const { t, lang, projects, activeProject } = useApp()
  const confirm = useConfirm()
  const [projectId, setProjectId] = React.useState(activeProject?.id ?? '')
  const project = projects?.find((p) => p.id === projectId) ?? activeProject
  const list = useParticipants(project?.id ?? null)
  const [busy, setBusy] = React.useState('')
  const [htmlPw, setHtmlPw] = React.useState({ on: false, a: '', b: '' })
  const [bkPw, setBkPw] = React.useState({ on: false, a: '', b: '' })
  const lastBackup = useLiveQuery(() => getMeta<number>('lastBackupAt'), [])

  // restore state
  const [restoreFile, setRestoreFile] = React.useState('')
  const [envelope, setEnvelope] = React.useState<EncryptedEnvelope | null>(null)
  const [restorePw, setRestorePw] = React.useState('')
  const [parsed, setParsed] = React.useState<{ backup: Backup; skipped: number } | null>(null)
  const [mode, setMode] = React.useState<'merge' | 'replace'>('merge')
  const [restoreError, setRestoreError] = React.useState('')

  React.useEffect(() => {
    if (!projectId && activeProject) setProjectId(activeProject.id)
  }, [activeProject, projectId])

  const base = project ? `${safeFileName(project.name)}-${todayStamp()}` : 'participants'

  const run = async (kind: string, fn: () => Promise<void>) => {
    setBusy(kind)
    try {
      await fn()
    } catch (e) {
      toast.error(t('errorGeneric', { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      setBusy('')
    }
  }
  const done = (name: string) => toast.success(t('exportDone', { name }))

  const exports = [
    {
      key: 'xlsx',
      icon: FileSpreadsheet,
      title: t('exportExcel'),
      text: t('exportExcelText'),
      color: 'text-success',
      action: () => run('xlsx', async () => {
        const name = `${base}.xlsx`
        downloadBlob(await buildXlsx(project!, list!, lang), name)
        done(name)
      }),
    },
    {
      key: 'csv',
      icon: FileText,
      title: t('exportCsv'),
      text: t('exportCsvText'),
      color: 'text-[#8fb4ff]',
      action: () => run('csv', async () => {
        const name = `${base}.csv`
        downloadBlob(buildCsv(project!, list!, lang), name)
        done(name)
      }),
    },
    {
      key: 'pdf',
      icon: FileType2,
      title: t('exportPdf'),
      text: t('exportPdfText'),
      color: 'text-destructive',
      action: () => run('pdf', async () => {
        const name = `${base}.pdf`
        downloadBlob(await buildPdf(project!, list!, lang), name)
        done(name)
      }),
    },
    {
      key: 'vcf',
      icon: Contact,
      title: t('exportVcf'),
      text: t('exportVcfText'),
      color: 'text-accent',
      action: () => run('vcf', async () => {
        const name = `${base}.vcf`
        downloadText(participantsToVCards(list!, project!.name), name, 'text/vcard;charset=utf-8')
        done(name)
      }),
    },
  ]

  const exportHtml = () =>
    run('html', async () => {
      const payload = await buildHtmlPayload(project!, list!, lang, flagUrl)
      const html = await buildStandaloneHtml(payload, htmlPw.on ? htmlPw.a : undefined)
      const name = `${base}.html`
      downloadText(html, name, 'text/html;charset=utf-8')
      done(name)
    })

  const backup = () =>
    run('backup', async () => {
      const name = `participant-manager-backup-${todayStamp()}${bkPw.on ? '-encrypted' : ''}.json`
      downloadBlob(await backupBlob(bkPw.on ? bkPw.a : undefined), name)
      done(name)
    })

  const onRestoreFile = async (file: File) => {
    setRestoreError('')
    setParsed(null)
    setEnvelope(null)
    setRestorePw('')
    setRestoreFile(file.name)
    if (file.size > 100 * 1024 * 1024) return setRestoreError(t('restoreInvalid', { msg: 'size' }))
    try {
      const res = parseBackupText(await file.text())
      if (res.encrypted) setEnvelope(res.envelope)
      else setParsed(res)
    } catch (e) {
      setRestoreError(t('restoreInvalid', { msg: e instanceof BackupError ? e.message : String(e) }))
    }
  }
  const unlock = () =>
    run('unlock', async () => {
      try {
        setParsed(await decryptBackup(envelope!, restorePw))
        setRestoreError('')
      } catch (e) {
        setRestoreError(e instanceof WrongPasswordError ? t('wrongPassword') : t('restoreInvalid', { msg: e instanceof Error ? e.message : String(e) }))
      }
    })
  const doRestore = async () => {
    if (!parsed) return
    if (mode === 'replace') {
      const ok = await confirm({
        title: t('restoreReplace'),
        description: t('restoreReplaceWarn'),
        confirmLabel: t('restore'),
        cancelLabel: t('cancel'),
        destructive: true,
      })
      if (!ok) return
    }
    await run('restore', async () => {
      await restoreBackup(parsed.backup, mode)
      toast.success(t('restoreDone', { projects: parsed.backup.projects.length, participants: parsed.backup.participants.length }))
      setParsed(null)
      setEnvelope(null)
      setRestoreFile('')
    })
  }

  const noData = !project || !list || list.length === 0

  return (
    <div className="grid gap-6">
      <PageHeader title={t('exportTitle')} subtitle={t('exportSubtitle')} />
      <StorageWarning />

      <section className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('exportDirectory')}</h2>
          <div className="grid min-w-64 gap-1.5">
            <Label htmlFor="export-project">{t('exportScope')}</Label>
            <Select id="export-project" value={project?.id ?? ''} onChange={(e) => setProjectId(e.target.value)}>
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {list && p.id === project?.id ? `(${list.length})` : ''}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {exports.map((x) => (
            <div key={x.key} className="panel flex flex-col gap-3 p-5">
              <x.icon className={cn('size-8', x.color)} />
              <div>
                <h3 className="font-semibold">{x.title}</h3>
                <p className="text-sm text-muted-foreground">{x.text}</p>
              </div>
              <Button className="mt-auto" variant="outline" disabled={noData || !!busy} onClick={x.action}>
                {busy === x.key ? <Loader2 className="animate-spin" /> : <HardDriveDownload />} {x.title}
              </Button>
            </div>
          ))}
        </div>
        <div className="panel-glow grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="flex gap-4">
            <Globe className="size-9 shrink-0 text-accent" />
            <div>
              <h3 className="text-lg font-semibold">{t('exportHtml')}</h3>
              <p className="text-sm text-muted-foreground">{t('exportHtmlText')}</p>
            </div>
          </div>
          <div className="grid gap-3">
            <PasswordFields
              id="html"
              enabled={htmlPw.on}
              setEnabled={(on) => setHtmlPw((s) => ({ ...s, on }))}
              pw={htmlPw.a}
              setPw={(a) => setHtmlPw((s) => ({ ...s, a }))}
              pw2={htmlPw.b}
              setPw2={(b) => setHtmlPw((s) => ({ ...s, b }))}
            />
            <div>
              <Button variant="cta" disabled={noData || !!busy || !pwOk(htmlPw.on, htmlPw.a, htmlPw.b)} onClick={exportHtml}>
                {busy === 'html' ? <Loader2 className="animate-spin" /> : <Globe />} {t('exportHtml')}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="panel grid content-start gap-4 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <DatabaseBackup className="size-5 text-accent" /> {t('backupTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('backupText')}</p>
          {lastBackup ? (
            <p className="flex items-center gap-2 text-sm">
              <ShieldCheck className="size-4 text-success" />
              {t('lastBackupAt', { when: new Date(lastBackup).toLocaleString(lang) })}
            </p>
          ) : null}
          <PasswordFields
            id="bk"
            enabled={bkPw.on}
            setEnabled={(on) => setBkPw((s) => ({ ...s, on }))}
            pw={bkPw.a}
            setPw={(a) => setBkPw((s) => ({ ...s, a }))}
            pw2={bkPw.b}
            setPw2={(b) => setBkPw((s) => ({ ...s, b }))}
          />
          <div>
            <Button disabled={!!busy || !pwOk(bkPw.on, bkPw.a, bkPw.b)} onClick={backup}>
              {busy === 'backup' ? <Loader2 className="animate-spin" /> : <HardDriveDownload />} {t('backupDownload')}
            </Button>
          </div>
        </div>

        <div className="panel grid content-start gap-4 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Upload className="size-5 text-accent" /> {t('restoreTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('restoreText')}</p>
          <div>
            <Button variant="outline" asChild>
              <label className="cursor-pointer">
                <Upload /> {t('chooseBackup')}
                <input
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  data-testid="restore-file"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) onRestoreFile(f)
                  }}
                />
              </label>
            </Button>
            {restoreFile && <span className="ml-3 text-sm text-muted-foreground">{restoreFile}</span>}
          </div>
          {restoreError && (
            <p role="alert" className="flex items-start gap-2 text-sm font-semibold text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {restoreError}
            </p>
          )}
          {envelope && !parsed && (
            <form
              className="grid gap-2 rounded-xl border border-border p-3"
              onSubmit={(e) => {
                e.preventDefault()
                unlock()
              }}
            >
              <Label htmlFor="restore-pw">{t('restoreNeedsPassword')}</Label>
              <div className="flex gap-2">
                <Input id="restore-pw" type="password" autoComplete="current-password" value={restorePw} onChange={(e) => setRestorePw(e.target.value)} />
                <Button type="submit" disabled={!restorePw || !!busy}>
                  {busy === 'unlock' ? <Loader2 className="animate-spin" /> : <Lock />} {t('open')}
                </Button>
              </div>
            </form>
          )}
          {parsed && (
            <div className="grid gap-3">
              <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                {t('restoreSummary', {
                  date: parsed.backup.exportedAt ? new Date(parsed.backup.exportedAt).toLocaleString(lang) : '—',
                  projects: parsed.backup.projects.length,
                  participants: parsed.backup.participants.length,
                })}
              </p>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-semibold">{t('restoreMode')}</legend>
                {(['merge', 'replace'] as const).map((m) => (
                  <label
                    key={m}
                    className={cn('flex cursor-pointer gap-3 rounded-xl border p-3', mode === m ? 'border-accent bg-accent/10' : 'border-border')}
                  >
                    <input type="radio" name="restore-mode" checked={mode === m} onChange={() => setMode(m)} className="mt-1 accent-[var(--accent)]" />
                    <span>
                      <span className="block font-semibold">{m === 'merge' ? t('restoreMerge') : t('restoreReplace')}</span>
                      <span className="block text-sm text-muted-foreground">{m === 'merge' ? t('restoreMergeText') : t('restoreReplaceText')}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div>
                <Button variant={mode === 'replace' ? 'destructive' : 'default'} disabled={!!busy} onClick={doRestore}>
                  {busy === 'restore' ? <Loader2 className="animate-spin" /> : <DatabaseBackup />} {t('restore')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
