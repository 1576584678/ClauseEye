/**
 * 加密单文件保险箱容器（SQLCipher 等价方案，零原生依赖）。
 *
 * 背景：SQLCipher 需要三平台预编译原生扩展，Tauri 又要换掉渲染壳（IndexedDB / WASM OCR 都会失效）。
 * 折中方案是把"逐记录 AES-256-GCM 加密"保持不变，只把落盘容器从 IndexedDB 换成
 * Electron 内置 Node 的 node:sqlite —— 得到真正的单文件库：
 *   - 文件里只有密文（明文与主密钥都不落盘）、可整文件备份 / 迁移；
 *   - 事务 + WAL，崩溃安全，不怕写一半掉电；
 *   - 不引入任何原生编译产物，三平台与 CI 完全一致。
 *
 * 注意：加密与密钥管理仍在渲染进程（src/storage/crypto.ts + vault.ts），
 * 本模块只负责"把已经加密好的字符串存进单文件"，不接触明文与主密钥。
 */

const fs = require('node:fs')

const SCHEMA = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA synchronous = NORMAL',
  'CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, sealed TEXT NOT NULL, updated_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
].join(';\n')

let availability = null

/** node:sqlite 是否可用（Electron 内置 Node 22.5+ / 24 起自带） */
function isAvailable() {
  if (availability === null) {
    try {
      require('node:sqlite')
      availability = true
    } catch {
      availability = false
    }
  }
  return availability
}

function createVaultStore({ file }) {
  let db = null
  let stmt = null

  function open() {
    if (db && stmt) return db
    const { DatabaseSync } = require('node:sqlite')
    fs.mkdirSync(require('node:path').dirname(file), { recursive: true })
    const opened = new DatabaseSync(file)
    try {
      opened.exec(SCHEMA)
      stmt = {
        putRecord: opened.prepare(
          'INSERT INTO records (id, sealed, updated_at) VALUES (?, ?, ?) ' +
            'ON CONFLICT(id) DO UPDATE SET sealed = excluded.sealed, updated_at = excluded.updated_at',
        ),
        getRecord: opened.prepare('SELECT id, sealed, updated_at FROM records WHERE id = ?'),
        allRecords: opened.prepare('SELECT id, sealed, updated_at FROM records ORDER BY updated_at ASC'),
        deleteRecord: opened.prepare('DELETE FROM records WHERE id = ?'),
        clearRecords: opened.prepare('DELETE FROM records'),
        putMeta: opened.prepare(
          'INSERT INTO meta (key, value) VALUES (?, ?) ' + 'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        ),
        getMeta: opened.prepare('SELECT value FROM meta WHERE key = ?'),
        clearMeta: opened.prepare('DELETE FROM meta'),
        countRecords: opened.prepare('SELECT COUNT(*) AS n FROM records'),
      }
      db = opened
    } catch (error) {
      // 初始化失败必须回滚到未打开状态，否则后续调用会撞上 stmt === null 的 TypeError
      try {
        opened.close()
      } catch {
        /* ignore */
      }
      db = null
      stmt = null
      throw error
    }
    return db
  }

  function toRow(raw) {
    if (!raw) return undefined
    try {
      return { id: raw.id, sealed: JSON.parse(raw.sealed), updatedAt: raw.updated_at }
    } catch {
      // 单条记录损坏不应让整库读取失败
      return undefined
    }
  }

  return {
    putRecord(row) {
      open()
      if (!row || typeof row.id !== 'string' || !row.sealed) throw new Error('记录格式不正确')
      stmt.putRecord.run(row.id, JSON.stringify(row.sealed), String(row.updatedAt || new Date().toISOString()))
      return true
    },
    getRecord(id) {
      open()
      return toRow(stmt.getRecord.get(String(id)))
    },
    getAllRecords() {
      open()
      return stmt.allRecords.all().map(toRow).filter(Boolean)
    },
    deleteRecord(id) {
      open()
      stmt.deleteRecord.run(String(id))
      return true
    },
    clearRecords() {
      open()
      stmt.clearRecords.run()
      return true
    },
    putMeta(key, value) {
      open()
      stmt.putMeta.run(String(key), JSON.stringify(value === undefined ? null : value))
      return true
    },
    getMeta(key) {
      open()
      const row = stmt.getMeta.get(String(key))
      if (!row) return undefined
      try {
        return JSON.parse(row.value)
      } catch {
        return undefined
      }
    },
    clearMeta() {
      open()
      stmt.clearMeta.run()
      return true
    },
    listMetaKeys() {
      open()
      return db.prepare('SELECT key FROM meta').all().map((row) => row.key)
    },
    status() {
      open()
      let bytes = 0
      try {
        bytes = fs.statSync(file).size
      } catch {
        bytes = 0
      }
      return {
        driver: 'sqlite',
        engine: 'node:sqlite',
        file,
        records: Number(stmt.countRecords.get().n),
        bytes,
      }
    },
    close() {
      if (!db) return
      try {
        db.close()
      } catch {
        /* ignore */
      }
      db = null
      stmt = null
    },
  }
}

module.exports = { createVaultStore, isAvailable }
