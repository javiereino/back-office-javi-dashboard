import * as React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Users,
  Globe2,
  Landmark,
  Mail,
  Phone,
  AlertTriangle,
  CopyCheck,
  FileUp,
  Plus,
  MapPin,
  CalendarDays,
  HardDriveDownload,
  FolderPlus,
} from 'lucide-react'
import { useApp } from '@/AppContext'
import { useIgnoredDuplicates, useParticipants, useStats } from '@/hooks/useProjectData'
import { EmptyState } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Flag } from '@/components/Flag'
import { ParticipantDialog } from '@/components/ParticipantDialog'
import { getMeta } from '@/lib/db'
import { groupByCountry, hasEmail, hasPhone, makeComparator } from '@/lib/participants'
import { cn } from '@/components/ui/utils'

function Stat({
  icon: Icon,
  value,
  label,
  tone = 'accent',
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  value: number | string
  label: string
  tone?: 'accent' | 'green' | 'blue' | 'warning'
  onClick?: () => void
}) {
  const color = {
    accent: 'text-accent',
    green: 'text-success',
    blue: 'text-[#4d9bff]',
    warning: 'text-warning',
  }[tone]
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp onClick={onClick} className={cn('panel-glow flex items-center gap-3 p-4 text-left', onClick && 'transition hover:brightness-110')}>
      <Icon className={cn('size-8 shrink-0', color)} />
      <div className="min-w-0">
        <div className="tabular text-2xl font-bold leading-none">{value}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{label}</div>
      </div>
    </Comp>
  )
}

function formatDateRange(start: string, end: string, lang: string) {
  const fmt = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })
  if (start && end) return `${fmt(start)} – ${fmt(end)}`
  return start ? fmt(start) : end ? fmt(end) : ''
}

export default function Dashboard() {
  const { t, lang, activeProject, navigate } = useApp()
  const list = useParticipants(activeProject?.id ?? null)
  const ignored = useIgnoredDuplicates(activeProject?.id ?? null)
  const stats = useStats(list, ignored)
  const lastBackup = useLiveQuery(() => getMeta<number>('lastBackupAt'), [])
  const [adding, setAdding] = React.useState(false)

  const groups = React.useMemo(() => (list ? groupByCountry([...list].sort(makeComparator(lang)), lang) : []), [list, lang])
  const byCount = React.useMemo(() => [...groups].sort((a, b) => b.items.length - a.items.length), [groups])

  if (!activeProject)
    return (
      <EmptyState icon={FolderPlus} title={t('noProjectsTitle')} text={t('noProjectsText')}>
        <Button onClick={() => navigate('projects')}>
          <Plus /> {t('newProject')}
        </Button>
      </EmptyState>
    )

  const top = byCount.slice(0, 12)
  const rest = byCount.slice(12).reduce((n, g) => n + g.items.length, 0)
  const max = Math.max(1, ...top.map((g) => g.items.length), rest)
  const dates = formatDateRange(activeProject.startDate, activeProject.endDate, lang)
  const backupStale = !lastBackup || Date.now() - lastBackup > 7 * 864e5

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{t('dashSubtitle')}</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-balance sm:text-[28px]">{activeProject.name}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {activeProject.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4" /> {activeProject.location}
              </span>
            )}
            {dates && (
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4" /> {dates}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setAdding(true)}>
            <Plus /> {t('addParticipant')}
          </Button>
          <Button variant="cta" size="lg" onClick={() => navigate('import')}>
            <FileUp /> {t('importParticipants')}
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          <Stat icon={Users} value={stats.total} label={t('statParticipants')} onClick={() => navigate('participants')} />
          <Stat icon={Globe2} value={stats.countries} label={t('statCountries')} tone="green" />
          <Stat icon={Landmark} value={stats.organisations} label={t('statOrganisations')} tone="blue" />
          <Stat icon={Mail} value={stats.withEmail} label={t('statWithEmail')} tone="blue" />
          <Stat icon={Phone} value={stats.withPhone} label={t('statWithPhone')} tone="green" />
          <Stat icon={AlertTriangle} value={stats.incomplete} label={t('statIncomplete')} tone="warning" />
          <Stat icon={CopyCheck} value={stats.duplicateGroups.length} label={t('statDuplicates')} tone="warning" />
        </div>
      )}

      {backupStale && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning-bg px-4 py-3 text-sm">
          <HardDriveDownload className="size-5 shrink-0 text-warning" />
          <p className="min-w-0 flex-1">
            {lastBackup ? t('backupReminder', { when: new Date(lastBackup).toLocaleDateString(lang) }) : t('backupNever')}
          </p>
          <Button size="sm" variant="outline" onClick={() => navigate('export')}>
            {t('downloadBackup')}
          </Button>
        </div>
      )}

      {list && list.length === 0 ? (
        <EmptyState icon={Users} title={t('emptyProjectTitle')} text={t('emptyProjectText')}>
          <Button variant="cta" onClick={() => navigate('import')}>
            <FileUp /> {t('importParticipants')}
          </Button>
          <Button variant="outline" onClick={() => setAdding(true)}>
            <Plus /> {t('addParticipant')}
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <section className="panel p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t('countryDistribution')}</h2>
            <ul className="grid gap-2.5">
              {top.map((g) => (
                <li key={g.key || 'none'} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <Flag code={g.code} />
                    <span className="truncate">{g.label || t('noCountry')}</span>
                  </span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-[#1f6fe0] to-[#35bce8]"
                      style={{ width: `${(g.items.length / max) * 100}%` }}
                    />
                  </span>
                  <span className="tabular text-right font-semibold">{g.items.length}</span>
                </li>
              ))}
              {rest > 0 && (
                <li className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm text-muted-foreground">
                  <span>{t('others')}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-muted-foreground/50" style={{ width: `${(rest / max) * 100}%` }} />
                  </span>
                  <span className="tabular text-right font-semibold">{rest}</span>
                </li>
              )}
            </ul>
          </section>
          <section className="panel overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t('byCountry')}</h2>
              <Button size="sm" variant="link" onClick={() => navigate('participants')}>
                {t('viewAll')}
              </Button>
            </div>
            <div className="max-h-[26rem] overflow-auto px-2 pb-3">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold">{t('f_country')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('colCount')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('colWithEmail')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('colWithPhone')}</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g, i) => (
                    <tr key={g.key || 'none'} className={i % 2 ? 'bg-row-alt' : ''}>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          <Flag code={g.code} /> {g.label || t('noCountry')}
                        </span>
                      </td>
                      <td className="tabular px-3 py-2 text-right font-semibold">{g.items.length}</td>
                      <td className="tabular px-3 py-2 text-right">{g.items.filter(hasEmail).length}</td>
                      <td className="tabular px-3 py-2 text-right">{g.items.filter(hasPhone).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
      <ParticipantDialog open={adding} onOpenChange={setAdding} projectId={activeProject.id} />
    </div>
  )
}
