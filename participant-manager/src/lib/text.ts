// String hygiene shared by the importer, the editor and backup restore.

export const MAX_FIELD = 300
export const MAX_NOTES = 4000

// C0/C1 control characters, zero-width and bidi override characters (used to disguise content).
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤﻿]/g

/** Single-line field: removes control characters, collapses whitespace, trims and limits length. */
export function cleanLine(value: unknown, max = MAX_FIELD): string {
  if (value === null || value === undefined) return ''
  let s = typeof value === 'string' ? value : String(value)
  s = s.normalize('NFC').replace(CONTROL, '').replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, max) : s
}

/** Multi-line field (notes): keeps line breaks. */
export function cleanMultiline(value: unknown, max = MAX_NOTES): string {
  if (value === null || value === undefined) return ''
  let s = typeof value === 'string' ? value : String(value)
  s = s
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return s.length > max ? s.slice(0, max) : s
}

/** Lowercase, accent-free, punctuation-free form used for matching. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@.+]+/g, ' ')
    .trim()
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i
export function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim())
}

export const EMAIL_FIND_RE = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

/** Extracts an email from a cell such as "mailto:x@y.org" or "Ana <x@y.org>". Returns the cleaned cell otherwise. */
export function cleanEmail(value: unknown): string {
  const s = cleanLine(value).replace(/^mailto:/i, '')
  const found = s.match(EMAIL_FIND_RE)
  if (found && found.length >= 1 && found[0].length < s.length) return found[0]
  return s
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function safeFileName(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9-_ ]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'participants'
  )
}
