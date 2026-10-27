// vCard 3.0 generation (the version best supported by iOS and Android Contacts). Built entirely in the browser.
import { countryName } from './countries'
import { displayName } from './participants'
import { phoneInfo } from './phone'
import type { Participant } from './types'

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

/** Folds lines longer than 75 characters as required by RFC 2425. */
function fold(line: string): string {
  const chars = [...line]
  if (chars.length <= 75) return line
  const out: string[] = []
  for (let i = 0; i < chars.length; i += 74) out.push((i ? ' ' : '') + chars.slice(i, i + 74).join(''))
  return out.join('\r\n')
}

function formatPhone(raw: string, country: string): string {
  // international format when we can determine it, otherwise the number exactly as written
  return phoneInfo(raw, country).e164 || raw
}

export function participantToVCard(p: Participant, projectName?: string): string {
  const name = displayName(p)
  const lines = ['BEGIN:VCARD', 'VERSION:3.0']
  lines.push(`N:${esc(p.lastName)};${esc(p.firstName || (p.lastName ? '' : name))};;;`)
  lines.push(`FN:${esc(name || p.email || p.phone)}`)
  if (p.organisation || p.department) lines.push(`ORG:${esc(p.organisation)}${p.department ? ';' + esc(p.department) : ''}`)
  if (p.jobTitle) lines.push(`TITLE:${esc(p.jobTitle)}`)
  if (p.email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${esc(p.email)}`)
  const phone = p.phone ? formatPhone(p.phone, p.country) : ''
  const wa = p.whatsapp ? formatPhone(p.whatsapp, p.country) : ''
  if (phone) lines.push(`TEL;TYPE=WORK,VOICE:${esc(phone)}`)
  if (wa && wa !== phone) lines.push(`TEL;TYPE=CELL:${esc(wa)}`)
  if (p.country) lines.push(`ADR;TYPE=WORK:;;;;;;${esc(countryName(p.country, 'en'))}`)
  const note = [projectName, p.notes].filter(Boolean).join('\n')
  if (note) lines.push(`NOTE:${esc(note)}`)
  lines.push('END:VCARD')
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function participantsToVCards(list: Participant[], projectName?: string): string {
  return list.map((p) => participantToVCard(p, projectName)).join('')
}
