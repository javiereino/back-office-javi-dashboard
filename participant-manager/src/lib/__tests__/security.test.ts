import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { buildHtmlPayload, buildStandaloneHtml, jsonForHtml } from '../export/html'
import { csvSafe, toCsv } from '../export/table'
import { validateBackup, BackupError } from '../export/backup'
import { decryptText, encryptText, WrongPasswordError } from '../export/crypto'
import { cleanLine } from '../text'
import { participantToVCard } from '../vcard'
import { emptyDraft, type Participant, type Project } from '../types'

const EVIL = `</script><script>alert(1)</script><img src=x onerror=alert(2)>`
const project: Project = {
  id: 'p1', name: `Meeting ${EVIL}`, location: '"><svg onload=alert(3)>', startDate: '2026-01-01', endDate: '', description: EVIL,
  archived: false, customFields: ['Hotel'], createdAt: 1, updatedAt: 1,
}
const person: Participant = {
  ...emptyDraft(), id: 'a', projectId: 'p1', country: 'ES', countryRaw: 'ES', firstName: EVIL, lastName: 'Test',
  email: 'javascript:alert(1)//@x.example', phone: '+34 600 555 123', notes: EVIL, custom: { Hotel: EVIL }, createdAt: 1, updatedAt: 1,
}

describe('standalone HTML export', () => {
  it('never lets user data close the data block or create markup', async () => {
    const payload = await buildHtmlPayload(project, [person], 'en', () => undefined)
    const html = await buildStandaloneHtml(payload)
    expect(html.match(/<\/script>/g)).toHaveLength(3) // only our own three script blocks
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<svg onload')
    expect(html).toContain("default-src 'none'")
    expect(jsonForHtml('</script>')).toBe('"\\u003c/script\\u003e"')
    fs.mkdirSync(new URL('../../../e2e/out/', import.meta.url), { recursive: true })
    fs.writeFileSync(new URL('../../../e2e/out/xss.html', import.meta.url), html)
    const enc = await buildStandaloneHtml(payload, 'correct horse battery')
    expect(enc).not.toContain('Test')
    expect(enc).toContain('pm-encrypted')
    fs.writeFileSync(new URL('../../../e2e/out/xss-encrypted.html', import.meta.url), enc)
  })
})

describe('CSV', () => {
  it('neutralises formulas but keeps phone numbers', () => {
    expect(csvSafe('=HYPERLINK("http://x")')).toBe(`'=HYPERLINK("http://x")`)
    expect(csvSafe('@SUM(A1)')).toBe(`'@SUM(A1)`)
    expect(csvSafe('+34 600 555 123')).toBe('+34 600 555 123')
    expect(csvSafe('-cmd|calc')).toBe(`'-cmd|calc`)
    expect(toCsv([['a,b', 'c"d']])).toBe('\uFEFF"a,b","c""d"\r\n')
  })
})

describe('backup validation', () => {
  const good = {
    app: 'participant-manager', format: 'pm-backup', version: 1, exportedAt: '2026-01-01',
    projects: [{ id: 'p1', name: 'P', customFields: ['X'], createdAt: 1, updatedAt: 1 }],
    participants: [
      { id: 'a', projectId: 'p1', firstName: 'Ana\u202Egnp.exe', country: 'ZZ', custom: { __proto__: 'x', ok: 'y' } },
      { id: 'b', projectId: 'missing' },
      { id: '../../etc', projectId: 'p1' },
    ],
  }
  it('accepts valid data, sanitises strings and drops orphan or malformed records', () => {
    const { backup, skipped } = validateBackup(JSON.parse(JSON.stringify(good)))
    expect(backup.participants).toHaveLength(1)
    expect(skipped).toBe(2)
    expect(backup.participants[0].firstName).toBe('Anagnp.exe') // bidi override removed
    expect(backup.participants[0].country).toBe('') // unknown code rejected
    expect(Object.getPrototypeOf(backup.participants[0].custom)).toBe(Object.prototype)
  })
  it('rejects other files and newer versions', () => {
    expect(() => validateBackup({ foo: 1 })).toThrow(BackupError)
    expect(() => validateBackup({ ...good, version: 99 })).toThrow(/newer/)
  })
})

describe('encryption', () => {
  it('round-trips and rejects a wrong password', async () => {
    const env = await encryptText('secret data', 'password123')
    expect(await decryptText(env, 'password123')).toBe('secret data')
    await expect(decryptText(env, 'nope')).rejects.toBeInstanceOf(WrongPasswordError)
  }, 20000)
})

describe('sanitising and vCard', () => {
  it('cleans control characters', () => {
    expect(cleanLine(' a\u0000b\u200B  c ')).toBe('ab c')
  })
  it('escapes vCard special characters', () => {
    const v = participantToVCard({ ...person, firstName: 'A;B', lastName: 'C,D', notes: 'x\ny' } as Participant, 'P')
    expect(v).toContain('N:C\\,D;A\\;B;;;')
    expect(v).toContain('TEL;TYPE=WORK,VOICE:+34600555123')
    expect(v.split('\r\n')[0]).toBe('BEGIN:VCARD')
  })
})
