// Shared row model for the tabular exports (Excel, CSV, PDF).
import { participantCountryLabel } from '../countries'
import { translate, type Lang, type TKey } from '../i18n'
import { displayName, makeComparator } from '../participants'
import type { Participant, Project } from '../types'

export const EXPORT_FIELDS = ['country', 'firstName', 'lastName', 'fullName', 'jobTitle', 'organisation', 'department', 'email', 'phone', 'whatsapp', 'notes'] as const

export function sortForExport(list: Participant[], lang: Lang) {
  return [...list].sort(makeComparator(lang))
}

export function exportHeader(project: Project, lang: Lang): string[] {
  return [...EXPORT_FIELDS.map((f) => translate(lang, `f_${f}` as TKey)), ...project.customFields]
}

export function exportRow(p: Participant, project: Project, lang: Lang): string[] {
  return [
    ...EXPORT_FIELDS.map((f) => (f === 'country' ? participantCountryLabel(p, lang) : f === 'fullName' ? p.fullName || displayName(p) : p[f])),
    ...project.customFields.map((c) => p.custom?.[c] ?? ''),
  ]
}

/** Neutralises spreadsheet formulas in CSV cells (CSV injection) without breaking phone numbers like "+34 600…". */
export function csvSafe(v: string): string {
  if (/^[=@\t\r]/.test(v)) return "'" + v
  if (/^[+-]/.test(v) && !/^[+-][\d\s().\/-]*$/.test(v)) return "'" + v
  return v
}

export function toCsv(rows: string[][]): string {
  const cell = (v: string) => {
    const s = csvSafe(v ?? '')
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}
