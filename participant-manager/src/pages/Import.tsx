import * as React from 'react'
import { toast } from 'sonner'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  UploadCloud,
  FileSpreadsheet,
  ShieldCheck,
  Loader2,
  ScanText,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Scissors,
  CopyCheck,
  ClipboardPaste,
  FolderPlus,
  Users,
} from 'lucide-react'
import { useApp } from '@/AppContext'
import { PageHeader, EmptyState } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Label, Select, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useConfirm } from '@/components/ui/confirm'
import { cn } from '@/components/ui/utils'
import { Flag } from '@/components/Flag'
import { addParticipants, db, updateProject } from '@/lib/db'
import { resolveCountry } from '@/lib/countries'
import { displayName, duplicateKeys, issuesOf, type Issue } from '@/lib/participants'
import { buildRecords, detectHeaderRow, mapColumns, splitFullName, type ColumnMapping, type ImportRecord, type SourceTable, type Target } from '@/lib/import/mapping'
import { ACCEPT, ImportError, MAX_FILE_MB, ocrPdf, readFile, readText, type ReadResult } from '@/lib/import/readers'
import { cleanEmail, cleanLine, cleanMultiline } from '@/lib/text'
import { CORE_FIELDS, type CoreField, type ParticipantDraft } from '@/lib/types'
import type { TKey } from '@/lib/i18n'

type Step = 'upload' | 'map' | 'review' | 'done'

interface Row extends ImportRecord {
  include: boolean
  dup?: { kind: 'file' | 'existing'; name: string }
}

const STEPS: { id: Step; label: TKey }[] = [
  { id: 'upload', label: 'stepUpload' },
  { id: 'map', label: 'stepDetect' },
  { id: 'review', label: 'stepReview' },
  { id: 'done', label: 'stepConfirm' },
]

function Stepper({ step }: { step: Step }) {
  const { t } = useApp()
  const idx = STEPS.findIndex((s) => s.id === step)
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2">
          <span
            className={cn(
              'grid size-7 place-items-center rounded-full text-xs font-bold',
              i < idx ? 'bg-success text-background' : i === idx ? 'bg-accent text-background' : 'bg-muted text-muted-foreground',
            )}
          >
            {i < idx ? <CheckCircle2 className="size-4" /> : i + 1}
          </span>
          <span className={cn('font-semibold', i === idx ? 'text-foreground' : 'text-muted-foreground')}>{t(s.label)}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
        </li>
      ))}
    </ol>
  )
}

const EDIT_FIELDS: CoreField[] = ['country', 'firstName', 'lastName', 'fullName', 'jobTitle', 'organisation', 'department', 'email', 'phone', 'whatsapp', 'notes']

const ISSUE_FIELD: Partial<Record<Issue, CoreField[]>> = {
  noName: ['firstName', 'lastName', 'fullName'],
  noCountry: ['country'],
  unknownCountry: ['country'],
  badEmail: ['email'],
  noEmail: ['email'],
  noPhone: ['phone'],
  badPhone: ['phone'],
  badWhatsapp: ['whatsapp'],
}

export default function ImportPage() {
  const { t, projects, activeProject, setActiveProjectId, navigate } = useApp()
  const confirm = useConfirm()
  const [step, setStep] = React.useState<Step>('upload')
  const [projectId, setProjectId] = React.useState<string>(activeProject?.id ?? '')
  const [busy, setBusy] = React.useState<string>('')
  const [error, setError] = React.useState<string>('')
  const [dragging, setDragging] = React.useState(false)
  const [pasted, setPasted] = React.useState('')
  const [fileName, setFileName] = React.useState('')
  const [result, setResult] = React.useState<ReadResult | null>(null)
  const [tableIdx, setTableIdx] = React.useState(0)
  const [headerRow, setHeaderRow] = React.useState(-1)
  const [mapping, setMapping] = React.useState<ColumnMapping[]>([])
  const [rows, setRows] = React.useState<Row[]>([])
  const [freeText, setFreeText] = React.useState(false)
  const [ocrLangs, setOcrLangs] = React.useState<string[]>(['eng', 'spa', 'fra'])
  const [ocr, setOcr] = React.useState<string>('')
  const [onlyIssues, setOnlyIssues] = React.useState(false)
  const [savedCount, setSavedCount] = React.useState(0)
  const fileInput = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!projectId && activeProject) setProjectId(activeProject.id)
  }, [activeProject, projectId])

  const existing = useLiveQuery(() => (projectId ? db.participants.where('projectId').equals(projectId).toArray() : []), [projectId])
  const targetProject = projects?.find((p) => p.id === projectId)

  const reset = () => {
    setStep('upload')
    setResult(null)
    setRows([])
    setMapping([])
    setError('')
    setFileName('')
    setPasted('')
    setFreeText(false)
    setOcr('')
  }

  // ---------- step 1: read ----------
  const errorText = (e: unknown) => {
    if (e instanceof ImportError) {
      if (e.code === 'tooBig') return t('fileTooBig', { mb: MAX_FILE_MB })
      if (e.code === 'unsupported') return t('fileTypeUnsupported')
      if (e.code === 'signature') return t('fileSignatureMismatch')
      if (e.code === 'empty') return t('noRecordsFound')
      return t('extractFailed', { msg: e.message })
    }
    return t('extractFailed', { msg: e instanceof Error ? e.message : String(e) })
  }

  const handleResult = (r: ReadResult) => {
    setResult(r)
    if (r.kind === 'scanned') return
    if (r.kind === 'text') {
      if (!r.records.length) {
        setError(t('noRecordsFound'))
        return
      }
      setFreeText(true)
      prepareReview(r.records)
      return
    }
    setFreeText(false)
    // choose the table/sheet with the most detected records
    let best = 0
    let bestCount = -1
    r.tables.forEach((tb, i) => {
      const h = detectHeaderRow(tb.rows)
      const n = buildRecords(tb, h, mapColumns(tb.rows, h)).length
      if (n > bestCount) {
        best = i
        bestCount = n
      }
    })
    selectTable(r.tables, best)
    setStep('map')
  }

  const selectTable = (tables: SourceTable[], i: number) => {
    setTableIdx(i)
    const h = detectHeaderRow(tables[i].rows)
    setHeaderRow(h)
    setMapping(mapColumns(tables[i].rows, h))
  }

  const onFile = async (file: File) => {
    reset()
    setFileName(file.name)
    setBusy(t('reading', { name: file.name }))
    try {
      handleResult(await readFile(file))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy('')
    }
  }

  const onPaste = () => {
    reset()
    setFileName('—')
    try {
      handleResult(readText(pasted, 'paste'))
    } catch (e) {
      setError(errorText(e))
    }
  }

  const runOcr = async () => {
    if (result?.kind !== 'scanned') return
    setError('')
    try {
      const r = await ocrPdf(
        result.data,
        ocrLangs.length ? ocrLangs : ['eng'],
        (p) => setOcr(p.stage === 'loading' ? t('ocrLoading') : t('ocrProgress', { page: p.page, pages: p.pages, pct: p.pct })),
        fileName,
      )
      setOcr('')
      if (r.kind === 'tables') {
        setFreeText(true)
        setResult(r)
        selectTable(r.tables, 0)
        setStep('map')
      } else if (r.kind === 'text') {
        setFreeText(true)
        if (!r.records.length) setError(t('noRecordsFound'))
        else prepareReview(r.records)
      }
    } catch (e) {
      setOcr('')
      setError(errorText(e))
    }
  }

  // ---------- step 2 -> 3 ----------
  const table = result?.kind === 'tables' ? result.tables[tableIdx] : null
  const records = React.useMemo(() => (table ? buildRecords(table, headerRow, mapping) : []), [table, headerRow, mapping])

  const prepareReview = (recs: ImportRecord[]) => {
    setRows(markDuplicates(recs.map((r) => ({ ...r, include: true }))))
    setStep('review')
  }

  const markDuplicates = React.useCallback(
    (list: Row[]): Row[] => {
      const existingKeys = new Map<string, string>()
      for (const p of existing ?? []) for (const k of duplicateKeys(p)) existingKeys.set(k.key, displayName(p) || p.email)
      const seen = new Map<string, string>()
      return list.map((r) => {
        const keys = duplicateKeys(r.draft)
        const ex = keys.find((k) => existingKeys.has(k.key))
        const prevDup = r.dup
        let dup: Row['dup']
        if (ex) dup = { kind: 'existing', name: existingKeys.get(ex.key)! }
        else {
          const f = keys.find((k) => seen.has(k.key))
          if (f) dup = { kind: 'file', name: seen.get(f.key)! }
        }
        for (const k of keys) if (!seen.has(k.key)) seen.set(k.key, displayName(r.draft) || r.draft.email)
        // newly detected duplicates start unselected; the user's later choice is kept
        const include = dup && !prevDup ? false : r.include
        return { ...r, dup, include }
      })
    },
    [existing],
  )

  const setTarget = (index: number, target: Target) =>
    setMapping((m) =>
      m.map((c) => {
        if (c.index === index) return { ...c, target, confidence: 'high' }
        // a core field can only come from one column
        if (target !== 'ignore' && !target.startsWith('custom:') && c.target === target) return { ...c, target: 'ignore' }
        return c
      }),
    )

  // ---------- step 3: editing ----------
  const updateRow = (key: string, field: CoreField, value: string) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r
        const draft: ParticipantDraft = { ...r.draft }
        if (field === 'country') {
          draft.countryRaw = value
          draft.country = resolveCountry(value)
        } else (draft as unknown as Record<string, string>)[field] = value
        return { ...r, draft, lowConfidence: r.lowConfidence.filter((f) => f !== field) }
      }),
    )
  const recheckDuplicates = () => setRows((rs) => markDuplicates(rs))

  const splitNames = () => {
    let n = 0
    setRows((rs) =>
      rs.map((r) => {
        if (!r.draft.fullName || r.draft.firstName || r.draft.lastName) return r
        const s = splitFullName(r.draft.fullName)
        if (!s) return r
        n++
        return { ...r, draft: { ...r.draft, ...s, fullName: '' } }
      }),
    )
    setTimeout(() => toast.success(t('splitDone', { n })), 0)
  }

  const customTargets = [...new Set(rows.flatMap((r) => Object.keys(r.draft.custom)))]
  const issuesByRow = React.useMemo(() => new Map(rows.map((r) => [r.key, issuesOf(r.draft)])), [rows])
  const visibleRows = onlyIssues ? rows.filter((r) => (issuesByRow.get(r.key) ?? []).length || r.dup || r.lowConfidence.length) : rows
  const selectedCount = rows.filter((r) => r.include).length
  const issueCount = rows.filter((r) => (issuesByRow.get(r.key) ?? []).some((i) => i !== 'noOrganisation')).length

  const save = async () => {
    if (!projectId || !targetProject) return
    const chosen = rows.filter((r) => r.include)
    const ok = await confirm({
      title: t('confirmImportTitle', { n: chosen.length }),
      description: t('confirmImportText', { project: targetProject.name }),
      confirmLabel: t('saveSelected', { n: chosen.length }),
      cancelLabel: t('cancel'),
    })
    if (!ok) return
    const drafts = chosen.map((r) => ({
      ...r.draft,
      firstName: cleanLine(r.draft.firstName),
      lastName: cleanLine(r.draft.lastName),
      fullName: cleanLine(r.draft.fullName),
      jobTitle: cleanLine(r.draft.jobTitle),
      organisation: cleanLine(r.draft.organisation),
      department: cleanLine(r.draft.department),
      email: cleanEmail(r.draft.email),
      phone: cleanLine(r.draft.phone, 120),
      whatsapp: cleanLine(r.draft.whatsapp, 120),
      notes: cleanMultiline(r.draft.notes),
      countryRaw: cleanLine(r.draft.countryRaw),
    }))
    await addParticipants(projectId, drafts)
    const newCustom = customTargets.filter((c) => !targetProject.customFields.includes(c))
    if (newCustom.length) await updateProject(projectId, { customFields: [...targetProject.customFields, ...newCustom] })
    setActiveProjectId(projectId)
    setSavedCount(drafts.length)
    setStep('done')
    toast.success(t('imported', { n: drafts.length }))
  }

  // ---------- render ----------
  if (!projects?.length)
    return (
      <EmptyState icon={FolderPlus} title={t('noProjectsTitle')} text={t('noProjectsText')}>
        <Button onClick={() => navigate('projects')}>{t('newProject')}</Button>
      </EmptyState>
    )

  const fieldLabel = (f: string) => t(`f_${f}` as TKey)
  const confTone = { high: 'success', medium: 'warning', low: 'danger' } as const
  const confLabel = { high: t('confHigh'), medium: t('confMedium'), low: t('confLow') }

  return (
    <div>
      <PageHeader title={t('importTitle')} subtitle={t('importSubtitle')} />
      <Stepper step={step} />

      {step === 'upload' && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="grid gap-4">
            <div className="grid max-w-md gap-1.5">
              <Label htmlFor="import-project">{t('importInto')}</Label>
              <Select id="import-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects
                  .filter((p) => !p.archived)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div
              role="button"
              tabIndex={0}
              aria-label={t('orChoose')}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                const f = e.dataTransfer.files?.[0]
                if (f) onFile(f)
              }}
              className={cn(
                'panel-glow grid cursor-pointer place-items-center gap-3 border-2 border-dashed px-6 py-14 text-center transition',
                dragging && 'border-accent bg-accent/10',
              )}
            >
              {busy ? <Loader2 className="size-12 animate-spin text-accent" /> : <UploadCloud className="size-12 text-accent" />}
              <div className="text-lg font-semibold">{busy || t('dropHere')}</div>
              {!busy && (
                <Button variant="outline" tabIndex={-1}>
                  <FileSpreadsheet /> {t('orChoose')}
                </Button>
              )}
              <p className="text-sm text-muted-foreground">{t('acceptedFormats', { mb: MAX_FILE_MB })}</p>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPT}
                className="hidden"
                data-testid="import-file"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) onFile(f)
                }}
              />
            </div>
            {error && (
              <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
                <p>{error}</p>
              </div>
            )}
            {result?.kind === 'scanned' && (
              <div className="panel grid gap-3 p-5">
                <h2 className="flex items-center gap-2 font-semibold">
                  <ScanText className="size-5 text-accent" /> {t('scannedPdf')}
                </h2>
                <p className="text-sm text-muted-foreground">{t('scannedPdfHelp')}</p>
                <fieldset className="flex flex-wrap items-center gap-4 text-sm">
                  <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('ocrLangs')}</legend>
                  {[
                    ['eng', 'English'],
                    ['spa', 'Español'],
                    ['fra', 'Français'],
                  ].map(([code, label]) => (
                    <label key={code} className="flex items-center gap-2">
                      <Checkbox
                        checked={ocrLangs.includes(code)}
                        onCheckedChange={(v) => setOcrLangs((l) => (v ? [...l, code] : l.filter((x) => x !== code)))}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={runOcr} disabled={!!ocr || !ocrLangs.length}>
                    {ocr ? <Loader2 className="animate-spin" /> : <ScanText />} {t('runOcr')}
                  </Button>
                  {ocr && <span className="text-sm text-muted-foreground">{ocr}</span>}
                </div>
              </div>
            )}
          </div>
          <div className="grid content-start gap-4">
            <div className="flex items-start gap-3 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" />
              <p>{t('privacyImport')}</p>
            </div>
            <div className="panel grid gap-3 p-4">
              <Label htmlFor="paste-area" className="flex items-center gap-2">
                <ClipboardPaste className="size-4" /> {t('pasteInstead')}
              </Label>
              <Textarea id="paste-area" rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={t('pastePlaceholder')} />
              <div>
                <Button variant="outline" disabled={!pasted.trim()} onClick={onPaste}>
                  {t('usePasted')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'map' && result?.kind === 'tables' && table && (
        <div className="grid gap-4">
          <div className="panel flex flex-wrap items-end gap-4 p-4">
            <div className="grid gap-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{fileName}</span>
              <span className="text-lg font-bold">{t('recordsDetected', { n: records.length })}</span>
              <span className="text-muted-foreground">
                {headerRow >= 0 ? t('headerRowDetected', { n: headerRow + 1 }) : t('noHeaderDetected')}
              </span>
            </div>
            {result.tables.length > 1 && (
              <div className="grid gap-1.5">
                <Label htmlFor="map-sheet">{result.fromText ? t('table') : t('sheet')}</Label>
                <Select id="map-sheet" value={tableIdx} onChange={(e) => selectTable(result.tables, Number(e.target.value))}>
                  {result.tables.map((tb, i) => (
                    <option key={i} value={i}>
                      {tb.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="map-header">{t('headerRow')}</Label>
              <Select
                id="map-header"
                value={headerRow}
                onChange={(e) => {
                  const h = Number(e.target.value)
                  setHeaderRow(h)
                  setMapping(mapColumns(table.rows, h))
                }}
              >
                <option value={-1}>{t('none')}</option>
                {table.rows.slice(0, 25).map((r, i) => (
                  <option key={i} value={i}>
                    {i + 1}: {r.filter(Boolean).slice(0, 4).join(' | ').slice(0, 60)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {freeText && (
            <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-bg p-4 text-sm">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
              <p>{t('ocrLowQuality')}</p>
            </div>
          )}
          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t('sourceColumn')}</th>
                  <th className="px-4 py-3 font-semibold">{t('sample')}</th>
                  <th className="px-4 py-3 font-semibold">{t('mapsTo')}</th>
                  <th className="px-4 py-3 font-semibold">{t('confidence')}</th>
                </tr>
              </thead>
              <tbody>
                {mapping.map((c, i) => (
                  <tr key={c.index} className={i % 2 ? 'bg-row-alt' : ''}>
                    <td className="px-4 py-2.5 font-semibold">{c.header}</td>
                    <td className="max-w-80 px-4 py-2.5 text-muted-foreground">
                      <div className="truncate">{c.samples.join(' · ') || '—'}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Select
                        aria-label={`${t('mapsTo')}: ${c.header}`}
                        data-testid={`map-${c.index}`}
                        className="min-w-56"
                        value={c.target}
                        onChange={(e) => setTarget(c.index, e.target.value as Target)}
                      >
                        <option value="ignore">{t('ignoreColumn')}</option>
                        {CORE_FIELDS.map((f) => (
                          <option key={f} value={f}>
                            {fieldLabel(f)}
                          </option>
                        ))}
                        <option value={`custom:${c.header}`}>{t('asCustomField', { name: c.header })}</option>
                      </Select>
                    </td>
                    <td className="px-4 py-2.5">
                      {c.target !== 'ignore' && <Badge tone={confTone[c.confidence]}>{confLabel[c.confidence]}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="outline" onClick={reset}>
              <ArrowLeft /> {t('back')}
            </Button>
            <Button onClick={() => prepareReview(records)} disabled={!records.length}>
              {t('next')} <ArrowRight />
            </Button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="grid gap-4">
          <div className="panel flex flex-wrap items-center gap-3 p-4 text-sm">
            <span className="text-lg font-bold">{t('rowsSelected', { n: selectedCount, total: rows.length })}</span>
            {issueCount > 0 && (
              <Badge tone="warning">
                <AlertTriangle /> {t('summaryIssues', { n: issueCount })}
              </Badge>
            )}
            {rows.some((r) => r.dup) && (
              <Badge tone="danger">
                <CopyCheck /> {t('dupSkipHint')}
              </Badge>
            )}
            <label className="ml-auto flex items-center gap-2">
              <Switch checked={onlyIssues} onCheckedChange={setOnlyIssues} aria-label={t('onlyIssues')} />
              {t('onlyIssues')}
            </label>
            {rows.some((r) => r.draft.fullName && !r.draft.firstName && !r.draft.lastName) && (
              <Button size="sm" variant="outline" onClick={splitNames} title={t('splitNamesHelp')}>
                <Scissors /> {t('splitNames')}
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{t('reviewHelp')}</p>
          {freeText && (
            <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-bg p-4 text-sm">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
              <p>{t('freeTextNotice')}</p>
            </div>
          )}
          <div className="panel max-h-[65dvh] overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-sm" data-testid="review-table">
              <thead className="sticky top-0 z-10 bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="border-b border-border px-2 py-2">
                    <Checkbox
                      aria-label={t('include')}
                      checked={rows.every((r) => r.include) ? true : rows.some((r) => r.include) ? 'indeterminate' : false}
                      onCheckedChange={(v) => setRows((rs) => rs.map((r) => ({ ...r, include: v === true })))}
                    />
                  </th>
                  <th className="border-b border-border px-2 py-2 font-semibold">#</th>
                  {EDIT_FIELDS.map((f) => (
                    <th key={f} className="whitespace-nowrap border-b border-border px-2 py-2 font-semibold">
                      {fieldLabel(f)}
                    </th>
                  ))}
                  {customTargets.map((c) => (
                    <th key={c} className="whitespace-nowrap border-b border-border px-2 py-2 font-semibold">
                      {c}
                    </th>
                  ))}
                  <th className="border-b border-border px-2 py-2 font-semibold">{t('duplicates')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, i) => {
                  const issues = issuesByRow.get(r.key) ?? []
                  const bad = new Set(issues.flatMap((is) => ISSUE_FIELD[is] ?? []))
                  const nameMissing = issues.includes('noName')
                  return (
                    <tr key={r.key} className={cn(i % 2 && 'bg-row-alt', !r.include && 'opacity-50')}>
                      <td className="border-b border-border/60 px-2 py-1">
                        <Checkbox
                          aria-label={`${t('include')} ${r.sourceRow}`}
                          checked={r.include}
                          onCheckedChange={(v) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, include: v === true } : x)))}
                        />
                      </td>
                      <td className="border-b border-border/60 px-2 py-1 text-xs text-muted-foreground">{r.sourceRow}</td>
                      {EDIT_FIELDS.map((f) => {
                        const value = f === 'country' ? r.draft.countryRaw : (r.draft[f] as string)
                        const flagged =
                          (bad.has(f) && !(nameMissing && f !== 'fullName' && f !== 'firstName' && f !== 'lastName') && !(f === 'phone' && r.draft.whatsapp && !r.draft.phone)) ||
                          r.lowConfidence.includes(f)
                        const issueTitle = issues
                          .filter((is) => (ISSUE_FIELD[is] ?? []).includes(f))
                          .map((is) => t(`i_${is}` as TKey))
                          .join(', ')
                        return (
                          <td key={f} className="border-b border-border/60 px-1 py-1">
                            <div className="flex items-center gap-1">
                              {f === 'country' && <Flag code={r.draft.country} className="w-5" />}
                              <Input
                                aria-label={`${fieldLabel(f)} ${r.sourceRow}`}
                                title={issueTitle || undefined}
                                value={value}
                                onChange={(e) => updateRow(r.key, f, e.target.value)}
                                onBlur={recheckDuplicates}
                                className={cn(
                                  'h-8 px-2 text-[13px]',
                                  f === 'notes' || f === 'organisation' ? 'min-w-52' : f === 'email' ? 'min-w-56' : 'min-w-32',
                                  (f === 'phone' || f === 'whatsapp') && 'font-mono',
                                  flagged && 'border-warning bg-warning-bg',
                                )}
                              />
                            </div>
                          </td>
                        )
                      })}
                      {customTargets.map((c) => (
                        <td key={c} className="border-b border-border/60 px-1 py-1">
                          <Input
                            aria-label={`${c} ${r.sourceRow}`}
                            value={r.draft.custom[c] ?? ''}
                            onChange={(e) =>
                              setRows((rs) =>
                                rs.map((x) => (x.key === r.key ? { ...x, draft: { ...x.draft, custom: { ...x.draft.custom, [c]: e.target.value } } } : x)),
                              )
                            }
                            className="h-8 min-w-32 px-2 text-[13px]"
                          />
                        </td>
                      ))}
                      <td className="border-b border-border/60 px-2 py-1">
                        {r.dup && (
                          <Badge tone="danger" className="max-w-56 truncate" title={r.dup.name}>
                            {r.dup.kind === 'existing' ? t('dupExisting', { name: r.dup.name }) : t('dupInFile')}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="outline" onClick={() => (result?.kind === 'tables' ? setStep('map') : reset())}>
              <ArrowLeft /> {t('back')}
            </Button>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {t('importInto')}: <b className="text-foreground">{targetProject?.name}</b>
              </span>
              <Button variant="cta" disabled={!selectedCount} onClick={save}>
                <CheckCircle2 /> {t('saveSelected', { n: selectedCount })}
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 'done' && (
        <EmptyState icon={CheckCircle2} title={t('imported', { n: savedCount })} text={targetProject?.name}>
          <Button
            onClick={() => {
              navigate('participants')
            }}
          >
            <Users /> {t('goToDirectory')}
          </Button>
          <Button variant="outline" onClick={reset}>
            <UploadCloud /> {t('importAnother')}
          </Button>
        </EmptyState>
      )}
    </div>
  )
}
