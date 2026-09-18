import { describe, expect, it } from 'vitest'
import type { VaultStoreRow } from '../desktop/bridge'

/** 假的桌面桥接：记录被路由到哪个驱动，并模拟单文件库的读写语义 */
class FakeStore {
  records = new Map<string, VaultStoreRow>()
  meta = new Map<string, unknown>()
  calls: string[] = []

  async status() {
    return {
      available: true,
      driver: 'sqlite' as const,
      engine: 'node:sqlite',
      file: '/tmp/clauseeye/vault.sqlite',
      records: this.records.size,
      bytes: 4096,
    }
  }

  async putRecord(row: VaultStoreRow) {
    this.calls.push('putRecord')
    this.records.set(row.id, row)
    return true
  }

  async getRecord(id: string) {
    this.calls.push('getRecord')
    return this.records.get(id)
  }

  async getAllRecords() {
    this.calls.push('getAllRecords')
    return [...this.records.values()]
  }

  async deleteRecord(id: string) {
    this.calls.push('deleteRecord')
    this.records.delete(id)
    return true
  }

  async clearRecords() {
    this.calls.push('clearRecords')
    this.records.clear()
    return true
  }

  async putMeta(key: string, value: unknown) {
    this.calls.push('putMeta')
    this.meta.set(key, value)
    return true
  }

  async getMeta(key: string) {
    this.calls.push('getMeta')
    return this.meta.get(key)
  }

  async clearMeta() {
    this.calls.push('clearMeta')
    this.meta.clear()
    return true
  }
}

const fake = new FakeStore()
;(globalThis as any).window = { clauseEye: { store: fake } }

const db = await import('./db')

describe('存储驱动：桌面端优先使用单文件加密库', () => {
  it('桥接可用时选中 sqlite 驱动，并写入一次性迁移标记', async () => {
    expect(await db.currentDriver()).toBe('sqlite')
    expect(await db.storeInfo()).toMatchObject({ driver: 'sqlite', file: '/tmp/clauseeye/vault.sqlite' })
    expect(fake.meta.get('store.migratedFromIndexedDb')).toBeTruthy()
  })

  it('记录原语全部路由到单文件库', async () => {
    const row = { id: 'doc:1', sealed: { v: 1, iv: 'aXY=', ct: 'Y3Q=' }, updatedAt: '2026-01-01T00:00:00.000Z' }
    await db.putRecord(row)
    expect(await db.getRecord('doc:1')).toEqual(row)
    expect(await db.getAllRecords()).toEqual([row])
    await db.deleteRecord('doc:1')
    expect(await db.getRecord('doc:1')).toBeUndefined()
    expect(fake.calls).toContain('putRecord')
  })

  it('元数据读写走同一驱动，清空后不残留', async () => {
    await db.putMeta('vault', { version: 1 })
    expect(await db.getMeta('vault')).toEqual({ version: 1 })
    await db.clearRecords()
    await db.clearMeta()
    expect(fake.records.size).toBe(0)
    expect(fake.meta.size).toBe(0)
  })
})
