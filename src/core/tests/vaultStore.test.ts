import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createVaultStore, isAvailable } = require('../../../electron/vaultStore.cjs')

const dirs: string[] = []
function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'clauseeye-store-'))
  dirs.push(dir)
  return join(dir, 'vault.sqlite')
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// CI 的 Node 22 需要 --experimental-sqlite 才带 node:sqlite，Electron 44（Node 24）自带
describe.skipIf(!isAvailable())('加密单文件库（node:sqlite）', () => {
  it('记录可写入、读回、删除、清空', () => {
    const file = tempFile()
    const store = createVaultStore({ file })

    store.putRecord({ id: 'doc:1', sealed: { v: 1, iv: 'aXY=', ct: 'Y3Q=' }, updatedAt: '2026-01-01T00:00:00.000Z' })
    store.putRecord({ id: 'doc:2', sealed: { v: 1, iv: 'aXY=', ct: 'Y3Q=' }, updatedAt: '2026-01-02T00:00:00.000Z' })

    expect(store.getRecord('doc:1')).toEqual({
      id: 'doc:1',
      sealed: { v: 1, iv: 'aXY=', ct: 'Y3Q=' },
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(store.getAllRecords().map((row: { id: string }) => row.id)).toEqual(['doc:1', 'doc:2'])

    store.deleteRecord('doc:1')
    expect(store.getRecord('doc:1')).toBeUndefined()

    store.clearRecords()
    expect(store.getAllRecords()).toEqual([])
    expect(store.status().records).toBe(0)
    store.close()
  })

  it('元数据（保险箱头部信息）可读写，缺失键返回 undefined', () => {
    const store = createVaultStore({ file: tempFile() })
    expect(store.getMeta('vault')).toBeUndefined()

    store.putMeta('vault', { version: 1, hasPassphrase: true, salt: 'c2FsdA==' })
    expect(store.getMeta('vault')).toEqual({ version: 1, hasPassphrase: true, salt: 'c2FsdA==' })

    store.clearMeta()
    expect(store.getMeta('vault')).toBeUndefined()
    store.close()
  })

  it('落盘内容与会话无关：换一个实例仍能读到（单文件 + 事务）', () => {
    const file = tempFile()
    const first = createVaultStore({ file })
    first.putRecord({ id: 'doc:keep', sealed: { v: 1, iv: 'aXY=', ct: 'Y3Q=' }, updatedAt: '2026-01-01T00:00:00.000Z' })
    first.close()

    const second = createVaultStore({ file })
    expect(second.getRecord('doc:keep')?.sealed).toEqual({ v: 1, iv: 'aXY=', ct: 'Y3Q=' })
    expect(second.status()).toMatchObject({ driver: 'sqlite', records: 1 })
    second.close()

    expect(existsSync(file)).toBe(true)
    // 库里只有调用方给的密文载荷，容器自己不做加解密
    expect(readFileSync(file, 'latin1')).toContain('Y3Q=')
  })
})
