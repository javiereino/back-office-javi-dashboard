import * as React from 'react'
import { toast } from 'sonner'
import {
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  ArrowDownAZ,
  ArrowUpZA,
  Columns3,
  Rows3,
  Rows4,
  CopyCheck,
  Trash2,
  FolderInput,
  Copy,
  UserPlus,
  X,
  AlertTriangle,
  Users,
  FileUp,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react'
import { useApp } from '@/AppContext'
import { useIgnoredDuplicates, useParticipants, useStats } from '@/hooks/useProjectData'
import { PageHeader, EmptyState } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Menu, MenuCheckItem, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '@/components/ui/dropdown'
import { useConfirm } from '@/components/ui/confirm'
import { cn } from '@/components/ui/utils'
import { Flag } from '@/components/Flag'
import { ContactActions, ContactButtons } from '@/components/ContactActions'
import { ParticipantDialog } from '@/components/ParticipantDialog'
import { DuplicatesDialog } from '@/components/DuplicatesDialog'
import { copyParticipants, deleteParticipants, moveParticipants } from '@/lib/db'
import { countryGroupKey } from '@/lib/countries'
import {
  displayName,
  groupByCountry,
  hasEmail,
  hasPhone,
  isIncomplete,
  makeComparator,
  searchText,
} from '@/lib/participants'
import { fold, initials, safeFileName } from '@/lib/text'
import { participantsToVCards } from '@/lib/vcard'
import { downloadText } from '@/lib/download'
import type { Participant } from '@/lib/types'
import type { TKey } from '@/lib/i18n'

type ContactFilter = 'any' | 'missingEmail' | 'missingPhone' | 'missingBoth' | 'incomplete'

const OPTIONAL_COLUMNS = ['jobTitle', 'organisation', 'department', 'email', 'phone', 'whatsapp', 'notes'] as const

function Missing({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning">
      <AlertTriangle className="size-3" />
      {label}
    </span>
  )
}

export default function Participants() {
  const { t, lang, activeProject, projects, density, setDensity, hiddenColumns, setHiddenColumns, navigate } = useApp()
  const confirm = useConfirm()
  const projectId = activeProject?.id ?? null
  const list = useParticipants(projectId)
  const ignored = useIgnoredDuplicates(projectId)
  const stats = useStats(list, ignored)

  const [query, setQuery] = React.useState('')
  const [country, setCountry] = React.useState('')
  const [org, setOrg] = React.useState('')
  const [contact, setContact] = React.useState<ContactFilter>('any')
  const [dir, setDir] = React.useState<'asc' | 'desc'>('asc')
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set())
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [editing, setEditing] = React.useState<Participant | undefined>()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [dupOpen, setDupOpen] = React.useState(false)

  React.useEffect(() => {
    setSelected(new Set())
    setCountry('')
    setOrg('')
  }, [projectId])

  const customFields = activeProject?.customFields ?? []
  const visibleCols = OPTIONAL_COLUMNS.filter((c) => !hiddenColumns.includes(c))
  const visibleCustom = customFields.filter((c) => !hiddenColumns.includes('custom:' + c))

  const index = React.useMemo(() => new Map((list ?? []).map((p) => [p.id, searchText(p, lang)])), [list, lang])

  const countryOptions = React.useMemo(() => {
    const groups = groupByCountry([...(list ?? [])].sort(makeComparator(lang)), lang)
    return groups.map((g) => ({ key: g.key, code: g.code, label: g.label || t('noCountry'), n: g.items.length }))
  }, [list, lang, t])

  const orgOptions = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const p of list ?? []) if (p.organisation) m.set(p.organisation.trim().toLowerCase(), p.organisation.trim())
    const coll = new Intl.Collator(lang, { sensitivity: 'base' })
    return [...m.entries()].sort((a, b) => coll.compare(a[1], b[1]))
  }, [list, lang])

  const filtered = React.useMemo(() => {
    if (!list) return []
    const terms = fold(query).split(' ').filter(Boolean)
    return list
      .filter((p) => {
        if (terms.length && !terms.every((term) => index.get(p.id)?.includes(term))) return false
        if (country && countryGroupKey(p) !== country) return false
        if (org && p.organisation.trim().toLowerCase() !== org) return false
        if (contact === 'missingEmail' && hasEmail(p)) return false
        if (contact === 'missingPhone' && hasPhone(p)) return false
        if (contact === 'missingBoth' && (hasEmail(p) || hasPhone(p))) return false
        if (contact === 'incomplete' && !isIncomplete(p)) return false
        return true
      })
      .sort(makeComparator(lang, dir))
  }, [list, query, country, org, contact, dir, lang, index])

  const groups = React.useMemo(() => groupByCountry(filtered, lang), [filtered, lang])

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const setMany = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const n = new Set(s)
      for (const id of ids) {
        if (on) n.add(id)
        else n.delete(id)
      }
      return n
    })
  const allIds = filtered.map((p) => p.id)
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id))
  const someChecked = allIds.some((id) => selected.has(id))

  const openNew = () => {
    setEditing(undefined)
    setDialogOpen(true)
  }
  const openEdit = (p: Participant) => {
    setEditing(p)
    setDialogOpen(true)
  }
  const removeOne = async (p: Participant) => {
    const ok = await confirm({
      title: t('deleteParticipantTitle', { name: displayName(p) || p.email || '—' }),
      description: t('deleteParticipantText'),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      destructive: true,
    })
    if (ok) {
      await deleteParticipants([p.id])
      toast.success(t('deleted'))
    }
  }
  const removeSelected = async () => {
    const ids = [...selected]
    const ok = await confirm({
      title: t('deleteParticipantsTitle', { n: ids.length }),
      description: t('deleteParticipantText'),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      destructive: true,
    })
    if (ok) {
      await deleteParticipants(ids)
      setSelected(new Set())
      toast.success(t('deleted'))
    }
  }
  const moveTo = async (target: string, mode: 'move' | 'copy') => {
    const ids = [...selected]
    if (mode === 'move') {
      await moveParticipants(ids, target)
      toast.success(t('moved', { n: ids.length }))
    } else {
      await copyParticipants(ids, target)
      toast.success(t('copiedTo', { n: ids.length }))
    }
    setSelected(new Set())
  }
  const exportSelectedVcf = () => {
    const rows = (list ?? []).filter((p) => selected.has(p.id))
    downloadText(participantsToVCards(rows, activeProject?.name), `${safeFileName(activeProject?.name ?? 'contacts')}-contacts.vcf`, 'text/vcard;charset=utf-8')
    toast.success(t('vcfDownloaded'))
  }

  if (!activeProject)
    return (
      <EmptyState icon={Users} title={t('noProjectsTitle')} text={t('noProjectsText')}>
        <Button onClick={() => navigate('projects')}>
          <Plus /> {t('newProject')}
        </Button>
      </EmptyState>
    )

  const otherProjects = (projects ?? []).filter((p) => p.id !== projectId && !p.archived)
  const compact = density === 'compact'
  const cell = compact ? 'px-3 py-1.5' : 'px-3 py-3'
  const colLabel = (c: string): string => (c.startsWith('custom:') ? c.slice(7) : t(`f_${c}` as TKey))

  return (
    <div>
      <PageHeader
        title={t('participantsTitle')}
        subtitle={
          <>
            <span className="font-semibold text-foreground">{activeProject.name}</span>
            {list && ` · ${t('showingOf', { shown: filtered.length, total: list.length })}`}
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setDupOpen(true)}>
              <CopyCheck /> {t('duplicates')}
              {!!stats?.duplicateGroups.length && (
                <span className="rounded-full bg-warning px-1.5 text-xs text-background">{stats.duplicateGroups.length}</span>
              )}
            </Button>
            <Button variant="cta" onClick={openNew}>
              <Plus /> {t('addParticipant')}
            </Button>
          </>
        }
      />

      {/* Filters */}
      <div className="panel mb-4 grid gap-3 p-3 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="participant-search"
            type="search"
            className="pl-9"
            placeholder={t('searchPlaceholder')}
            aria-label={t('search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select aria-label={t('f_country')} value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">{t('allCountries')}</option>
          {countryOptions.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label} ({c.n})
            </option>
          ))}
        </Select>
        <Select aria-label={t('f_organisation')} value={org} onChange={(e) => setOrg(e.target.value)}>
          <option value="">{t('allOrganisations')}</option>
          {orgOptions.map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select aria-label={t('contactFilter')} value={contact} onChange={(e) => setContact(e.target.value as ContactFilter)}>
          <option value="any">
            {t('contactFilter')}: {t('filterAny')}
          </option>
          <option value="missingEmail">{t('filterMissingEmail')}</option>
          <option value="missingPhone">{t('filterMissingPhone')}</option>
          <option value="missingBoth">{t('filterMissingBoth')}</option>
          <option value="incomplete">{t('filterIncomplete')}</option>
        </Select>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDir(dir === 'asc' ? 'desc' : 'asc')}
            aria-label={dir === 'asc' ? t('sortDesc') : t('sortAsc')}
            title={dir === 'asc' ? t('sortAsc') : t('sortDesc')}
          >
            {dir === 'asc' ? <ArrowDownAZ /> : <ArrowUpZA />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(groups.map((g) => g.key)))}
            aria-label={collapsed.size ? t('expandAll') : t('collapseAll')}
            title={collapsed.size ? t('expandAll') : t('collapseAll')}
          >
            {collapsed.size ? <ChevronsUpDown /> : <ChevronsDownUp />}
          </Button>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label={t('columns')} title={t('columns')} className="hidden md:inline-flex">
                <Columns3 />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuLabel>{t('columns')}</MenuLabel>
              {[...OPTIONAL_COLUMNS, ...customFields.map((c) => 'custom:' + c)].map((c) => (
                <MenuCheckItem
                  key={c}
                  checked={!hiddenColumns.includes(c)}
                  onCheckedChange={(on) => setHiddenColumns(on ? hiddenColumns.filter((x) => x !== c) : [...hiddenColumns, c])}
                >
                  {colLabel(c)}
                </MenuCheckItem>
              ))}
            </MenuContent>
          </Menu>
          <Button
            variant="outline"
            size="icon"
            className="hidden md:inline-flex"
            onClick={() => setDensity(compact ? 'comfortable' : 'compact')}
            aria-label={`${t('density')}: ${compact ? t('densityComfortable') : t('densityCompact')}`}
            title={`${t('density')}: ${compact ? t('densityCompact') : t('densityComfortable')}`}
          >
            {compact ? <Rows4 /> : <Rows3 />}
          </Button>
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="panel-glow sticky top-[62px] z-20 mb-3 flex flex-wrap items-center gap-2 p-2.5">
          <span className="px-2 text-sm font-semibold">{t('selected', { n: selected.size })}</span>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            <X /> {t('clearSelection')}
          </Button>
          <div className="ml-auto flex flex-wrap gap-2">
            <Menu>
              <MenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={!otherProjects.length}>
                  <FolderInput /> {t('bulkMove')}
                </Button>
              </MenuTrigger>
              <MenuContent>
                {otherProjects.map((p) => (
                  <MenuItem key={p.id} onSelect={() => moveTo(p.id, 'move')}>
                    {p.name}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
            <Menu>
              <MenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={!otherProjects.length}>
                  <Copy /> {t('bulkCopy')}
                </Button>
              </MenuTrigger>
              <MenuContent>
                {otherProjects.map((p) => (
                  <MenuItem key={p.id} onSelect={() => moveTo(p.id, 'copy')}>
                    {p.name}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
            <Button size="sm" variant="outline" onClick={exportSelectedVcf}>
              <UserPlus /> {t('bulkVcf')}
            </Button>
            <Button size="sm" variant="destructive" onClick={removeSelected}>
              <Trash2 /> {t('bulkDelete')}
            </Button>
          </div>
        </div>
      )}

      {list && list.length === 0 ? (
        <EmptyState icon={Users} title={t('emptyProjectTitle')} text={t('emptyProjectText')}>
          <Button variant="cta" onClick={() => navigate('import')}>
            <FileUp /> {t('importParticipants')}
          </Button>
          <Button variant="outline" onClick={openNew}>
            <Plus /> {t('addParticipant')}
          </Button>
        </EmptyState>
      ) : list && filtered.length === 0 ? (
        <EmptyState icon={Search} title={t('noResults')}>
          <Button
            variant="outline"
            onClick={() => {
              setQuery('')
              setCountry('')
              setOrg('')
              setContact('any')
            }}
          >
            {t('clearFilters')}
          </Button>
        </EmptyState>
      ) : (
        <>
          {/* Desktop table */}
          <div className="panel hidden overflow-x-auto md:block">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className={cn('w-10 border-b border-border', cell)}>
                    <Checkbox
                      aria-label={t('all')}
                      checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                      onCheckedChange={(v) => setMany(allIds, v === true)}
                    />
                  </th>
                  <th className={cn('border-b border-border font-semibold', cell)}>{t('f_name')}</th>
                  {visibleCols.map((c) => (
                    <th key={c} className={cn('border-b border-border font-semibold', cell)}>
                      {colLabel(c)}
                    </th>
                  ))}
                  {visibleCustom.map((c) => (
                    <th key={c} className={cn('border-b border-border font-semibold', cell)}>
                      {c}
                    </th>
                  ))}
                  <th className={cn('border-b border-border', cell)}>
                    <span className="sr-only">{t('actMore')}</span>
                  </th>
                </tr>
              </thead>
              {groups.map((g) => {
                const ids = g.items.map((p) => p.id)
                const gAll = ids.every((id) => selected.has(id))
                const gSome = ids.some((id) => selected.has(id))
                const isCollapsed = collapsed.has(g.key)
                return (
                  <tbody key={g.key || 'none'}>
                    <tr className="bg-group">
                      <td className={cn('border-b border-border', cell)}>
                        <Checkbox
                          aria-label={g.label || t('noCountry')}
                          checked={gAll ? true : gSome ? 'indeterminate' : false}
                          onCheckedChange={(v) => setMany(ids, v === true)}
                        />
                      </td>
                      <td colSpan={2 + visibleCols.length + visibleCustom.length} className="border-b border-border px-3 py-2">
                        <button
                          className="flex w-full items-center gap-3 text-left"
                          aria-expanded={!isCollapsed}
                          onClick={() =>
                            setCollapsed((s) => {
                              const n = new Set(s)
                              if (n.has(g.key)) n.delete(g.key)
                              else n.add(g.key)
                              return n
                            })
                          }
                        >
                          {isCollapsed ? <ChevronRight className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                          <Flag code={g.code} />
                          <span className="text-[13px] font-bold uppercase tracking-wider">{g.label || t('noCountry')}</span>
                          {!g.code && g.label && <AlertTriangle className="size-3.5 text-warning" aria-label={t('i_unknownCountry')} />}
                          <span className="rounded-full bg-accent/15 px-2 text-xs font-semibold text-accent">{g.items.length}</span>
                        </button>
                      </td>
                    </tr>
                    {!isCollapsed &&
                      g.items.map((p, i) => (
                        <tr
                          key={p.id}
                          className={cn(
                            'group transition-colors hover:bg-accent/[0.06]',
                            i % 2 === 1 && 'bg-row-alt',
                            selected.has(p.id) && 'bg-accent/10',
                          )}
                        >
                          <td className={cn('border-b border-border/60', cell)}>
                            <Checkbox aria-label={displayName(p)} checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                          </td>
                          <td className={cn('border-b border-border/60', cell)}>
                            <button className="text-left font-semibold hover:text-accent hover:underline" onClick={() => openEdit(p)}>
                              {displayName(p) || <span className="italic text-muted-foreground">—</span>}
                            </button>
                            {hiddenColumns.includes('jobTitle') && p.jobTitle && (
                              <div className="text-xs text-muted-foreground">{p.jobTitle}</div>
                            )}
                          </td>
                          {visibleCols.map((c) => (
                            <td key={c} className={cn('max-w-64 border-b border-border/60 align-middle', c === 'organisation' && 'min-w-44', cell)}>
                              {c === 'email' ? (
                                p.email ? (
                                  <span className="whitespace-nowrap">{p.email}</span>
                                ) : (
                                  <Missing label={t('i_noEmail')} />
                                )
                              ) : c === 'phone' ? (
                                p.phone ? (
                                  <span className="whitespace-nowrap font-mono text-[13px]">{p.phone}</span>
                                ) : !p.whatsapp ? (
                                  <Missing label={t('i_noPhone')} />
                                ) : null
                              ) : c === 'whatsapp' ? (
                                <span className="whitespace-nowrap font-mono text-[13px]">{p.whatsapp}</span>
                              ) : c === 'notes' ? (
                                <span className="line-clamp-2 text-muted-foreground">{p.notes}</span>
                              ) : (
                                <span className={c === 'organisation' ? '' : 'text-muted-foreground'}>{p[c]}</span>
                              )}
                            </td>
                          ))}
                          {visibleCustom.map((c) => (
                            <td key={c} className={cn('border-b border-border/60 text-muted-foreground', cell)}>
                              {p.custom?.[c]}
                            </td>
                          ))}
                          <td className={cn('border-b border-border/60', compact ? 'px-2 py-0.5' : 'px-2 py-1.5')}>
                            <ContactActions p={p} compact={compact} onEdit={() => openEdit(p)} onDelete={() => removeOne(p)} />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                )
              })}
            </table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-5 md:hidden">
            {groups.map((g) => {
              const isCollapsed = collapsed.has(g.key)
              return (
                <section key={g.key || 'none'} className="grid gap-2">
                  <button
                    className="flex items-center gap-2 px-1 text-left text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"
                    aria-expanded={!isCollapsed}
                    onClick={() =>
                      setCollapsed((s) => {
                        const n = new Set(s)
                        if (n.has(g.key)) n.delete(g.key)
                        else n.add(g.key)
                        return n
                      })
                    }
                  >
                    <Flag code={g.code} />
                    {g.label || t('noCountry')}
                    <span className="ml-auto font-semibold normal-case tracking-normal">{g.items.length}</span>
                    {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                  </button>
                  {!isCollapsed &&
                    g.items.map((p) => (
                      <article key={p.id} className={cn('panel grid gap-3 p-3.5', selected.has(p.id) && 'ring-2 ring-accent')}>
                        <div className="flex items-start gap-3">
                          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-sm font-bold text-accent">
                            {initials(displayName(p)) || '?'}
                          </div>
                          <button className="min-w-0 flex-1 text-left" onClick={() => openEdit(p)}>
                            <div className="font-bold leading-tight">{displayName(p) || '—'}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {[p.jobTitle, p.organisation].filter(Boolean).join(' · ')}
                            </div>
                            {(!hasEmail(p) || !hasPhone(p)) && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {!hasEmail(p) && <Missing label={t('i_noEmail')} />}
                                {!hasPhone(p) && <Missing label={t('i_noPhone')} />}
                              </div>
                            )}
                          </button>
                          <Checkbox aria-label={displayName(p)} checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} className="mt-1 size-5" />
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="flex-1">
                            <ContactButtons p={p} />
                          </div>
                          <ContactActions p={p} menuOnly onEdit={() => openEdit(p)} onDelete={() => removeOne(p)} />
                        </div>
                      </article>
                    ))}
                </section>
              )
            })}
          </div>
        </>
      )}

      {projectId && (
        <>
          <ParticipantDialog open={dialogOpen} onOpenChange={setDialogOpen} participant={editing} projectId={projectId} />
          <DuplicatesDialog
            open={dupOpen}
            onOpenChange={setDupOpen}
            groups={stats?.duplicateGroups ?? []}
            participants={list ?? []}
            projectId={projectId}
          />
        </>
      )}
    </div>
  )
}
