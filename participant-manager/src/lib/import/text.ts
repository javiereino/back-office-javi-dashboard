// Turning unstructured text (TXT, Word paragraphs, PDF/OCR without a table) into rows or records.
import { resolveCountry } from '../countries'
import { cleanLine, EMAIL_FIND_RE } from '../text'
import { emptyDraft, type CoreField } from '../types'
import { SYNONYMS, type ImportRecord, type SourceTable } from './mapping'

// ---------- delimited text (CSV, TSV, pasted from Excel) ----------

/** RFC 4180 parser with quoted fields; delimiter is detected when not given. */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const d = delimiter ?? sniffDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === d) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
    if (rows.length > 20000) break
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export function sniffDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30)
  let best = ','
  let bestScore = 0
  for (const d of ['\t', ';', ',', '|']) {
    const counts = lines.map((l) => l.split(d).length - 1)
    const withD = counts.filter((c) => c > 0)
    if (!withD.length) continue
    // consistent number of separators across lines wins
    const mode = [...withD].sort((a, b) => withD.filter((x) => x === b).length - withD.filter((x) => x === a).length)[0]
    const score = (withD.filter((c) => c === mode).length / lines.length) * Math.min(mode, 6)
    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return best
}

/** Does this text look like a table (most lines split into the same number of ≥3 columns)? */
export function looksDelimited(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 3) return false
  const d = sniffDelimiter(text)
  const counts = lines.map((l) => l.split(d).length)
  const good = counts.filter((c) => c >= 3).length
  return good / lines.length >= 0.6
}

// ---------- positioned text (PDF, OCR) ----------

export interface PositionedItem {
  text: string
  x: number
  y: number
  w: number
  h: number
}

export interface Line {
  y: number
  /** text runs joined into cells; `parts` keeps each run's position for column alignment */
  cells: { x: number; text: string; parts: { x: number; text: string }[] }[]
}

/** Groups positioned words into lines and lines into cells separated by large horizontal gaps. */
export function itemsToLines(items: PositionedItem[]): Line[] {
  const sorted = items.filter((i) => i.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: { y: number; h: number; items: PositionedItem[] }[] = []
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= Math.max(2, Math.min(l.h, it.h) * 0.5))
    if (line) line.items.push(it)
    else lines.push({ y: it.y, h: it.h, items: [it] })
  }
  return lines
    .sort((a, b) => a.y - b.y)
    .map((l) => {
      const its = l.items.sort((a, b) => a.x - b.x)
      const cells: Line['cells'] = []
      let prevEnd = -Infinity
      for (const it of its) {
        const gap = it.x - prevEnd
        const charW = it.w / Math.max(1, it.text.length)
        if (cells.length && gap < Math.max(charW * 2.2, it.h * 0.9)) {
          const c = cells[cells.length - 1]
          const sep = gap > charW * 0.25 ? ' ' : ''
          c.text += sep + it.text
          // a visible gap starts a new part (possible column boundary); touching runs extend the current one
          if (sep) c.parts.push({ x: it.x, text: it.text })
          else c.parts[c.parts.length - 1].text += it.text
        } else cells.push({ x: it.x, text: it.text, parts: [{ x: it.x, text: it.text }] })
        prevEnd = it.x + it.w
      }
      return {
        y: l.y,
        cells: cells.map((c) => ({ ...c, text: c.text.replace(/\s+/g, ' ').trim() })),
      }
    })
}

/**
 * Converts lines into table rows aligned on column positions. Column anchors come from the header line when
 * one is found, otherwise from clustering the starting positions of cells.
 */
export function linesToTable(lines: Line[], name: string, headerLineIndex: number): SourceTable | null {
  const multi = lines.filter((l) => l.cells.length >= 3)
  if (multi.length < 3 || multi.length / Math.max(1, lines.length) < 0.35) return null
  let anchors: number[]
  if (headerLineIndex >= 0) anchors = lines[headerLineIndex].cells.map((c) => c.x)
  else {
    const xs = multi.flatMap((l) => l.cells.map((c) => c.x)).sort((a, b) => a - b)
    const clusters: { x: number; n: number }[] = []
    for (const x of xs) {
      const c = clusters.find((k) => Math.abs(k.x - x) < 12)
      if (c) {
        c.x = (c.x * c.n + x) / (c.n + 1)
        c.n++
      } else clusters.push({ x, n: 1 })
    }
    anchors = clusters.filter((c) => c.n >= Math.max(2, multi.length * 0.25)).map((c) => c.x).sort((a, b) => a - b)
    if (anchors.length < 3) return null
  }
  const rows = lines.map((l) => {
    const row: string[] = new Array(anchors.length).fill('')
    // with a header, each text run is placed by its own position, so cells that touch are still separated
    const pieces = headerLineIndex >= 0 ? l.cells.flatMap((c) => c.parts) : l.cells
    for (const c of pieces) {
      const text = c.text.trim()
      if (!text) continue
      let idx = 0
      for (let i = 0; i < anchors.length; i++) if (anchors[i] <= c.x + 8) idx = i
      row[idx] = row[idx] ? `${row[idx]} ${text}` : text
    }
    return row
  })
  return { name, rows: mergeWrappedRows(lines, rows), approximate: true }
}

const hasContact = (row: string[]) => row.some((c) => /@/.test(c) || c.replace(/\D/g, '').length >= 7)

/**
 * Table cells whose text wraps produce several lines for one logical row. Lines that are much closer together
 * than the usual row spacing are merged column by column. When spacing gives no signal, a short line without
 * contact data that follows a row with contact data is treated as the continuation of that row.
 */
function mergeWrappedRows(lines: Line[], rows: string[][]): string[][] {
  const gaps = lines.slice(1).map((l, i) => l.y - lines[i].y).filter((g) => g > 0 && g < 200)
  const sorted = [...gaps].sort((a, b) => a - b)
  const small = sorted[Math.floor(sorted.length * 0.15)] ?? 0
  const smallShare = gaps.filter((g) => g <= small * 1.2).length / Math.max(1, gaps.length)
  const bimodal = small > 0 && sorted.some((g) => g >= small * 1.6) && smallShare >= 0.08 && smallShare <= 0.85
  const merged: string[][] = []
  let lastY = -Infinity
  let lastWasMerged = false
  lines.forEach((l, i) => {
    const row = rows[i]
    const prev = merged[merged.length - 1]
    const filled = row.filter(Boolean)
    const isHeading = filled.length === 1 && !!resolveCountry(filled[0])
    const close = bimodal && l.y - lastY <= small * 1.2
    const continuation = !bimodal && prev && !isHeading && !hasContact(row) && filled.length <= 2 && hasContact(prev) && !lastWasMerged
    if (prev && !isHeading && (close || continuation)) {
      row.forEach((c, j) => {
        if (c) prev[j] = prev[j] ? `${prev[j]} ${c}` : c
      })
      lastWasMerged = !!continuation
    } else {
      merged.push([...row])
      lastWasMerged = false
    }
    lastY = l.y
  })
  return merged
}

// ---------- free text ----------

const LABELS: { field: CoreField; re: RegExp }[] = (Object.keys(SYNONYMS) as CoreField[]).map((field) => ({
  field,
  re: new RegExp(`^(${SYNONYMS[field].filter((s) => s.length > 2).join('|')})\\s*[:：-]\\s*(.+)$`, 'i'),
}))

const PHONE_RE = /(?:\+|00)?\(?\d[\d\s().\/-]{6,}\d/g

/**
 * Extracts participants from paragraphs. Each block (separated by blank lines, or each line when there are no
 * blank lines) becomes a record. Every record is flagged for manual review.
 */
export function freeTextRecords(text: string, sourceName: string): ImportRecord[] {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\t+/g, ' · ').trim())
  let blocks: string[][] = []
  let cur: string[] = []
  for (const l of lines) {
    if (!l) {
      if (cur.length) blocks.push(cur)
      cur = []
    } else cur.push(l)
  }
  if (cur.length) blocks.push(cur)
  // one big block of many lines with contacts on most lines -> one record per line
  const hasEmail = (l: string) => (l.match(EMAIL_FIND_RE) ?? []).length > 0
  if (blocks.length <= 2 && lines.filter(hasEmail).length >= 3) {
    blocks = lines.filter(Boolean).map((l) => [l])
  }

  const out: ImportRecord[] = []
  let sectionCountry = ''
  blocks.forEach((block, bi) => {
    if (block.length === 1) {
      const code = resolveCountry(block[0].replace(/^(delegation of|delegacion de|delegation de|pais:|country:)\s*/i, ''))
      if (code && block[0].length < 50) {
        sectionCountry = block[0]
        return
      }
    }
    const d = emptyDraft()
    const rest: string[] = []
    for (const rawLine of block) {
      let line = rawLine
      const emails = line.match(EMAIL_FIND_RE) ?? []
      if (emails.length) {
        if (!d.email) d.email = emails[0]!
        line = line.replace(EMAIL_FIND_RE, ' ')
      }
      const labelled = LABELS.find((l) => l.re.test(cleanLine(line)))
      if (labelled && labelled.field !== 'email') {
        const value = cleanLine(line).match(labelled.re)![2]
        if (labelled.field === 'country') {
          d.countryRaw = value
          d.country = resolveCountry(value)
        } else if (!(d as unknown as Record<string, string>)[labelled.field]) (d as unknown as Record<string, string>)[labelled.field] = value
        continue
      }
      const phones = (line.match(PHONE_RE) ?? []).filter((p) => p.replace(/\D/g, '').length >= 7)
      if (phones.length) {
        const isWa = /whats\s?app|\bwa\b/i.test(line)
        for (const p of phones) {
          if (isWa && !d.whatsapp) d.whatsapp = p.trim()
          else if (!d.phone) d.phone = p.trim()
        }
        line = line.replace(PHONE_RE, ' ').replace(/\b(tel|tél|phone|telefono|teléfono|mobile|móvil|movil|whatsapp|fax)\b\.?\s*:?/gi, ' ')
      }
      line = cleanLine(line.replace(/[·|,;]+\s*$/g, '').replace(/^\s*[·|,;:-]+/, ''))
      // a label left without its value once the email/phone was taken out ("Email:", "Tel.:")
      if (!line || /^[\p{L} .]{1,24}[:：]?$/u.test(line) && /[:：]$|^(e-?mail|email|correo|courriel|tel|tél|phone|mobile|whatsapp)\.?$/i.test(line)) continue
      if (!d.countryRaw && resolveCountry(line) && line.length < 40) {
        d.countryRaw = line
        d.country = resolveCountry(line)
        continue
      }
      rest.push(line)
    }
    // the first remaining line that looks like a personal name (2–5 words, letters only) is the name
    const nameIdx = rest.findIndex((l) => /^[\p{L}'’.-]+(\s+[\p{L}'’.-]+){1,4}$/u.test(l) && l.length <= 60)
    if (nameIdx >= 0 && !d.fullName && !d.firstName && !d.lastName) {
      d.fullName = rest[nameIdx]
      rest.splice(nameIdx, 1)
    }
    if (rest.length) d.notes = rest.join('\n')
    if (!d.countryRaw && sectionCountry) {
      d.countryRaw = sectionCountry
      d.country = resolveCountry(sectionCountry)
    }
    if (!d.fullName && !d.firstName && !d.email && !d.phone && !d.whatsapp) return
    out.push({
      key: `${sourceName}:text:${bi}`,
      draft: d,
      lowConfidence: ['fullName', 'country', 'phone', 'whatsapp', 'jobTitle', 'organisation'],
      sourceRow: bi + 1,
    })
  })
  return out
}
