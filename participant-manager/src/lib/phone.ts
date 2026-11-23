import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max'
import { isIsoCode } from './countries'

/** First number in a cell that may contain several ("+34 600 000 000 / +34 910 000 000"). */
export function firstNumber(raw: string): string {
  const part = raw.split(/\s*(?:[/;|,]|\bor\b|\bo\b|\bou\b)\s*/i).find((p) => /\d{3}/.test(p))
  return (part ?? raw).trim()
}

function prepare(raw: string): string {
  let s = firstNumber(raw)
  // remove extension markers and labels like "Mob:", "Tel." etc.
  s = s.replace(/^[^+\d(]+/, '')
  // international "00" prefix -> "+"
  if (/^00\d/.test(s.replace(/[\s.-]/g, ''))) s = '+' + s.replace(/[\s.-]/g, '').slice(2)
  return s
}

export interface PhoneInfo {
  /** +E.164 normalised number, or '' if it cannot be determined. */
  e164: string
  status: 'empty' | 'valid' | 'possible' | 'invalid'
}

/**
 * Normalises a phone number to E.164. The participant's country is only used as a hint when the number
 * has no international prefix. The original text is never modified: this is only computed for links.
 */
export function phoneInfo(raw: string, countryHint?: string): PhoneInfo {
  if (!raw || !raw.trim()) return { e164: '', status: 'empty' }
  const s = prepare(raw)
  const hint = countryHint && isIsoCode(countryHint) ? (countryHint as CountryCode) : undefined
  const parsed = parsePhoneNumberFromString(s, hint ? { defaultCountry: hint } : undefined)
  if (!parsed) return { e164: '', status: 'invalid' }
  if (parsed.isValid()) return { e164: parsed.number, status: 'valid' }
  if (parsed.isPossible()) return { e164: parsed.number, status: 'possible' }
  return { e164: '', status: 'invalid' }
}

export function telHref(raw: string, countryHint?: string): string | null {
  const { e164 } = phoneInfo(raw, countryHint)
  if (e164) return 'tel:' + e164
  const digits = firstNumber(raw).replace(/[^\d+]/g, '')
  return digits.length >= 5 ? 'tel:' + digits : null
}

/** WhatsApp click-to-chat link. Only produced for numbers we can put in full international format. */
export function whatsappHref(raw: string, countryHint?: string): string | null {
  const { e164 } = phoneInfo(raw, countryHint)
  return e164 ? 'https://wa.me/' + e164.slice(1) : null
}
