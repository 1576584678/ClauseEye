import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const requireCjs = createRequire(import.meta.url)
const updaterPath = fileURLToPath(new URL('../../../electron/updater.cjs', import.meta.url))
const { compareVersions, detectUpdaterMode } = requireCjs(updaterPath) as {
  compareVersions: (a: string, b: string) => number
  detectUpdaterMode: (input: { isPackaged: boolean; env?: Record<string, string | undefined> }) => string
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

  it('打包后默认是安装版（可自动更新）', () => {
    expect(detectUpdaterMode({ isPackaged: true, env: {} })).toBe('installer')
  })

  it('electron-builder 注入便携版环境变量后判定为便携版', () => {
    expect(detectUpdaterMode({ isPackaged: true, env: { PORTABLE_EXECUTABLE_DIR: 'C:\\Users\\a\\Temp\\x' } })).toBe(
      'portable',
    )
    expect(detectUpdaterMode({ isPackaged: true, env: { PORTABLE_EXECUTABLE_FILE: 'C:\\x\\a.exe' } })).toBe('portable')
  })
})
