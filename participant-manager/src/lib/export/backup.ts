// JSON backup: export, strict validation and restore (merge or replace).
import { db, setMeta } from '../db'
import { isIsoCode } from '../countries'
import { cleanLine, cleanMultiline, MAX_FIELD } from '../text'
import type { Participant, Project } from '../types'
import { decryptText, encryptText, isEncryptedEnvelope, type EncryptedEnvelope } from './crypto'

export const BACKUP_FORMAT = 'pm-backup'
export const BACKUP_VERSION = 1

export interface Backup {
  app: 'participant-manager'
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  projects: Project[]
  participants: Participant[]
}

export async function createBackup(): Promise<Backup> {
  const [projects, participants] = await Promise.all([db.projects.toArray(), db.participants.toArray()])
  return {
    app: 'participant-manager',
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    projects,
    participants,
  }
}

export async function backupBlob(password?: string): Promise<Blob> {
  const b = await createBackup()
  const json = JSON.stringify(b, null, 1)
  const body = password ? JSON.stringify(await encryptText(json, password)) : json
  await setMeta('lastBackupAt', Date.now())
  return new Blob([body], { type: 'application/json' })
}

export class BackupError extends Error {}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const DATE_RE = /^(\d{4}-\d{2}-\d{2})?$/
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback)
const str = (v: unknown, max = MAX_FIELD) => (typeof v === 'string' ? cleanLine(v, max) : '')

function validProject(x: unknown): Project | null {
  if (!x || typeof x !== 'object') return null
  const p = x as Record<string, unknown>
  if (typeof p.id !== 'string' || !ID_RE.test(p.id)) return null
  const name = str(p.name, 150)
  if (!name) return null
  const now = Date.now()
  return {
    id: p.id,
    name,
    location: str(p.location, 150),
    startDate: typeof p.startDate === 'string' && DATE_RE.test(p.startDate) ? p.startDate : '',
    endDate: typeof p.endDate === 'string' && DATE_RE.test(p.endDate) ? p.endDate : '',
    description: typeof p.description === 'string' ? cleanMultiline(p.description, 2000) : '',
    archived: p.archived === true,
    customFields: Array.isArray(p.customFields) ? [...new Set(p.customFields.map((c) => str(c, 60)).filter(Boolean))].slice(0, 50) : [],
    demo: p.demo === true || undefined,
    createdAt: num(p.createdAt, now),
    updatedAt: num(p.updatedAt, now),
  }
}

function validParticipant(x: unknown, projectIds: Set<string>): Participant | null {
  if (!x || typeof x !== 'object') return null
  const p = x as Record<string, unknown>
  if (typeof p.id !== 'string' || !ID_RE.test(p.id)) return null
  if (typeof p.projectId !== 'string' || !projectIds.has(p.projectId)) return null
  const country = typeof p.country === 'string' && isIsoCode(p.country) ? p.country : ''
  const custom: Record<string, string> = {}
  if (p.custom && typeof p.custom === 'object' && !Array.isArray(p.custom)) {
    for (const [k, v] of Object.entries(p.custom as Record<string, unknown>).slice(0, 50)) {
      const key = str(k, 60)
      // reject keys that could interfere with object prototypes
      if (key && !['__proto__', 'constructor', 'prototype'].includes(key)) custom[key] = str(v)
    }
  }
  const now = Date.now()
  return {
    id: p.id,
    projectId: p.projectId,
    country,
    countryRaw: str(p.countryRaw) || country,
    firstName: str(p.firstName),
    lastName: str(p.lastName),
    fullName: str(p.fullName),
    jobTitle: str(p.jobTitle),
    organisation: str(p.organisation),
    department: str(p.department),
    email: str(p.email),
    phone: str(p.phone, 120),
    whatsapp: str(p.whatsapp, 120),
    notes: typeof p.notes === 'string' ? cleanMultiline(p.notes) : '',
    custom,
    createdAt: num(p.createdAt, now),
    updatedAt: num(p.updatedAt, now),
  }
}

export type ParsedBackupFile = { encrypted: true; envelope: EncryptedEnvelope } | { encrypted: false; backup: Backup; skipped: number }

/** Parses the file text. Encrypted backups need `decryptBackup` first. */
export function parseBackupText(text: string): ParsedBackupFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupError('JSON')
  }
  if (isEncryptedEnvelope(data)) return { encrypted: true, envelope: data }
  return { encrypted: false, ...validateBackup(data) }
}

export async function decryptBackup(env: EncryptedEnvelope, password: string) {
  return validateBackup(JSON.parse(await decryptText(env, password)))
}

export function validateBackup(data: unknown): { backup: Backup; skipped: number } {
  const d = data as Record<string, unknown>
  if (!d || typeof d !== 'object') throw new BackupError('structure')
  if (d.app !== 'participant-manager' || d.format !== BACKUP_FORMAT) throw new BackupError('format')
  if (typeof d.version !== 'number' || d.version < 1) throw new BackupError('version')
  if (d.version > BACKUP_VERSION) throw new BackupError(`version ${d.version} (newer than this app)`)
  if (!Array.isArray(d.projects) || !Array.isArray(d.participants)) throw new BackupError('structure')
  if (d.projects.length > 2000 || d.participants.length > 200000) throw new BackupError('size')
  const projects = d.projects.map(validProject).filter((p): p is Project => !!p)
  const ids = new Set(projects.map((p) => p.id))
  const participants = d.participants.map((x) => validParticipant(x, ids)).filter((p): p is Participant => !!p)
  const skipped = d.projects.length - projects.length + (d.participants.length - participants.length)
  return {
    backup: {
      app: 'participant-manager',
      format: BACKUP_FORMAT,
      version: d.version,
      exportedAt: typeof d.exportedAt === 'string' ? d.exportedAt.slice(0, 40) : '',
      projects,
      participants,
    },
    skipped,
  }
}

export async function restoreBackup(b: Backup, mode: 'merge' | 'replace') {
  await db.transaction('rw', db.projects, db.participants, async () => {
    if (mode === 'replace') {
      await db.projects.clear()
      await db.participants.clear()
      await db.projects.bulkAdd(b.projects)
      await db.participants.bulkAdd(b.participants)
      return
    }
    // merge: add what is missing; when a record exists on both sides keep the most recently modified one
    const existingP = new Map((await db.projects.bulkGet(b.projects.map((p) => p.id))).filter(Boolean).map((p) => [p!.id, p!]))
    await db.projects.bulkPut(b.projects.filter((p) => !existingP.has(p.id) || p.updatedAt > existingP.get(p.id)!.updatedAt))
    const existing = new Map((await db.participants.bulkGet(b.participants.map((p) => p.id))).filter(Boolean).map((p) => [p!.id, p!]))
    await db.participants.bulkPut(b.participants.filter((p) => !existing.has(p.id) || p.updatedAt > existing.get(p.id)!.updatedAt))
  })
}
