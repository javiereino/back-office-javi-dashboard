// Derived information about participants: display names, sorting, grouping, completeness, duplicates.
import { countryGroupKey, participantCountryLabel } from './countries'
import { phoneInfo } from './phone'
import { fold, isValidEmail } from './text'
import type { Participant, ParticipantDraft } from './types'

type P = Pick<Participant, 'firstName' | 'lastName' | 'fullName'>

export function displayName(p: P): string {
  return p.fullName || [p.firstName, p.lastName].filter(Boolean).join(' ')
}

/** Name used for alphabetical ordering: last name first when known. */
export function sortName(p: P): string {
  if (p.lastName) return `${p.lastName} ${p.firstName}`
  return displayName(p)
}

export function hasEmail(p: Pick<Participant, 'email'>) {
  return !!p.email.trim()
}
export function hasPhone(p: Pick<Participant, 'phone' | 'whatsapp'>) {
  return !!(p.phone.trim() || p.whatsapp.trim())
}

export type Issue =
  | 'noName'
  | 'noCountry'
  | 'unknownCountry'
  | 'noEmail'
  | 'badEmail'
  | 'noPhone'
  | 'badPhone'
  | 'badWhatsapp'
  | 'noOrganisation'

/** Missing or suspicious information. Never "fixes" anything, only reports. */
export function issuesOf(p: ParticipantDraft): Issue[] {
  const out: Issue[] = []
  if (!displayName(p)) out.push('noName')
  if (!p.country && !p.countryRaw) out.push('noCountry')
  else if (!p.country) out.push('unknownCountry')
  if (!p.email) out.push('noEmail')
  else if (!isValidEmail(p.email)) out.push('badEmail')
  if (!p.phone && !p.whatsapp) out.push('noPhone')
  if (p.phone && phoneInfo(p.phone, p.country).status === 'invalid') out.push('badPhone')
  if (p.whatsapp && phoneInfo(p.whatsapp, p.country).status === 'invalid') out.push('badWhatsapp')
  if (!p.organisation) out.push('noOrganisation')
  return out
}

/** A record is incomplete when it lacks a name, a country or any way of contacting the person. */
export function isIncomplete(p: ParticipantDraft): boolean {
  return !displayName(p) || (!p.country && !p.countryRaw) || (!hasEmail(p) && !hasPhone(p))
}

export function makeComparator(lang: string, direction: 'asc' | 'desc' = 'asc') {
  const coll = new Intl.Collator(lang, { sensitivity: 'base', numeric: true })
  const sign = direction === 'asc' ? 1 : -1
  return (a: Participant, b: Participant) => {
    const ca = participantCountryLabel(a, lang)
    const cb = participantCountryLabel(b, lang)
    // participants without a country always go last
    if (!ca !== !cb) return ca ? -1 : 1
    const byCountry = coll.compare(ca, cb)
    if (byCountry) return byCountry * sign
    return coll.compare(sortName(a), sortName(b)) * sign
  }
}

export interface CountryGroup {
  key: string
  code: string
  label: string
  items: Participant[]
}

/** Groups already-sorted participants by country, keeping the order. */
export function groupByCountry(sorted: Participant[], lang: string): CountryGroup[] {
  const groups: CountryGroup[] = []
  const index = new Map<string, CountryGroup>()
  for (const p of sorted) {
    const key = countryGroupKey(p)
    let g = index.get(key)
    if (!g) {
      g = { key, code: p.country, label: participantCountryLabel(p, lang), items: [] }
      index.set(key, g)
      groups.push(g)
    }
    g.items.push(p)
  }
  return groups
}

// ---------- duplicates ----------

export function nameKey(p: P): string {
  const tokens = fold(displayName(p)).split(' ').filter((t) => t.length > 1)
  if (tokens.length < 2) return ''
  return tokens.sort().join(' ')
}

export type DuplicateReason = 'email' | 'phone' | 'name'

export interface DuplicateGroup {
  ids: string[]
  reasons: DuplicateReason[]
}

/** Keys that identify the same person. Exposed so the importer can compare new rows with existing ones. */
export function duplicateKeys(p: ParticipantDraft): { reason: DuplicateReason; key: string }[] {
  const keys: { reason: DuplicateReason; key: string }[] = []
  if (p.email && isValidEmail(p.email)) keys.push({ reason: 'email', key: 'e:' + p.email.trim().toLowerCase() })
  for (const n of [p.phone, p.whatsapp]) {
    const e = phoneInfo(n, p.country).e164
    if (e) keys.push({ reason: 'phone', key: 'p:' + e })
  }
  const nk = nameKey(p)
  if (nk) keys.push({ reason: 'name', key: 'n:' + nk })
  return keys
}

export function findDuplicateGroups(list: Participant[]): DuplicateGroup[] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(x, r)
    return r
  }
  const union = (a: string, b: string) => parent.set(find(a), find(b))
  const reasonsById = new Map<string, Set<DuplicateReason>>()
  const owner = new Map<string, string>()
  for (const p of list) parent.set(p.id, p.id)
  for (const p of list) {
    for (const { reason, key } of duplicateKeys(p)) {
      const other = owner.get(key)
      if (other && other !== p.id) {
        union(p.id, other)
        for (const id of [p.id, other]) {
          if (!reasonsById.has(id)) reasonsById.set(id, new Set())
          reasonsById.get(id)!.add(reason)
        }
      } else owner.set(key, p.id)
    }
  }
  const groups = new Map<string, DuplicateGroup>()
  for (const id of reasonsById.keys()) {
    const root = find(id)
    if (!groups.has(root)) groups.set(root, { ids: [], reasons: [] })
    const g = groups.get(root)!
    g.ids.push(id)
    for (const r of reasonsById.get(id)!) if (!g.reasons.includes(r)) g.reasons.push(r)
  }
  return [...groups.values()].filter((g) => g.ids.length > 1)
}

/** Searchable text for a participant (all fields, accent-insensitive). */
export function searchText(p: Participant, lang: string): string {
  return fold(
    [
      participantCountryLabel(p, lang),
      p.country,
      p.countryRaw,
      p.firstName,
      p.lastName,
      p.fullName,
      p.jobTitle,
      p.organisation,
      p.department,
      p.email,
      p.phone,
      p.whatsapp,
      p.notes,
      ...Object.values(p.custom ?? {}),
    ].join(' '),
  )
}

/** Plain-text contact card for the clipboard. */
export function contactText(p: Participant, lang: string, projectName?: string): string {
  const lines = [
    displayName(p),
    p.jobTitle,
    [p.organisation, p.department].filter(Boolean).join(' – '),
    participantCountryLabel(p, lang),
    p.email && `Email: ${p.email}`,
    p.phone && `Tel: ${p.phone}`,
    p.whatsapp && p.whatsapp !== p.phone && `WhatsApp: ${p.whatsapp}`,
    projectName,
  ]
  return lines.filter(Boolean).join('\n')
}
