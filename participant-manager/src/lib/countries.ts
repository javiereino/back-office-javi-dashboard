import { fold } from './text'
import type { Participant } from './types'

// ISO 3166-1 alpha-2 codes (plus XK for Kosovo, widely used in international meetings).
export const ISO_CODES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
  'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
  'UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'
).split(' ')

const ISO_SET = new Set(ISO_CODES)

// Common alternative spellings, abbreviations and alpha-3 codes found in participant lists.
const ALIASES: Record<string, string> = {
  usa: 'US', 'u s a': 'US', us: 'US', 'u s': 'US', eeuu: 'US', 'ee uu': 'US', america: 'US', 'united states of america': 'US',
  'etats unis d amerique': 'US', uk: 'GB', 'u k': 'GB', 'great britain': 'GB', britain: 'GB', england: 'GB', scotland: 'GB',
  wales: 'GB', 'northern ireland': 'GB', 'gran bretana': 'GB', inglaterra: 'GB', 'grande bretagne': 'GB', angleterre: 'GB',
  holland: 'NL', holanda: 'NL', hollande: 'NL', 'the netherlands': 'NL', russia: 'RU', rusia: 'RU', russie: 'RU',
  'south korea': 'KR', 'korea': 'KR', 'republic of korea': 'KR', 'corea del sur': 'KR', 'coree du sud': 'KR', 'north korea': 'KP',
  'czech republic': 'CZ', 'republica checa': 'CZ', 'republique tcheque': 'CZ', 'ivory coast': 'CI', 'cote d ivoire': 'CI',
  'costa de marfil': 'CI', turkey: 'TR', turquia: 'TR', turquie: 'TR', turkiye: 'TR', 'türkiye': 'TR', uae: 'AE', eau: 'AE',
  emiratos: 'AE', 'emiratos arabes': 'AE', 'emirats arabes unis': 'AE', 'macedonia': 'MK', 'fyrom': 'MK', 'north macedonia': 'MK',
  'macedonia del norte': 'MK', 'macedoine du nord': 'MK', 'bosnia': 'BA', 'bosnia herzegovina': 'BA', 'bosnia and herzegovina': 'BA',
  'bosnia y herzegovina': 'BA', 'bosnie herzegovine': 'BA', 'vatican': 'VA', 'holy see': 'VA', 'santa sede': 'VA',
  vaticano: 'VA', 'saint siege': 'VA', 'moldova': 'MD', 'republic of moldova': 'MD', 'cape verde': 'CV', 'cabo verde': 'CV',
  'swaziland': 'SZ', 'burma': 'MM', 'east timor': 'TL', 'timor leste': 'TL', palestine: 'PS', palestina: 'PS',
  'drc': 'CD', 'dr congo': 'CD', 'rd congo': 'CD', 'rdc': 'CD', 'democratic republic of the congo': 'CD', 'congo brazzaville': 'CG',
  'republic of the congo': 'CG', kosovo: 'XK', 'kosova': 'XK', 'taiwan': 'TW', 'iran': 'IR', 'syria': 'SY', 'siria': 'SY',
  'laos': 'LA', 'vietnam': 'VN', 'viet nam': 'VN', 'bolivia': 'BO', 'venezuela': 'VE', 'tanzania': 'TZ', 'brunei': 'BN',
  // alpha-3
  esp: 'ES', fra: 'FR', deu: 'DE', ger: 'DE', ita: 'IT', prt: 'PT', por: 'PT', gbr: 'GB', irl: 'IE', nld: 'NL', bel: 'BE',
  lux: 'LU', che: 'CH', aut: 'AT', pol: 'PL', cze: 'CZ', svk: 'SK', hun: 'HU', rou: 'RO', bgr: 'BG', grc: 'GR', hrv: 'HR',
  svn: 'SI', srb: 'RS', swe: 'SE', nor: 'NO', dnk: 'DK', fin: 'FI', isl: 'IS', est: 'EE', lva: 'LV', ltu: 'LT', ukr: 'UA',
  mar: 'MA', dza: 'DZ', tun: 'TN', egy: 'EG', mex: 'MX', col: 'CO', arg: 'AR', bra: 'BR', chl: 'CL', per: 'PE', ecu: 'EC',
  ury: 'UY', pry: 'PY', can: 'CA', aus: 'AU', nzl: 'NZ', jpn: 'JP', chn: 'CN', ind: 'IN', zaf: 'ZA', nga: 'NG', sen: 'SN',
}

const DISPLAY_LOCALES = ['en', 'es', 'fr', 'de', 'it', 'pt']

let lookup: Map<string, string> | null = null

function buildLookup(): Map<string, string> {
  const map = new Map<string, string>()
  for (const loc of DISPLAY_LOCALES) {
    let dn: Intl.DisplayNames
    try {
      dn = new Intl.DisplayNames([loc], { type: 'region' })
    } catch {
      continue
    }
    for (const code of ISO_CODES) {
      const name = dn.of(code)
      if (!name || name === code) continue
      const k = fold(name)
      if (!map.has(k)) map.set(k, code)
      // "Bosnia & Herzegovina" -> also without "&"; "Congo - Kinshasa" -> both parts
      const simplified = fold(name.replace(/&/g, 'and').replace(/\(.*?\)/g, ''))
      if (simplified && !map.has(simplified)) map.set(simplified, code)
    }
  }
  for (const [k, v] of Object.entries(ALIASES)) map.set(fold(k), v)
  return map
}

/** Resolves a country written in English, Spanish, French (and more), an alias or an ISO code. Returns '' if unknown. */
export function resolveCountry(input: string): string {
  if (!input) return ''
  const raw = input.trim()
  if (/^[A-Za-z]{2}$/.test(raw) && ISO_SET.has(raw.toUpperCase())) {
    // Two-letter cells are only trusted when written in capitals (avoids "es"/"it" words in prose).
    if (raw === raw.toUpperCase()) return raw.toUpperCase()
  }
  if (!lookup) lookup = buildLookup()
  const k = fold(raw)
  if (!k) return ''
  const direct = lookup.get(k)
  if (direct) return direct
  const noParens = fold(raw.replace(/\(.*?\)/g, ''))
  if (noParens && lookup.get(noParens)) return lookup.get(noParens)!
  const noArticle = k.replace(/^(the|la|le|les|el|los|las|l)\s+/, '').replace(/^republic of\s+|^republica de\s+|^republique de\s+|^republique du\s+/, '')
  return lookup.get(noArticle) ?? ''
}

const nameCache = new Map<string, Intl.DisplayNames>()
export function countryName(code: string, lang: string): string {
  if (!code) return ''
  let dn = nameCache.get(lang)
  if (!dn) {
    dn = new Intl.DisplayNames([lang], { type: 'region' })
    nameCache.set(lang, dn)
  }
  try {
    return dn.of(code) ?? code
  } catch {
    return code
  }
}

/** Label shown for a participant's country: localised name if recognised, original text otherwise. */
export function participantCountryLabel(p: Pick<Participant, 'country' | 'countryRaw'>, lang: string): string {
  return p.country ? countryName(p.country, lang) : p.countryRaw
}

/** Key used to group participants by country: same country written differently ends in the same group. */
export function countryGroupKey(p: Pick<Participant, 'country' | 'countryRaw'>): string {
  if (p.country) return p.country
  if (p.countryRaw) return 'raw:' + fold(p.countryRaw)
  return ''
}

export function isIsoCode(code: string): boolean {
  return ISO_SET.has(code)
}

export function allCountries(lang: string): { code: string; name: string }[] {
  const coll = new Intl.Collator(lang, { sensitivity: 'base' })
  return ISO_CODES.map((code) => ({ code, name: countryName(code, lang) }))
    .filter((c) => c.name && c.name !== c.code)
    .sort((a, b) => coll.compare(a.name, b.name))
}
