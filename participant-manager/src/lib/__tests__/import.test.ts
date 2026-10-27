import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import * as XLSX from '@e965/xlsx'
import { buildRecords, detectHeaderRow, mapColumns, splitFullName } from '../import/mapping'
import { freeTextRecords, parseDelimited, looksDelimited } from '../import/text'
import { decodeText } from '../import/readers'
import { resolveCountry } from '../countries'
import { phoneInfo, whatsappHref } from '../phone'
import { findDuplicateGroups, makeComparator, groupByCountry } from '../participants'
import { emptyDraft, type Participant } from '../types'

const sample = (f: string) => new URL(`../../../samples/${f}`, import.meta.url).pathname

describe('countries', () => {
  it('resolves English, Spanish and French names, aliases and codes', () => {
    expect(resolveCountry('España')).toBe('ES')
    expect(resolveCountry('Spain')).toBe('ES')
    expect(resolveCountry('Espagne')).toBe('ES')
    expect(resolveCountry('ES')).toBe('ES')
    expect(resolveCountry('Países Bajos')).toBe('NL')
    expect(resolveCountry('Pays-Bas')).toBe('NL')
    expect(resolveCountry('UK')).toBe('GB')
    expect(resolveCountry('Reino Unido')).toBe('GB')
    expect(resolveCountry('EE.UU.')).toBe('US')
    expect(resolveCountry('Côte d’Ivoire')).toBe('CI')
    expect(resolveCountry('Allemagne')).toBe('DE')
    expect(resolveCountry('Atlantis')).toBe('')
    expect(resolveCountry('es')).toBe('') // lowercase two letters are not trusted
  })
})

describe('phones', () => {
  it('normalises international numbers and keeps unknown ones invalid', () => {
    expect(phoneInfo('+34 915 550 214').e164).toBe('+34915550214')
    expect(phoneInfo('0034 600 555 123').e164).toBe('+34600555123')
    expect(phoneInfo('915550214', 'ES').e164).toBe('+34915550214')
    expect(phoneInfo('07700 900123', 'GB').e164).toBe('+447700900123')
    expect(phoneInfo('12').status).toBe('invalid')
    expect(whatsappHref('+34 600 555 123')).toBe('https://wa.me/34600555123')
    expect(whatsappHref('600 555 123')).toBeNull() // no country: never guessed
  })
})

describe('Excel import', () => {
  const wb = XLSX.read(fs.readFileSync(sample('participants-sample.xlsx')))
  const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' })
  const header = detectHeaderRow(rows)
  const mapping = mapColumns(rows, header)
  const target = (h: string) => mapping.find((m) => m.header === h)?.target

  it('finds the header row below the title', () => expect(header).toBe(2))
  it('maps Spanish headers', () => {
    expect(target('País')).toBe('country')
    expect(target('Nombre')).toBe('firstName')
    expect(target('Apellidos')).toBe('lastName')
    expect(target('Cargo')).toBe('jobTitle')
    expect(target('Organización')).toBe('organisation')
    expect(target('Correo electrónico')).toBe('email')
    expect(target('Teléfono')).toBe('phone')
    expect(target('Observaciones')).toBe('notes')
    expect(target('Nº')).toBe('ignore')
  })
  it('builds 34 records without inventing data', () => {
    const recs = buildRecords({ name: 's', rows }, header, mapping)
    expect(recs).toHaveLength(34)
    const markus = recs.find((r) => r.draft.firstName === 'Markus')!
    expect(markus.draft.email).toBe('')
    expect(markus.draft.country).toBe('DE')
    expect(recs.filter((r) => r.draft.country === 'ES')).toHaveLength(4)
    expect(recs.at(-1)!.draft.country).toBe('')
  })
})

describe('CSV import (French, semicolons, BOM)', () => {
  const b = fs.readFileSync(sample('participants-sample.csv'))
  const text = decodeText(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
  const rows = parseDelimited(text)
  const header = detectHeaderRow(rows)
  const mapping = mapColumns(rows, header)
  it('maps French headers', () => {
    expect(header).toBe(0)
    expect(mapping.map((m) => m.target)).toEqual(['country', 'firstName', 'lastName', 'jobTitle', 'organisation', 'email', 'phone'])
    expect(buildRecords({ name: 'c', rows }, header, mapping)).toHaveLength(12)
  })
})

describe('free text', () => {
  it('extracts blocks and section countries', () => {
    const text = fs.readFileSync(sample('participants-sample.txt'), 'utf8')
    expect(looksDelimited(text)).toBe(false)
    const recs = freeTextRecords(text, 't')
    expect(recs.map((r) => r.draft.fullName)).toEqual(['Marta Domínguez', 'Álvaro Navarro', 'Léa Moreau'])
    expect(recs[0].draft.email).toBe('m.dominguez@uci-es.example')
    expect(recs[0].draft.country).toBe('ES')
    expect(recs[1].draft.organisation).toBe('Centro de Altos Estudios')
    expect(recs[1].draft.whatsapp).toContain('600 555 188')
    expect(recs[2].draft.country).toBe('FR')
  })
})

describe('names', () => {
  it('splits only unambiguous patterns', () => {
    expect(splitFullName('HERRERA GIL, Lucía')).toEqual({ lastName: 'HERRERA GIL', firstName: 'Lucía' })
    expect(splitFullName('HERRERA GIL Lucía')).toEqual({ lastName: 'Herrera Gil', firstName: 'Lucía' })
    expect(splitFullName('Lucía Herrera Gil')).toBeNull()
  })
})

describe('directory', () => {
  const mk = (id: string, country: string, first: string, last: string, email = '', phone = ''): Participant => ({
    ...emptyDraft(),
    id,
    projectId: 'p',
    country,
    countryRaw: country,
    firstName: first,
    lastName: last,
    email,
    phone,
    createdAt: 0,
    updatedAt: 0,
  })
  const list = [
    mk('1', 'FR', 'Hugo', 'Lefèvre'),
    mk('2', 'DE', 'Katrin', 'Vogel', 'k@x.example'),
    mk('3', 'ES', 'Lucía', 'Herrera', 'l@x.example'),
    mk('4', 'ES', 'Ana', 'Álvarez'),
    mk('5', 'ES', 'Lucia', 'Herrera', 'L@X.example'),
    mk('6', '', 'No', 'Country'),
  ]
  it('sorts by country (in the UI language) then name, without country last', () => {
    const en = groupByCountry([...list].sort(makeComparator('en')), 'en').map((g) => g.code)
    expect(en).toEqual(['FR', 'DE', 'ES', '']) // France, Germany, Spain
    const es = groupByCountry([...list].sort(makeComparator('es')), 'es').map((g) => g.code)
    expect(es).toEqual(['DE', 'ES', 'FR', '']) // Alemania, España, Francia
    const spain = [...list].sort(makeComparator('es')).filter((p) => p.country === 'ES').map((p) => p.lastName)
    expect(spain[0]).toBe('Álvarez')
  })
  it('detects duplicates by email and name', () => {
    const groups = findDuplicateGroups(list)
    expect(groups).toHaveLength(1)
    expect(groups[0].ids.sort()).toEqual(['3', '5'])
  })
})
