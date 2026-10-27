import { translate, type Lang } from '../i18n'
import type { Participant, Project } from '../types'
import { exportHeader, exportRow, sortForExport, toCsv } from './table'

export async function buildXlsx(project: Project, list: Participant[], lang: Lang): Promise<Blob> {
  const XLSX = await import('@e965/xlsx')
  const header = exportHeader(project, lang)
  const rows = sortForExport(list, lang).map((p) => exportRow(p, project, lang))
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
  // every value is written as text: no formulas can be injected, numbers keep their "+" and leading zeros
  for (const key of Object.keys(ws)) {
    if (key.startsWith('!')) continue
    const c = ws[key]
    c.t = 's'
    c.v = String(c.v ?? '')
  }
  ws['!cols'] = header.map((h, i) => ({ wch: Math.min(48, Math.max(h.length, ...rows.slice(0, 300).map((r) => (r[i] ?? '').length)) + 2) }))
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }) }
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  const wb = XLSX.utils.book_new()
  const sheetName = translate(lang, 'participantsTitle').slice(0, 31)
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  wb.Props = { Title: project.name }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true })
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function buildCsv(project: Project, list: Participant[], lang: Lang): Blob {
  const rows = [exportHeader(project, lang), ...sortForExport(list, lang).map((p) => exportRow(p, project, lang))]
  return new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
}
