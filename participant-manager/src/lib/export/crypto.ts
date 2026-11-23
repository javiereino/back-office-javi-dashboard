// Password protection for backups and HTML exports: PBKDF2-SHA256 key derivation + AES-256-GCM (Web Crypto).
export const KDF_ITERATIONS = 600_000

export interface EncryptedEnvelope {
  app: 'participant-manager'
  format: 'pm-encrypted'
  version: 1
  kdf: 'PBKDF2-SHA256'
  iterations: number
  salt: string
  iv: string
  data: string
}

const enc = new TextEncoder()

export function toB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptText(plain: string, password: string): Promise<EncryptedEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt, KDF_ITERATIONS)
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain)))
  return {
    app: 'participant-manager',
    format: 'pm-encrypted',
    version: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: KDF_ITERATIONS,
    salt: toB64(salt),
    iv: toB64(iv),
    data: toB64(data),
  }
}

export class WrongPasswordError extends Error {}

export async function decryptText(env: EncryptedEnvelope, password: string): Promise<string> {
  const iterations = Math.min(Math.max(Number(env.iterations) || 0, 100_000), 5_000_000)
  const key = await deriveKey(password, fromB64(env.salt), iterations)
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) }, key, fromB64(env.data))
    return new TextDecoder().decode(plain)
  } catch {
    throw new WrongPasswordError()
  }
}

export function isEncryptedEnvelope(x: unknown): x is EncryptedEnvelope {
  const e = x as EncryptedEnvelope
  return !!e && e.format === 'pm-encrypted' && typeof e.salt === 'string' && typeof e.iv === 'string' && typeof e.data === 'string'
}
