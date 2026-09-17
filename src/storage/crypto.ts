/** 本地加密：WebCrypto AES-GCM + PBKDF2（无任何网络依赖，密钥与数据都不离开本机） */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** 显式绑定 ArrayBuffer，避免 SharedArrayBuffer 造成的类型不兼容 */
export type Bytes = Uint8Array<ArrayBuffer>

export interface Sealed {
  v: 1
  /** base64 随机 IV（12 字节） */
  iv: string
  /** base64 密文 */
  ct: string
}

export function randomBytes(length: number): Bytes {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

export function toBase64(bytes: Bytes): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function fromBase64(value: string): Bytes {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export const PBKDF2_ITERATIONS = 250_000

/** 由口令派生密钥加密密钥（KEK） */
export async function deriveKek(passphrase: string, salt: Bytes, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

export async function exportKey(key: CryptoKey): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key))
}

export async function importKey(raw: Bytes): Promise<CryptoKey> {
  const copy = new Uint8Array(raw)
  return crypto.subtle.importKey('raw', copy, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

export async function encryptBytes(key: CryptoKey, data: Bytes): Promise<Sealed> {
  const iv = randomBytes(12)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new Uint8Array(data))
  return { v: 1, iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) }
}

export async function decryptBytes(key: CryptoKey, sealed: Sealed): Promise<Bytes> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(sealed.iv) },
    key,
    fromBase64(sealed.ct),
  )
  return new Uint8Array(plain)
}

export async function seal<T>(key: CryptoKey, value: T): Promise<Sealed> {
  return encryptBytes(key, encoder.encode(JSON.stringify(value)))
}

export async function open<T>(key: CryptoKey, sealed: Sealed): Promise<T> {
  const bytes = await decryptBytes(key, sealed)
  return JSON.parse(decoder.decode(bytes)) as T
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 生成无歧义的短 id（本地使用，不参与任何服务端逻辑） */
export function newId(prefix: string): string {
  const bytes = randomBytes(8)
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${prefix}_${Date.now().toString(36)}${hex}`
}

