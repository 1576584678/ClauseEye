/** IndexedDB 低层封装：本机唯一的数据落盘位置，不做任何上传。 */

const DB_NAME = 'clauseeye'
const DB_VERSION = 1

export const STORE_RECORDS = 'records'
export const STORE_META = 'meta'

let dbPromise: Promise<IDBDatabase> | null = null

export function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_RECORDS)) db.createObjectStore(STORE_RECORDS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开本地数据库'))
  })
  return dbPromise
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

export function putRecord<T extends { id: string }>(value: T): Promise<void> {
  return tx(STORE_RECORDS, 'readwrite', (store) => store.put(value) as IDBRequest<IDBValidKey>).then(() => undefined)
}

export function getRecord<T>(id: string): Promise<T | undefined> {
  return tx<T | undefined>(STORE_RECORDS, 'readonly', (store) => store.get(id) as IDBRequest<T | undefined>)
}

export function getAllRecords<T>(): Promise<T[]> {
  return tx<T[]>(STORE_RECORDS, 'readonly', (store) => store.getAll() as IDBRequest<T[]>)
}

export function deleteRecord(id: string): Promise<void> {
  return tx(STORE_RECORDS, 'readwrite', (store) => store.delete(id) as IDBRequest<undefined>).then(() => undefined)
}

export function clearRecords(): Promise<void> {
  return tx(STORE_RECORDS, 'readwrite', (store) => store.clear() as IDBRequest<undefined>).then(() => undefined)
}

export function putMeta<T>(key: string, value: T): Promise<void> {
  return tx(STORE_META, 'readwrite', (store) => store.put({ key, value }) as IDBRequest<IDBValidKey>).then(() => undefined)
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await tx<{ key: string; value: T } | undefined>(STORE_META, 'readonly', (store) => store.get(key) as IDBRequest<{ key: string; value: T } | undefined>)
  return row?.value
}

export function clearMeta(): Promise<void> {
  return tx(STORE_META, 'readwrite', (store) => store.clear() as IDBRequest<undefined>).then(() => undefined)
}
