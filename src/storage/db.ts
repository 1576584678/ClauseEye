/**
 * 低层存储驱动：本机唯一的数据落盘位置，不做任何上传。
 *
 * 桌面端优先使用「加密单文件保险箱」——主进程用 Electron 内置 Node 的 node:sqlite
 * 承载（见 electron/vaultStore.cjs）。写进去的始终是 vault.ts 已经用 AES-256-GCM
 * 加密好的密文，因此这个库文件可以整体备份 / 迁移，且不引入任何原生编译依赖
 * （SQLCipher 需要三平台预编译扩展，属于同一威胁模型的更重替代）。
 *
 * 浏览器预览等拿不到桌面桥接的场景自动退回 IndexedDB；两条路径共用同一套读写原语，
 * 首次切到单文件库时会把旧 IndexedDB 里的记录一次性搬过去。
 */

import { vaultStoreBridge, type VaultStoreRow } from '../desktop/bridge'

const DB_NAME = 'clauseeye'
const DB_VERSION = 1

export const STORE_RECORDS = 'records'
export const STORE_META = 'meta'

/** 迁移标记：写在单文件库里，避免重复搬运 */
const MIGRATION_FLAG = 'store.migratedFromIndexedDb'

export type StoreDriverName = 'sqlite' | 'indexeddb'

let driverPromise: Promise<StoreDriverName> | null = null

/** 当前生效的存储驱动：桌面端 = 单文件加密库，浏览器 = IndexedDB */
export function currentDriver(): Promise<StoreDriverName> {
  if (!driverPromise) {
    driverPromise = (async () => {
      const status = await vaultStoreBridge.status()
      if (!status.available) return 'indexeddb'
      await migrateLegacyIndexedDb()
      return 'sqlite'
    })()
  }
  return driverPromise
}

/** 供设置页 / 冒烟自检展示：驱动名与库文件位置 */
export async function storeInfo(): Promise<{ driver: StoreDriverName; file?: string; records?: number; bytes?: number }> {
  const driver = await currentDriver()
  if (driver === 'indexeddb') return { driver }
  const status = await vaultStoreBridge.status()
  return { driver, file: status.file, records: status.records, bytes: status.bytes }
}

/* ---------------- IndexedDB 原语（浏览器降级路径 + 旧数据来源） ---------------- */

/** 有 IndexedDB 才碰旧库（浏览器预览有；极简运行时没有，此时直接跳过） */
const hasIndexedDb = (): boolean => typeof indexedDB !== 'undefined'

let idbPromise: Promise<IDBDatabase> | null = null

export function openDatabase(): Promise<IDBDatabase> {
  if (idbPromise) return idbPromise
  idbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_RECORDS)) db.createObjectStore(STORE_RECORDS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开本地数据库'))
  })
  return idbPromise
}

function tx<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode)
        const request = fn(transaction.objectStore(storeName))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('本地数据库操作失败'))
      }),
  )
}

const idbPutRecord = <T extends { id: string }>(value: T): Promise<void> =>
  tx(STORE_RECORDS, 'readwrite', (store) => store.put(value) as IDBRequest<IDBValidKey>).then(() => undefined)

const idbGetRecord = <T>(id: string): Promise<T | undefined> =>
  tx<T | undefined>(STORE_RECORDS, 'readonly', (store) => store.get(id) as IDBRequest<T | undefined>)

const idbGetAllRecords = <T>(): Promise<T[]> =>
  tx<T[]>(STORE_RECORDS, 'readonly', (store) => store.getAll() as IDBRequest<T[]>)

const idbDeleteRecord = (id: string): Promise<void> =>
  tx(STORE_RECORDS, 'readwrite', (store) => store.delete(id) as IDBRequest<undefined>).then(() => undefined)

const idbClearRecords = (): Promise<void> =>
  tx(STORE_RECORDS, 'readwrite', (store) => store.clear() as IDBRequest<undefined>).then(() => undefined)

const idbPutMeta = <T>(key: string, value: T): Promise<void> =>
  tx(STORE_META, 'readwrite', (store) => store.put({ key, value }) as IDBRequest<IDBValidKey>).then(() => undefined)

async function idbGetMeta<T>(key: string): Promise<T | undefined> {
  const row = await tx<{ key: string; value: T } | undefined>(
    STORE_META,
    'readonly',
    (store) => store.get(key) as IDBRequest<{ key: string; value: T } | undefined>,
  )
  return row?.value
}

const idbGetAllMeta = (): Promise<{ key: string; value: unknown }[]> =>
  tx<{ key: string; value: unknown }[]>(STORE_META, 'readonly', (store) => store.getAll() as IDBRequest<{ key: string; value: unknown }[]>)

const idbClearMeta = (): Promise<void> =>
  tx(STORE_META, 'readwrite', (store) => store.clear() as IDBRequest<undefined>).then(() => undefined)

/* ---------------- 一次性迁移：IndexedDB → 单文件加密库 ---------------- */

async function migrateLegacyIndexedDb(): Promise<void> {
  try {
    if (await vaultStoreBridge.getMeta(MIGRATION_FLAG)) return
    if (!hasIndexedDb()) {
      await vaultStoreBridge.putMeta(MIGRATION_FLAG, new Date().toISOString())
      return
    }
    const [records, meta] = await Promise.all([idbGetAllRecords<VaultStoreRow>(), idbGetAllMeta()])
    const hasVault = (await vaultStoreBridge.getMeta('vault')) !== undefined
    if (hasVault) {
      // 单文件库里已经有 vault 数据：无法判断旧库中是「已搬完的副本」还是
      // 「上次迁移中途失败后的唯一副本」，因此绝不能清空 IndexedDB，否则可能永久丢数据。
      if (records.length > 0 || meta.length > 0) {
        console.warn(`[vault] 检测到旧 IndexedDB 中仍有 ${records.length} 条记录 / ${meta.length} 条元数据，已保留未清理`)
      }
      await vaultStoreBridge.putMeta(MIGRATION_FLAG, new Date().toISOString())
      return
    }
    for (const row of records) await vaultStoreBridge.putRecord(row)
    for (const row of meta) await vaultStoreBridge.putMeta(row.key, row.value)
    await vaultStoreBridge.putMeta(MIGRATION_FLAG, new Date().toISOString())
    // 只有确认搬运完成后才清空旧库（清除是幂等的），避免中途失败时旧数据被删
    await idbClearRecords()
    await idbClearMeta()
  } catch {
    // 迁移失败不阻塞启动，下次启动重试；期间继续使用单文件库
  }
}

/* ---------------- 对外读写原语（驱动无关） ---------------- */

export async function putRecord<T extends { id: string }>(value: T): Promise<void> {
  if ((await currentDriver()) === 'sqlite') {
    await vaultStoreBridge.putRecord(value as unknown as VaultStoreRow)
    return
  }
  await idbPutRecord(value)
}

export async function getRecord<T>(id: string): Promise<T | undefined> {
  if ((await currentDriver()) === 'sqlite') return (await vaultStoreBridge.getRecord(id)) as T | undefined
  return idbGetRecord<T>(id)
}

export async function getAllRecords<T>(): Promise<T[]> {
  if ((await currentDriver()) === 'sqlite') return (await vaultStoreBridge.getAllRecords()) as T[]
  return idbGetAllRecords<T>()
}

export async function deleteRecord(id: string): Promise<void> {
  if ((await currentDriver()) === 'sqlite') {
    await vaultStoreBridge.deleteRecord(id)
    return
  }
  await idbDeleteRecord(id)
}

/** 清空记录：两条路径都清，确保"清空数据"后本机不残留副本 */
export async function clearRecords(): Promise<void> {
  if ((await currentDriver()) === 'sqlite') await vaultStoreBridge.clearRecords()
  if (hasIndexedDb()) await idbClearRecords()
}

export async function putMeta<T>(key: string, value: T): Promise<void> {
  if ((await currentDriver()) === 'sqlite') {
    await vaultStoreBridge.putMeta(key, value)
    return
  }
  await idbPutMeta(key, value)
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  if ((await currentDriver()) === 'sqlite') return (await vaultStoreBridge.getMeta<T>(key)) as T | undefined
  return idbGetMeta<T>(key)
}

/** 清空元数据：两条路径都清（含迁移标记，避免残留旧库数据） */
export async function clearMeta(): Promise<void> {
  if ((await currentDriver()) === 'sqlite') await vaultStoreBridge.clearMeta()
  if (hasIndexedDb()) await idbClearMeta()
}
