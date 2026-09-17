/**
 * 本地保险箱：文档正文、分析结果、BYOK 密钥全部以 AES-GCM 加密后写入 IndexedDB。
 * 服务端不存在任何副本；离线模式下不存在任何网络请求。
 */

import { analyzeDocument } from '../core/analyze'
import { DEFAULT_SETTINGS, type AppSettings, type DocumentRecord } from '../core/types'
import {
  deriveKek,
  exportKey,
  fromBase64,
  generateMasterKey,
  importKey,
  newId,
  open as openSealed,
  randomBytes,
  seal,
  sha256Hex,
  toBase64,
  type Bytes,
  type Sealed,
} from './crypto'
import { keychainBridge } from '../desktop/bridge'
import { clearMeta, clearRecords, deleteRecord, getMeta, getAllRecords, putMeta, putRecord } from './db'

export type VaultStatus = 'uninitialized' | 'locked' | 'unlocked'

export interface VaultMeta {
  version: 1
  createdAt: string
  /** true = 由用户口令保护；false = 无口令模式（密钥随库存储，仅防文件被直接读取） */
  hasPassphrase: boolean
  salt?: string
  wrappedKey?: Sealed
  plainKey?: string
  /** true = 无口令模式下，主密钥由系统钥匙串（DPAPI / Keychain）加密保管 */
  keychain?: boolean
  kdfIterations?: number
  hint?: string
}

interface SealedRow {
  id: string
  sealed: Sealed
  updatedAt: string
}

const META_KEY = 'vault'
const SETTINGS_ID = 'meta:settings'
const DOC_PREFIX = 'doc:'

export interface CreateOptions {
  /** 不传口令则进入"无口令模式"（密钥随库存储） */
  passphrase?: string
  hint?: string
  /** 无口令模式下是否交给系统钥匙串保管（默认尝试） */
  useKeychain?: boolean
}

export class Vault {
  private key: CryptoKey | null = null
  private meta: VaultMeta | null = null
  private docs = new Map<string, DocumentRecord>()
  private settingsValue: AppSettings = structuredClone(DEFAULT_SETTINGS)

  get status(): VaultStatus {
    if (this.key) return 'unlocked'
    return this.meta ? 'locked' : 'uninitialized'
  }

  get vaultMeta(): VaultMeta | null {
    return this.meta
  }

  get settings(): AppSettings {
    return this.settingsValue
  }

  /** 按导入时间倒序 */
  get documents(): DocumentRecord[] {
    return [...this.docs.values()].sort((a, b) => b.importedAt.localeCompare(a.importedAt))
  }

  getDocument(id: string): DocumentRecord | undefined {
    return this.docs.get(id)
  }

  /** 读取本地库状态（不解密任何内容） */
  async load(): Promise<{ status: VaultStatus; meta: VaultMeta | null }> {
    this.meta = (await getMeta<VaultMeta>(META_KEY)) ?? null
    return { status: this.status, meta: this.meta }
  }

  async create(options: CreateOptions = {}): Promise<void> {
    const masterKey = await generateMasterKey()
    const raw = await exportKey(masterKey)
    const meta: VaultMeta = {
      version: 1,
      createdAt: new Date().toISOString(),
      hasPassphrase: Boolean(options.passphrase),
      hint: options.hint,
    }
    if (options.passphrase) {
      const salt = randomBytes(16)
      const kek = await deriveKek(options.passphrase, salt)
      meta.salt = toBase64(salt)
      meta.wrappedKey = await seal(kek, toBase64(raw))
    } else if (options.useKeychain !== false && (await this.storeInKeychain(toBase64(raw)))) {
      meta.keychain = true
    } else {
      meta.plainKey = toBase64(raw)
    }
    this.meta = meta
    this.key = masterKey
    await putMeta(META_KEY, meta)
    await this.saveSettings(DEFAULT_SETTINGS)
  }

  async unlock(passphrase?: string): Promise<void> {
    const meta = this.meta ?? (await getMeta<VaultMeta>(META_KEY)) ?? null
    if (!meta) throw new Error('本地保险箱尚未初始化')
    this.meta = meta

    let raw: Bytes
    if (meta.hasPassphrase) {
      if (!passphrase) throw new Error('该保险箱已设置口令，请输入口令')
      const kek = await deriveKek(passphrase, fromBase64(meta.salt ?? ''), meta.kdfIterations)
      if (!meta.wrappedKey) throw new Error('保险箱元数据损坏（缺少 wrappedKey）')
      raw = fromBase64(await openSealed<string>(kek, meta.wrappedKey))
    } else {
      const fromKeychain = meta.keychain ? await keychainBridge.load() : null
      if (fromKeychain) {
        raw = fromBase64(fromKeychain)
      } else if (meta.plainKey) {
        raw = fromBase64(meta.plainKey)
      } else if (meta.keychain) {
        throw new Error('系统钥匙串里找不到该保险箱的密钥（可能换了系统账号或重装了系统）')
      } else {
        throw new Error('保险箱元数据损坏（缺少密钥）')
      }
      // 老库自动升级：能从明文密钥读出镜像后，改用系统钥匙串保管
      if (!meta.keychain && (await this.storeInKeychain(toBase64(raw)))) void this.markKeychain()
    }

    this.key = await importKey(raw)
    await this.loadAll()
  }

  lock(): void {
    this.key = null
    this.docs.clear()
    this.settingsValue = structuredClone(DEFAULT_SETTINGS)
  }

  /** 写入系统钥匙串；环境不支持或写入失败时返回 false，调用方回退到明文密钥 */
  private async storeInKeychain(rawBase64: string): Promise<boolean> {
    if (!this.settingsValue.useKeychain && this.meta?.keychain !== true) return false
    if (!(await keychainBridge.available())) return false
    return keychainBridge.save(rawBase64)
  }

  /** 把"改用钥匙串保管"写回元数据（失败也不影响本次解锁） */
  private async markKeychain(): Promise<void> {
    if (!this.meta) return
    const next: VaultMeta = { ...this.meta, keychain: true }
    delete next.plainKey
    this.meta = next
    await putMeta(META_KEY, next)
  }

  private requireKey(): CryptoKey {
    if (!this.key) throw new Error('保险箱处于锁定状态')
    return this.key
  }

  private async loadAll(): Promise<void> {
    const key = this.requireKey()
    const rows = await getAllRecords<SealedRow>()
    this.docs.clear()
    for (const row of rows) {
      try {
        if (row.id.startsWith(DOC_PREFIX)) {
          const doc = await openSealed<DocumentRecord>(key, row.sealed)
          this.docs.set(doc.id, doc)
        } else if (row.id === SETTINGS_ID) {
          this.settingsValue = { ...DEFAULT_SETTINGS, ...(await openSealed<AppSettings>(key, row.sealed)) }
        }
      } catch {
        throw new Error('无法解密本地数据：口令/密钥不匹配或数据已损坏。')
      }
    }
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    this.settingsValue = settings
    await this.persist(SETTINGS_ID, settings)
  }

  async putDocument(doc: DocumentRecord): Promise<void> {
    this.docs.set(doc.id, doc)
    await this.persist(DOC_PREFIX + doc.id, doc)
  }

  async deleteDocument(id: string): Promise<void> {
    this.docs.delete(id)
    await deleteRecord(DOC_PREFIX + id)
  }

  private async persist(id: string, value: unknown): Promise<void> {
    const key = this.requireKey()
    const row: SealedRow = { id, sealed: await seal(key, value), updatedAt: new Date().toISOString() }
    await putRecord(row)
  }

  /** 导入文档：解析后的文本直接进入分析管线并加密落盘 */
  async importDocument(input: {
    title: string
    fileName: string
    mimeType: string
    sizeBytes: number
    text: string
    pageCount: number | null
  }): Promise<DocumentRecord> {
    const analysis = analyzeDocument(input.text)
    const doc: DocumentRecord = {
      id: newId('doc'),
      title: input.title,
      category: analysis.category,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      importedAt: new Date().toISOString(),
      sourceHash: await sha256Hex(input.text),
      text: input.text,
      pageCount: input.pageCount,
      analysis,
    }
    await this.putDocument(doc)
    return doc
  }

  async setPassphrase(passphrase: string | null, hint?: string): Promise<void> {
    const key = this.requireKey()
    const raw = await exportKey(key)
    const meta: VaultMeta = { ...(this.meta as VaultMeta), hasPassphrase: Boolean(passphrase), hint }
    if (passphrase) {
      const salt = randomBytes(16)
      const kek = await deriveKek(passphrase, salt)
      meta.salt = toBase64(salt)
      meta.wrappedKey = await seal(kek, toBase64(raw))
      delete meta.plainKey
    } else if (this.settingsValue.useKeychain !== false && (await this.storeInKeychain(toBase64(raw)))) {
      meta.keychain = true
      delete meta.salt
      delete meta.wrappedKey
      delete meta.plainKey
    } else {
      meta.plainKey = toBase64(raw)
      delete meta.salt
      delete meta.wrappedKey
      delete meta.keychain
    }
    this.meta = meta
    await putMeta(META_KEY, meta)
  }

  /** 导出明文备份（不含 BYOK 密钥） */
  async exportBackup(): Promise<string> {
    const settings = { ...this.settingsValue, byok: { ...this.settingsValue.byok, apiKey: '' } }
    return JSON.stringify(
      {
        app: 'ClauseEye',
        exportedAt: new Date().toISOString(),
        schemaVersion: 1,
        note: '该备份为明文，请自行妥善保管；为保证安全未包含 BYOK 密钥。',
        settings,
        documents: this.documents,
      },
      null,
      2,
    )
  }

  async wipe(): Promise<void> {
    this.lock()
    await keychainBridge.clear()
    await clearRecords()
    await clearMeta()
    this.meta = null
  }
}

export const vault = new Vault()


