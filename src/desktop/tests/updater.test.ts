import { createRequire } from 'node:module'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const requireCjs = createRequire(import.meta.url)
const updaterPath = fileURLToPath(new URL('../../../electron/updater.cjs', import.meta.url))
const { compareVersions, detectUpdaterMode, hasUpdateMetadata } = requireCjs(updaterPath) as {
  compareVersions: (a: string, b: string) => number
  hasUpdateMetadata: (resourcesPath?: string) => boolean
  detectUpdaterMode: (input: {
    isPackaged: boolean
    env?: Record<string, string | undefined>
    hasUpdateMetadata?: boolean
  }) => string
}

describe('版本比较（更新判定）', () => {
  it('按数字段比较而不是字符串比较', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1)
    expect(compareVersions('0.9.9', '0.10.0')).toBe(-1)
    expect(compareVersions('1.0.0', '0.99.99')).toBe(1)
  })

  it('忽略 v 前缀', () => {
    expect(compareVersions('v0.2.0', '0.2.0')).toBe(0)
    expect(compareVersions('v0.3.0', 'v0.2.0')).toBe(1)
  })

  it('预发布版比同号正式版更旧（semver 语义）', () => {
    expect(compareVersions('0.2.0-beta.1', '0.2.0')).toBe(-1)
    expect(compareVersions('0.2.0', '0.2.0-beta.1')).toBe(1)
    expect(compareVersions('0.2.1-beta.1', '0.2.0')).toBe(1)
    expect(compareVersions('', '0.2.0')).toBe(-1)
  })
})

describe('更新形态判定', () => {
  it('未打包时是开发模式', () => {
    expect(detectUpdaterMode({ isPackaged: false, env: {} })).toBe('dev')
    expect(detectUpdaterMode({ isPackaged: false, env: { PORTABLE_EXECUTABLE_DIR: 'C:\\tmp' } })).toBe('dev')
  })

  it('只有带更新元数据的安装版才走自动更新', () => {
    expect(detectUpdaterMode({ isPackaged: true, env: {}, hasUpdateMetadata: true })).toBe('installer')
  })

  it('绿色版没有更新元数据，降级为手动更新', () => {
    expect(detectUpdaterMode({ isPackaged: true, env: {}, hasUpdateMetadata: false })).toBe('portable')
    expect(detectUpdaterMode({ isPackaged: true, env: {} })).toBe('portable')
  })

  it('electron-builder 注入便携版环境变量后判定为便携版', () => {
    expect(detectUpdaterMode({ isPackaged: true, env: { PORTABLE_EXECUTABLE_DIR: 'C:\\Users\\a\\Temp\\x' } })).toBe(
      'portable',
    )
    expect(detectUpdaterMode({ isPackaged: true, env: { PORTABLE_EXECUTABLE_FILE: 'C:\\x\\a.exe' } })).toBe('portable')
  })
})

describe('更新元数据探测（安装版专有）', () => {
  it('resources 下没有 app-update.yml 时返回 false', () => {
    expect(hasUpdateMetadata(undefined)).toBe(false)
    expect(hasUpdateMetadata(join(tmpdir(), 'clauseeye-not-exist-' + Date.now()))).toBe(false)
  })

  it('存在 app-update.yml 时返回 true（安装版据此启用自动更新）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clauseeye-appupdate-'))
    try {
      expect(hasUpdateMetadata(dir)).toBe(false)
      writeFileSync(join(dir, 'app-update.yml'), 'provider: github\n')
      expect(hasUpdateMetadata(dir)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
