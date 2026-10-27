import * as React from 'react'
import { toast } from 'sonner'
import { Merge, CheckCircle2, EyeOff } from 'lucide-react'
import { useApp } from '@/AppContext'
import { Dialog, DialogContent, DialogFooter } from './ui/dialog'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Flag } from './Flag'
import { getMeta, mergeParticipants, setMeta } from '@/lib/db'
import { participantCountryLabel } from '@/lib/countries'
import { displayName, type DuplicateGroup } from '@/lib/participants'
import { groupSignature } from '@/hooks/useProjectData'
import type { Participant, ParticipantDraft } from '@/lib/types'
import type { TKey } from '@/lib/i18n'

const MERGE_FIELDS = [
  'country',
  'firstName',
  'lastName',
  'fullName',
  'jobTitle',
  'organisation',
  'department',
  'email',
  'phone',
  'whatsapp',
  'notes',
] as const

function MergeView({ people, onDone, onCancel }: { people: Participant[]; onDone: () => void; onCancel: () => void }) {
  const { t, lang } = useApp()
  // default choice per field: first non-empty value, preferring the most recently modified record
  const ordered = React.useMemo(() => [...people].sort((a, b) => b.updatedAt - a.updatedAt), [people])
  const [choice, setChoice] = React.useState<Record<string, string>>(() => {
    const c: Record<string, string> = {}
    for (const f of MERGE_FIELDS) c[f] = (ordered.find((p) => p[f]) ?? ordered[0]).id
    return c
  })
  const label = (p: Participant, f: (typeof MERGE_FIELDS)[number]) =>
    f === 'country' ? participantCountryLabel(p, lang) : (p[f] as string)

  const differing = MERGE_FIELDS.filter((f) => new Set(people.map((p) => label(p, f))).size > 1)

  const apply = async () => {
    const keep = ordered[0]
    const merged: Partial<ParticipantDraft> = {}
    for (const f of MERGE_FIELDS) {
      const src = people.find((p) => p.id === choice[f])!
      ;(merged as Record<string, string>)[f] = src[f] as string
      if (f === 'country') merged.countryRaw = src.countryRaw
    }
    const custom: Record<string, string> = {}
    for (const p of [...ordered].reverse()) Object.assign(custom, p.custom)
    merged.custom = custom
    await mergeParticipants(
      keep.id,
      people.map((p) => p.id),
      merged,
    )
    toast.success(t('dupMerged'))
    onDone()
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t('dupMergeHelp')}</p>
      <div className="grid gap-3">
        {differing.map((f) => (
          <fieldset key={f} className="grid gap-1.5 rounded-xl border border-border p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t(`f_${f}` as TKey)}</legend>
            {people.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
                <input
                  type="radio"
                  name={`merge-${f}`}
                  checked={choice[f] === p.id}
                  onChange={() => setChoice((c) => ({ ...c, [f]: p.id }))}
                  className="accent-[var(--accent)]"
                />
                <span className={label(p, f) ? '' : 'italic text-muted-foreground'}>{label(p, f) || '—'}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {t('back')}
        </Button>
        <Button onClick={apply}>
          <Merge /> {t('dupMerge')}
        </Button>
      </DialogFooter>
    </div>
  )
}

export function DuplicatesDialog({
  open,
  onOpenChange,
  groups,
  participants,
  projectId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  groups: DuplicateGroup[]
  participants: Participant[]
  projectId: string
}) {
  const { t, lang } = useApp()
  const [merging, setMerging] = React.useState<DuplicateGroup | null>(null)
  const byId = React.useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants])
  React.useEffect(() => {
    if (!open) setMerging(null)
  }, [open])

  const ignore = async (g: DuplicateGroup) => {
    const key = 'dupIgnored:' + projectId
    const list = (await getMeta<string[]>(key)) ?? []
    await setMeta(key, [...list, groupSignature(g.ids)])
  }

  const mergingPeople = merging ? merging.ids.map((id) => byId.get(id)).filter((p): p is Participant => !!p) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={merging ? t('dupMergeTitle') : t('dupTitle')} className="max-w-3xl">
        {merging && mergingPeople.length > 1 ? (
          <MergeView people={mergingPeople} onDone={() => setMerging(null)} onCancel={() => setMerging(null)} />
        ) : groups.length === 0 ? (
          <div className="grid place-items-center gap-2 py-10 text-center text-muted-foreground">
            <CheckCircle2 className="size-8 text-success" />
            {t('dupNone')}
          </div>
        ) : (
          <div className="grid gap-3">
            {groups.map((g) => (
              <div key={g.ids.join()} className="panel grid gap-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {g.reasons.map((r) => (
                    <Badge key={r} tone="warning">
                      {t(`dupReason_${r}` as TKey)}
                    </Badge>
                  ))}
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => ignore(g)}>
                      <EyeOff /> {t('dupIgnore')}
                    </Button>
                    <Button size="sm" onClick={() => setMerging(g)}>
                      <Merge /> {t('dupMerge')}
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {g.ids.map((id) => {
                    const p = byId.get(id)
                    if (!p) return null
                    return (
                      <div key={id} className="rounded-lg bg-muted/60 p-3 text-sm">
                        <div className="flex items-center gap-2 font-semibold">
                          <Flag code={p.country} /> {displayName(p) || '—'}
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          {[participantCountryLabel(p, lang), p.organisation].filter(Boolean).join(' · ')}
                        </div>
                        <div className="mt-1 font-mono text-xs">{[p.email, p.phone].filter(Boolean).join(' · ')}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
