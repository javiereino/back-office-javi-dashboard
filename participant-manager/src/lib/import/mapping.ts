// Deterministic column detection and record building. No guessing of values: only routing of what is in the file.
import { resolveCountry } from '../countries'
import { cleanEmail, cleanLine, cleanMultiline, EMAIL_FIND_RE, fold } from '../text'
import { CORE_FIELDS, emptyDraft, type CoreField, type ParticipantDraft } from '../types'

export type Target = CoreField | 'ignore' | `custom:${string}`
export type Confidence = 'high' | 'medium' | 'low'

export interface ColumnMapping {
  index: number
  header: string
  target: Target
  confidence: Confidence
  samples: string[]
}

export interface SourceTable {
  name: string
  rows: string[][]
  /** true when the rows come from free text / OCR rather than a real table */
  approximate?: boolean
}

// Header synonyms in English, Spanish, French (plus a few German/Italian/Portuguese), folded (no accents, lowercase).
export const SYNONYMS: Record<CoreField, string[]> = {
  country: ['country', 'pais', 'pays', 'nation', 'nationality', 'nacionalidad', 'nationalite', 'land', 'paese', 'country of origin', 'estado', 'member state', 'estado miembro', 'etat membre', 'delegation', 'delegacion', 'country delegation'],
  firstName: ['first name', 'firstname', 'given name', 'given names', 'forename', 'nombre', 'nombres', 'nombre de pila', 'prenom', 'prenoms', 'vorname', 'nome', 'primeiro nome', 'first'],
  lastName: ['last name', 'lastname', 'surname', 'surnames', 'family name', 'apellido', 'apellidos', 'primer apellido', 'nom', 'nom de famille', 'nachname', 'cognome', 'sobrenome', 'apelido', 'last'],
  fullName: ['full name', 'fullname', 'name', 'names', 'participant', 'participants', 'participant name', 'name of participant', 'delegate', 'delegate name', 'attendee', 'nombre completo', 'nombre y apellidos', 'apellidos y nombre', 'apellidos nombre', 'nombre apellidos', 'participante', 'nombre del participante', 'delegado', 'asistente', 'nom complet', 'nom et prenom', 'prenom et nom', 'nom prenom', 'participant e', 'nom du participant', 'name surname', 'name and surname', 'surname name', 'surname and name', 'first and last name'],
  jobTitle: ['title', 'job title', 'position', 'rank', 'grade', 'function', 'role', 'post', 'job', 'designation', 'cargo', 'puesto', 'rango', 'empleo', 'graduacion', 'funcion', 'categoria', 'titre', 'poste', 'fonction', 'rang', 'grado', 'position title', 'rank title', 'rank position', 'cargo puesto'],
  organisation: ['organisation', 'organization', 'org', 'agency', 'institution', 'company', 'entity', 'body', 'ministry', 'authority', 'organismo', 'organizacion', 'institucion', 'entidad', 'agencia', 'empresa', 'ministerio', 'administracion', 'organisme', 'agence', 'entreprise', 'ministere', 'autorite', 'behorde', 'organisation agency', 'organization agency', 'service agency', 'cuerpo'],
  department: ['department', 'dept', 'unit', 'division', 'section', 'directorate', 'office', 'departamento', 'unidad', 'seccion', 'servicio', 'direccion', 'area', 'departement', 'unite', 'service', 'direction', 'bureau', 'abteilung', 'department unit'],
  email: ['email', 'e mail', 'mail', 'email address', 'e mail address', 'correo', 'correo electronico', 'email correo', 'courriel', 'adresse email', 'adresse e mail', 'adresse electronique', 'mel', 'e post'],
  phone: ['phone', 'telephone', 'tel', 'tel no', 'phone number', 'telephone number', 'mobile', 'mobile phone', 'mobile number', 'cell', 'cell phone', 'contact number', 'telefono', 'telf', 'tfno', 'movil', 'celular', 'numero de telefono', 'telefono movil', 'portable', 'numero', 'telephone portable', 'mobil', 'handy', 'gsm', 'office phone'],
  whatsapp: ['whatsapp', 'whats app', 'wa', 'whatsapp number', 'numero whatsapp', 'whatsapp no'],
  notes: ['notes', 'note', 'comments', 'comment', 'remarks', 'observations', 'observaciones', 'notas', 'comentarios', 'remarques', 'commentaires', 'anmerkungen', 'other', 'otros'],
}

const SALUTATIONS = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'sr', 'sra', 'srta', 'd', 'dna', 'don', 'dona', 'm', 'mme', 'mlle', 'herr', 'frau', 'sig', 'sig ra'])

function headerScore(header: string, field: CoreField): number {
  const h = fold(header).replace(/\s+/g, ' ')
  if (!h) return 0
  let best = 0
  for (const syn of SYNONYMS[field]) {
    if (h === syn) return 1
    // whole-word containment, e.g. "e-mail address (work)" or "nombre y apellidos del participante"
    if (syn.length >= 3 && new RegExp(`(^| )${syn.replace(/ /g, ' ')}( |$)`).test(h)) best = Math.max(best, 0.55 + Math.min(syn.length, 20) / 80)
  }
  return best
}

function rate(values: string[], test: (v: string) => boolean): number {
  const filled = values.filter((v) => v.trim())
  if (!filled.length) return 0
  return filled.filter(test).length / filled.length
}

const looksPhone = (v: string) => {
  const digits = v.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 30 && /^[+\d\s().\/\-–extExtTél:Tel]+$/.test(v.trim()) && !/^\d{4}-\d{2}-\d{2}/.test(v)
}
const looksEmail = (v: string) => /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(v)
const looksCountry = (v: string) => !!resolveCountry(v)
const looksSequence = (values: string[]) => {
  const nums = values.filter(Boolean).map(Number)
  return nums.length >= 3 && nums.every((n, i) => Number.isInteger(n) && (i === 0 || n === nums[i - 1] + 1))
}

/** Index of the header row: the row among the first 25 with the most recognisable field names. */
export function detectHeaderRow(rows: string[][]): number {
  let bestRow = -1
  let bestHits = 1
  const limit = Math.min(rows.length, 25)
  for (let r = 0; r < limit; r++) {
    const cells = rows[r].filter((c) => c && c.trim())
    if (cells.length < 2) continue
    let hits = 0
    for (const c of cells) {
      if (c.length > 60 || looksEmail(c)) continue
      if (CORE_FIELDS.some((f) => headerScore(c, f) >= 0.6)) hits++
    }
    if (hits > bestHits) {
      bestHits = hits
      bestRow = r
    }
  }
  return bestRow
}

export function columnLetter(i: number): string {
  let s = ''
  let n = i + 1
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** Proposes a participant field for each column, from its header and its content. */
export function mapColumns(rows: string[][], headerRow: number): ColumnMapping[] {
  const width = Math.max(0, ...rows.map((r) => r.length))
  const data = rows.slice(headerRow + 1, headerRow + 201)
  const candidates: { col: number; field: CoreField; score: number }[] = []
  const columns: ColumnMapping[] = []

  for (let c = 0; c < width; c++) {
    const header = headerRow >= 0 ? cleanLine(rows[headerRow][c] ?? '') : ''
    const values = data.map((r) => cleanLine(r[c] ?? ''))
    const samples = values.filter(Boolean).slice(0, 3)
    columns.push({ index: c, header: header || columnLetter(c), target: 'ignore', confidence: 'low', samples })
    if (!values.some(Boolean)) continue

    const emailR = rate(values, looksEmail)
    const phoneR = rate(values, looksPhone)
    const countryR = rate(values, looksCountry)
    const salutationR = rate(values, (v) => SALUTATIONS.has(fold(v)))
    if (looksSequence(values) && !header.match(/phone|tel/i)) continue // row numbers

    for (const field of CORE_FIELDS) {
      let score = header ? headerScore(header, field) : 0
      // content evidence
      if (field === 'email') {
        score = Math.max(score, emailR >= 0.6 ? 0.9 : emailR >= 0.3 ? 0.6 : 0)
        if (emailR < 0.1) score *= 0.6 // header says email but the content does not
      }
      if (field === 'phone' || field === 'whatsapp') {
        const contentScore = phoneR >= 0.6 ? 0.8 : phoneR >= 0.3 ? 0.55 : 0
        if (field === 'phone') score = Math.max(score, contentScore)
        if (score > 0 && phoneR < 0.2 && emailR > 0.5) score *= 0.3
      }
      if (field === 'country') {
        if (countryR >= 0.6) score = Math.max(score, 0.85)
        else if (score > 0 && countryR < 0.3 && /delegat/.test(fold(header))) score *= 0.5
      }
      if (field === 'jobTitle' && salutationR > 0.5) score = 0
      if ((field === 'firstName' || field === 'lastName' || field === 'fullName' || field === 'jobTitle' || field === 'organisation') && (emailR > 0.5 || phoneR > 0.5)) score *= 0.2
      if (score > 0.3) candidates.push({ col: c, field, score })
    }
    // headerless file: a text column with mostly 2+ words is probably the name
    if (headerRow < 0 && emailR < 0.2 && phoneR < 0.2 && countryR < 0.3) {
      const multiWord = rate(values, (v) => /^[\p{L}'’.-]+(\s+[\p{L}'’.-]+){1,4}$/u.test(v))
      if (multiWord > 0.7) candidates.push({ col: c, field: 'fullName', score: 0.4 })
    }
  }

  // Greedy assignment: best scores first, each field used once.
  candidates.sort((a, b) => b.score - a.score)
  const usedFields = new Set<CoreField>()
  const usedCols = new Set<number>()
  for (const cand of candidates) {
    if (usedFields.has(cand.field) || usedCols.has(cand.col)) continue
    usedFields.add(cand.field)
    usedCols.add(cand.col)
    columns[cand.col].target = cand.field
    columns[cand.col].confidence = cand.score >= 0.9 ? 'high' : cand.score >= 0.6 ? 'medium' : 'low'
  }

  // "Nombre" / "Nom" alone often holds the complete name: if there is no matching first/last column
  // and most values have several words, treat it as the full name.
  const multiWord = (col: number) => rate(data.map((r) => cleanLine(r[col] ?? '')), (v) => v.split(/\s+/).length >= 2)
  const firstCol = columns.find((c) => c.target === 'firstName')
  const lastCol = columns.find((c) => c.target === 'lastName')
  if (!usedFields.has('fullName') && (firstCol ? !lastCol : !!lastCol)) {
    const col = (firstCol ?? lastCol)!
    if (multiWord(col.index) > 0.6) {
      col.target = 'fullName'
      col.confidence = 'medium'
    }
  }
  // Remaining columns with a real header and data are kept as additional fields rather than silently dropped.
  for (const col of columns) {
    if (col.target !== 'ignore' || headerRow < 0 || !rows[headerRow][col.index]?.trim() || !col.samples.length) continue
    const values = data.map((r) => cleanLine(r[col.index] ?? ''))
    if (looksSequence(values)) continue
    if (rate(values, (v) => SALUTATIONS.has(fold(v))) > 0.5) continue
    col.target = `custom:${col.header.slice(0, 60)}`
    col.confidence = 'medium'
  }
  return columns
}

export interface ImportRecord {
  key: string
  draft: ParticipantDraft
  /** fields filled by a low-confidence column or free-text extraction */
  lowConfidence: CoreField[]
  sourceRow: number
}

function isRepeatedHeader(row: string[], header: string[] | null): boolean {
  if (!header) return false
  let same = 0
  for (let i = 0; i < row.length; i++) if (row[i] && fold(row[i]) === fold(header[i] ?? '')) same++
  return same >= 2
}

const FOOTER_RE = /^(total|totales|sous total|subtotal|page \d+|pagina \d+|fin|end)\b/

/** Builds participant drafts from rows with the chosen column mapping. */
export function buildRecords(table: SourceTable, headerRow: number, mapping: ColumnMapping[]): ImportRecord[] {
  const out: ImportRecord[] = []
  const header = headerRow >= 0 ? table.rows[headerRow] : null
  const countryCol = mapping.find((m) => m.target === 'country')
  let sectionCountry = ''
  // a country heading placed above the header row applies to the first rows (e.g. "ITALY" then the table)
  for (let r = 0; r < headerRow; r++) {
    const filled = table.rows[r].map((c) => cleanLine(c)).filter(Boolean)
    if (filled.length === 1 && resolveCountry(filled[0])) sectionCountry = filled[0]
  }
  for (let r = headerRow + 1; r < table.rows.length && out.length < 5000; r++) {
    const row = table.rows[r].map((c) => (c ?? '').toString())
    const filled = row.map((c) => cleanLine(c)).filter(Boolean)
    if (!filled.length || isRepeatedHeader(row, header)) continue
    if (filled.length === 1) {
      // A row with a single value that is a country acts as a section heading ("SPAIN", "Delegation of France").
      const single = filled[0].replace(/^(delegation of|delegacion de|delegation de la|delegation du|delegation de|pais:|country:)\s*/i, '')
      const code = resolveCountry(single)
      if (code) {
        sectionCountry = single
        continue
      }
      if (filled[0].length < 40 && !looksEmail(filled[0]) && !looksPhone(filled[0])) continue // titles, page headers
    }
    if (FOOTER_RE.test(fold(filled[0]))) continue

    const d = emptyDraft()
    const low = new Set<CoreField>()
    const extraNotes: string[] = []
    for (const m of mapping) {
      if (m.target === 'ignore') continue
      const raw = row[m.index] ?? ''
      if (m.target.startsWith('custom:')) {
        const v = cleanLine(raw)
        if (v) d.custom[m.target.slice(7)] = v
        continue
      }
      const field = m.target as CoreField
      if (field === 'notes') {
        const v = cleanMultiline(raw)
        if (v) d.notes = d.notes ? `${d.notes}\n${v}` : v
        continue
      }
      let v = cleanLine(raw, field === 'phone' || field === 'whatsapp' ? 120 : undefined)
      if (!v) continue
      if (field === 'email') {
        const all = v.match(EMAIL_FIND_RE) ?? []
        v = cleanEmail(v)
        if (all.length > 1) extraNotes.push(`Email: ${all.slice(1).join(', ')}`)
      }
      if (field === 'country') {
        d.countryRaw = v
        d.country = resolveCountry(v)
      } else {
        ;(d as unknown as Record<string, string>)[field] = v
      }
      if (m.confidence === 'low') low.add(field)
    }
    if (!d.countryRaw && sectionCountry && (!countryCol || !cleanLine(row[countryCol.index]))) {
      d.countryRaw = sectionCountry
      d.country = resolveCountry(sectionCountry)
    }
    if (extraNotes.length) d.notes = [d.notes, ...extraNotes].filter(Boolean).join('\n')
    // A row must contain at least a name, an email or a phone number to be a participant.
    const hasIdentity = d.firstName || d.lastName || d.fullName || d.email || d.phone || d.whatsapp
    if (!hasIdentity) continue
    // When the full name equals "first last", keep only the parts (avoids duplicated display).
    if (d.fullName && d.firstName && d.lastName && fold(d.fullName) === fold(`${d.firstName} ${d.lastName}`)) d.fullName = ''
    out.push({ key: `${table.name}:${r}`, draft: d, lowConfidence: [...low], sourceRow: r + 1 })
  }
  return out
}

/**
 * Splits a full name only when the pattern is unambiguous:
 *  - "HERRERA GIL, Lucía" or "Herrera Gil, Lucía"  -> last = before comma
 *  - "HERRERA GIL Lucía" (surname in capitals)      -> last = capitalised words
 * Returns null otherwise (we never guess where a surname starts).
 */
export function splitFullName(full: string): { firstName: string; lastName: string } | null {
  const s = full.trim()
  const comma = s.match(/^([^,]+),\s*([^,]+)$/)
  if (comma) return { lastName: comma[1].trim(), firstName: comma[2].trim() }
  const words = s.split(/\s+/)
  if (words.length < 2) return null
  const isUpper = (w: string) => /\p{L}/u.test(w) && w === w.toLocaleUpperCase() && w !== w.toLocaleLowerCase() && w.replace(/[^\p{L}]/gu, '').length > 1
  const upperIdx = words.map(isUpper)
  if (upperIdx.every(Boolean) || !upperIdx.some(Boolean)) return null
  // capitals must form one contiguous block at the start or at the end
  const firstUpper = upperIdx.indexOf(true)
  const lastUpper = upperIdx.lastIndexOf(true)
  if (upperIdx.slice(firstUpper, lastUpper + 1).some((u) => !u)) return null
  if (firstUpper !== 0 && lastUpper !== words.length - 1) return null
  const last = words.slice(firstUpper, lastUpper + 1).join(' ')
  const first = words.filter((_, i) => i < firstUpper || i > lastUpper).join(' ')
  const titleCase = (w: string) =>
    w
      .toLocaleLowerCase()
      .replace(/(^|[\s'’-])(\p{L})/gu, (_, a: string, b: string) => a + b.toLocaleUpperCase())
  return { firstName: first, lastName: titleCase(last) }
}

