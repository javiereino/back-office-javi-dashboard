export interface Project {
  id: string
  name: string
  location: string
  startDate: string // YYYY-MM-DD or ''
  endDate: string
  description: string
  archived: boolean
  /** Names of additional per-project participant fields. */
  customFields: string[]
  demo?: boolean
  createdAt: number
  updatedAt: number
}

export const CORE_FIELDS = [
  'country',
  'firstName',
  'lastName',
  'fullName',
  'jobTitle',
  'organisation',
  'department',
  'email',
  'phone',
  'whatsapp',
  'notes',
] as const

export type CoreField = (typeof CORE_FIELDS)[number]

export interface Participant {
  id: string
  projectId: string
  /** ISO 3166-1 alpha-2 code when the country could be recognised, otherwise ''. */
  country: string
  /** Country exactly as written in the source (kept when it could not be recognised). */
  countryRaw: string
  firstName: string
  lastName: string
  fullName: string
  jobTitle: string
  organisation: string
  department: string
  email: string
  phone: string
  whatsapp: string
  notes: string
  custom: Record<string, string>
  createdAt: number
  updatedAt: number
}

export type ParticipantDraft = Omit<Participant, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>

export function emptyDraft(): ParticipantDraft {
  return {
    country: '',
    countryRaw: '',
    firstName: '',
    lastName: '',
    fullName: '',
    jobTitle: '',
    organisation: '',
    department: '',
    email: '',
    phone: '',
    whatsapp: '',
    notes: '',
    custom: {},
  }
}
