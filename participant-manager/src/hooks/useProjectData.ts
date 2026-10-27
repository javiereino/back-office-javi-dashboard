import * as React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta } from '@/lib/db'
import { countryGroupKey } from '@/lib/countries'
import { findDuplicateGroups, hasEmail, hasPhone, isIncomplete } from '@/lib/participants'
import type { Participant } from '@/lib/types'

export function useParticipants(projectId: string | null): Participant[] | undefined {
  return useLiveQuery(
    (): Promise<Participant[]> => (projectId ? db.participants.where('projectId').equals(projectId).toArray() : Promise.resolve([])),
    [projectId],
  )
}

export const groupSignature = (ids: string[]) => [...ids].sort().join('|')

/** Duplicate groups the user marked as "not duplicates" for this project. */
export function useIgnoredDuplicates(projectId: string | null): string[] {
  return useLiveQuery(() => (projectId ? getMeta<string[]>('dupIgnored:' + projectId) : undefined), [projectId]) ?? []
}

export function useStats(list: Participant[] | undefined, ignored: string[] = []) {
  return React.useMemo(() => {
    if (!list) return null
    const countries = new Set(list.map(countryGroupKey).filter(Boolean))
    const orgs = new Set(list.map((p) => p.organisation.trim().toLowerCase()).filter(Boolean))
    const dups = findDuplicateGroups(list).filter((g) => !ignored.includes(groupSignature(g.ids)))
    return {
      total: list.length,
      countries: countries.size,
      organisations: orgs.size,
      withEmail: list.filter(hasEmail).length,
      withPhone: list.filter(hasPhone).length,
      incomplete: list.filter(isIncomplete).length,
      duplicateGroups: dups,
      duplicates: dups.reduce((n, g) => n + g.ids.length, 0),
    }
  }, [list, ignored])
}
