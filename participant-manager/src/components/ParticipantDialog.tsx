import * as React from 'react'
import { toast } from 'sonner'
import { CheckCircle2, AlertTriangle, Plus, X } from 'lucide-react'
import { useApp } from '@/AppContext'
import { Dialog, DialogContent, DialogFooter } from './ui/dialog'
import { Button } from './ui/button'
import { Input, Label, Select, Textarea } from './ui/input'
import { Flag } from './Flag'
import { addParticipants, updateParticipant, updateProject } from '@/lib/db'
import { allCountries } from '@/lib/countries'
import { displayName, issuesOf } from '@/lib/participants'
import { phoneInfo } from '@/lib/phone'
import { cleanEmail, cleanLine, cleanMultiline } from '@/lib/text'
import { emptyDraft, type Participant, type ParticipantDraft } from '@/lib/types'
import type { TKey } from '@/lib/i18n'

function PhoneHint({ value, country }: { value: string; country: string }) {
  if (!value.trim()) return null
  const info = phoneInfo(value, country)
  if (info.status === 'valid' || info.status === 'possible')
    return (
      <span className="flex items-center gap-1 text-xs text-success">
        <CheckCircle2 className="size-3" /> <span className="font-mono">{info.e164}</span>
      </span>
    )
  return (
    <span className="flex items-center gap-1 text-xs text-warning">
      <AlertTriangle className="size-3" /> ?
    </span>
  )
}

export function ParticipantDialog({
  open,
  onOpenChange,
  participant,
  projectId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  participant?: Participant
  projectId: string
}) {
  const { t, lang, activeProject } = useApp()
  const [d, setD] = React.useState<ParticipantDraft>(emptyDraft())
  const [newField, setNewField] = React.useState('')
  const countries = React.useMemo(() => allCountries(lang), [lang])

  React.useEffect(() => {
    if (open) {
      setD(participant ? { ...participant, custom: { ...participant.custom } } : emptyDraft())
      setNewField('')
    }
  }, [open, participant])

  const customNames = React.useMemo(() => {
    const names = [...(activeProject?.customFields ?? [])]
    for (const k of Object.keys(d.custom)) if (!names.includes(k)) names.push(k)
    return names
  }, [activeProject, d.custom])

  const set = (k: keyof ParticipantDraft, v: string) => setD((x) => ({ ...x, [k]: v }))
  const issues = issuesOf(d)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const clean: ParticipantDraft = {
      ...d,
      firstName: cleanLine(d.firstName),
      lastName: cleanLine(d.lastName),
      fullName: cleanLine(d.fullName),
      jobTitle: cleanLine(d.jobTitle),
      organisation: cleanLine(d.organisation),
      department: cleanLine(d.department),
      email: cleanEmail(d.email),
      phone: cleanLine(d.phone, 80),
      whatsapp: cleanLine(d.whatsapp, 80),
      notes: cleanMultiline(d.notes),
      countryRaw: cleanLine(d.countryRaw),
      custom: Object.fromEntries(
        Object.entries(d.custom)
          .map(([k, v]) => [cleanLine(k, 60), cleanLine(v)])
          .filter(([k, v]) => k && v),
      ),
    }
    if (!displayName(clean) && !clean.email && !clean.phone) {
      toast.error(t('atLeastName'))
      return
    }
    if (participant) {
      await updateParticipant(participant.id, clean)
      toast.success(t('participantSaved'))
    } else {
      await addParticipants(projectId, [clean])
      toast.success(t('participantAdded'))
    }
    onOpenChange(false)
  }

  const addField = async () => {
    const name = cleanLine(newField, 60)
    if (!name || customNames.includes(name)) return
    if (activeProject) await updateProject(activeProject.id, { customFields: [...activeProject.customFields, name] })
    setD((x) => ({ ...x, custom: { ...x.custom, [name]: '' } }))
    setNewField('')
  }

  const field = (k: keyof ParticipantDraft, label: TKey, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`pf-${k}`}>{t(label)}</Label>
      <Input id={`pf-${k}`} value={d[k] as string} onChange={(e) => set(k, e.target.value)} {...props} />
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={participant ? t('editParticipant') : t('newParticipant')} className="max-w-2xl">
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="pf-country">{t('f_country')}</Label>
            <div className="flex items-center gap-2">
              <Flag code={d.country} />
              <Select
                id="pf-country"
                value={d.country}
                onChange={(e) => setD((x) => ({ ...x, country: e.target.value, countryRaw: e.target.value }))}
              >
                <option value="">{d.countryRaw && !d.country ? t('countryUnrecognised', { raw: d.countryRaw }) : t('selectCountry')}</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {field('firstName', 'f_firstName', { autoComplete: 'off' })}
            {field('lastName', 'f_lastName', { autoComplete: 'off' })}
          </div>
          {field('fullName', 'f_fullName', {
            placeholder: [d.firstName, d.lastName].filter(Boolean).join(' '),
            autoComplete: 'off',
          })}
          <div className="grid gap-4 sm:grid-cols-2">
            {field('jobTitle', 'f_jobTitle')}
            {field('organisation', 'f_organisation')}
          </div>
          {field('department', 'f_department')}
          {field('email', 'f_email', { type: 'email', inputMode: 'email', autoComplete: 'off' })}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="pf-phone">{t('f_phone')}</Label>
                <PhoneHint value={d.phone} country={d.country} />
              </div>
              <Input id="pf-phone" value={d.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" placeholder="+34 600 000 000" />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="pf-whatsapp">{t('f_whatsapp')}</Label>
                <PhoneHint value={d.whatsapp} country={d.country} />
              </div>
              <Input id="pf-whatsapp" value={d.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} inputMode="tel" />
            </div>
          </div>
          {customNames.map((name) => (
            <div key={name} className="grid gap-1.5">
              <Label htmlFor={`pf-c-${name}`}>{name}</Label>
              <div className="flex gap-2">
                <Input
                  id={`pf-c-${name}`}
                  value={d.custom[name] ?? ''}
                  onChange={(e) => setD((x) => ({ ...x, custom: { ...x.custom, [name]: e.target.value } }))}
                />
                {!(activeProject?.customFields ?? []).includes(name) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('delete')}
                    onClick={() =>
                      setD((x) => {
                        const c = { ...x.custom }
                        delete c[name]
                        return { ...x, custom: c }
                      })
                    }
                  >
                    <X />
                  </Button>
                )}
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              aria-label={t('customFieldName')}
              placeholder={t('customFieldName')}
              value={newField}
              onChange={(e) => setNewField(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addField()
                }
              }}
            />
            <Button variant="outline" onClick={addField} disabled={!newField.trim()}>
              <Plus /> {t('addCustomField')}
            </Button>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pf-notes">{t('f_notes')}</Label>
            <Textarea id="pf-notes" value={d.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
          {issues.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {issues.map((i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning">
                  <AlertTriangle className="size-3" /> {t(`i_${i}` as TKey)}
                </span>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit">{participant ? t('saveChanges') : t('create')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

