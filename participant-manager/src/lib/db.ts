import Dexie, { type Table } from 'dexie'
import type { Participant, ParticipantDraft, Project } from './types'
import { uid } from './text'

export interface MetaRow {
  key: string
  value: unknown
}

class PMDatabase extends Dexie {
  projects!: Table<Project, string>
  participants!: Table<Participant, string>
  meta!: Table<MetaRow, string>

  constructor() {
    super('participant-manager')
    this.version(1).stores({
      projects: 'id, name, archived, updatedAt',
      participants: 'id, projectId, country, updatedAt',
      meta: 'key',
    })
  }
}

export const db = new PMDatabase()

// ---------- meta ----------
export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}
export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value })
}

// ---------- projects ----------
export type ProjectInput = Pick<Project, 'name' | 'location' | 'startDate' | 'endDate' | 'description'> &
  Partial<Pick<Project, 'customFields' | 'demo'>>

export async function createProject(input: ProjectInput): Promise<Project> {
  const now = Date.now()
  const project: Project = {
    id: uid(),
    name: input.name,
    location: input.location,
    startDate: input.startDate,
    endDate: input.endDate,
    description: input.description,
    customFields: input.customFields ?? [],
    archived: false,
    demo: input.demo,
    createdAt: now,
    updatedAt: now,
  }
  await db.projects.add(project)
  return project
}

export async function updateProject(id: string, changes: Partial<Project>) {
  await db.projects.update(id, { ...changes, updatedAt: Date.now() })
}

export async function duplicateProject(id: string, newName: string): Promise<Project> {
  return db.transaction('rw', db.projects, db.participants, async () => {
    const src = await db.projects.get(id)
    if (!src) throw new Error('Project not found')
    const now = Date.now()
    const copy: Project = { ...src, id: uid(), name: newName, archived: false, demo: false, createdAt: now, updatedAt: now }
    await db.projects.add(copy)
    const people = await db.participants.where('projectId').equals(id).toArray()
    await db.participants.bulkAdd(
      people.map((p) => ({ ...p, id: uid(), projectId: copy.id, createdAt: now, updatedAt: now })),
    )
    return copy
  })
}

export async function deleteProject(id: string) {
  await db.transaction('rw', db.projects, db.participants, async () => {
    await db.participants.where('projectId').equals(id).delete()
    await db.projects.delete(id)
  })
}

// ---------- participants ----------
export async function addParticipants(projectId: string, drafts: ParticipantDraft[]): Promise<string[]> {
  const now = Date.now()
  const rows: Participant[] = drafts.map((d) => ({ ...d, id: uid(), projectId, createdAt: now, updatedAt: now }))
  await db.participants.bulkAdd(rows)
  await db.projects.update(projectId, { updatedAt: now })
  return rows.map((r) => r.id)
}

export async function updateParticipant(id: string, changes: Partial<ParticipantDraft>) {
  await db.participants.update(id, { ...changes, updatedAt: Date.now() })
}

export async function deleteParticipants(ids: string[]) {
  await db.participants.bulkDelete(ids)
}

export async function moveParticipants(ids: string[], projectId: string) {
  const now = Date.now()
  await db.participants.where('id').anyOf(ids).modify({ projectId, updatedAt: now })
}

export async function copyParticipants(ids: string[], projectId: string) {
  const now = Date.now()
  const rows = await db.participants.bulkGet(ids)
  await db.participants.bulkAdd(
    rows.filter((r): r is Participant => !!r).map((r) => ({ ...r, id: uid(), projectId, createdAt: now, updatedAt: now })),
  )
}

/** Keeps `keepId` with the merged values and deletes the other records. */
export async function mergeParticipants(keepId: string, removeIds: string[], merged: Partial<ParticipantDraft>) {
  await db.transaction('rw', db.participants, async () => {
    await db.participants.update(keepId, { ...merged, updatedAt: Date.now() })
    await db.participants.bulkDelete(removeIds.filter((id) => id !== keepId))
  })
}

export async function clearAllData() {
  await db.transaction('rw', db.projects, db.participants, db.meta, async () => {
    await db.projects.clear()
    await db.participants.clear()
    await db.meta.clear()
  })
}
