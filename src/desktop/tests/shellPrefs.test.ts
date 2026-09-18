import { createRequire } from 'node:module'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const requireCjs = createRequire(import.meta.url)
const prefsPath = fileURLToPath(new URL('../../../electron/shellPrefs.cjs', import.meta.url))
const {
  DEFAULT_PREFS,
  HIDDEN_FLAG,
  autoLaunchMechanism,
  autostartDesktopEntry,
  autostartFilePath,
  loginItemSettings,
  normalizePrefs,
  readPrefs,
  shouldKeepInTray,
  writePrefs,
} = requireCjs(prefsPath) as {
  DEFAULT_PREFS: { keepInTray: boolean; autoLaunch: boolean; trayHintShown: boolean }
  HIDDEN_FLAG: string
  autoLaunchMechanism: (platform: string) => string | null
  autostartDesktopEntry: (input: { execPath: string; appImagePath?: string }) => string
  autostartFilePath: (homeDir: string) => string
  loginItemSettings: (enabled: boolean, platform: string) => { openAtLogin: boolean; args?: string[] }
  normalizePrefs: (input: unknown) => typeof DEFAULT_PREFS
  readPrefs: (file: string) => typeof DEFAULT_PREFS
  shouldKeepInTray: (
    prefs: Partial<typeof DEFAULT_PREFS>,
    ctx: { trayAvailable?: boolean; smoke?: boolean },
  ) => boolean
  writePrefs: (file: string, prefs: Partial<typeof DEFAULT_PREFS>) => typeof DEFAULT_PREFS
}

describe('桌面壳偏好', () => {
  it('默认关闭窗口后留在托盘，但不自动开机启动', () => {
    expect(DEFAULT_PREFS.keepInTray).toBe(true)
    expect(DEFAULT_PREFS.autoLaunch).toBe(false)
  })

  it('只接受已知的布尔字段，脏数据一律回落到默认值', () => {
    expect(normalizePrefs({ keepInTray: false, autoLaunch: true })).toMatchObject({
      keepInTray: false,
      autoLaunch: true,
    })
    expect(normalizePrefs({ keepInTray: 'yes', 恶意: true, autoLaunch: null })).toMatchObject({
      keepInTray: DEFAULT_PREFS.keepInTray,
      autoLaunch: DEFAULT_PREFS.autoLaunch,
    })
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS)
  })

  it('落盘后能原样读回，文件损坏时回退默认值', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clauseeye-prefs-'))
    try {
      const file = join(dir, 'nested', 'preferences.json')
      writePrefs(file, { keepInTray: false, autoLaunch: true })
      expect(readPrefs(file)).toMatchObject({ keepInTray: false, autoLaunch: true })

      writeFileSync(file, '{ 这不是 JSON', 'utf8')
      expect(readPrefs(file)).toEqual(DEFAULT_PREFS)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('托盘不可用或冒烟自检时不会真的留驻后台', () => {
    expect(shouldKeepInTray({ keepInTray: true }, { trayAvailable: true })).toBe(true)
    expect(shouldKeepInTray({ keepInTray: true }, { trayAvailable: false })).toBe(false)
    expect(shouldKeepInTray({ keepInTray: true }, { trayAvailable: true, smoke: true })).toBe(false)
    expect(shouldKeepInTray({ keepInTray: false }, { trayAvailable: true })).toBe(false)
  })

  it('各平台的开机自启方式不同', () => {
    expect(autoLaunchMechanism('win32')).toBe('login-item')
    expect(autoLaunchMechanism('darwin')).toBe('login-item')
    expect(autoLaunchMechanism('linux')).toBe('autostart-desktop')
    expect(autoLaunchMechanism('freebsd')).toBeNull()
  })

  it('Windows 登录项带静默启动参数，关闭时清空参数', () => {
    expect(loginItemSettings(true, 'win32')).toEqual({ openAtLogin: true, args: [HIDDEN_FLAG] })
    expect(loginItemSettings(false, 'win32')).toEqual({ openAtLogin: false, args: [] })
    expect(loginItemSettings(true, 'darwin')).toEqual({ openAtLogin: true })
  })

  it('Linux 自启文件指向 AppImage（若有），否则指向可执行文件', () => {
    const entry = autostartDesktopEntry({ execPath: '/opt/ClauseEye/clauseeye', appImagePath: '' })
    expect(entry).toContain('[Desktop Entry]')
    expect(entry).toContain(`Exec="/opt/ClauseEye/clauseeye" ${HIDDEN_FLAG}`)

    const appImage = autostartDesktopEntry({
      execPath: '/tmp/.mount_x/clauseeye',
      appImagePath: '/home/me/Apps/ClauseEye.AppImage',
    })
    expect(appImage).toContain(`Exec="/home/me/Apps/ClauseEye.AppImage" ${HIDDEN_FLAG}`)
    expect(autostartFilePath('/home/me')).toContain(join('.config', 'autostart', 'clauseeye.desktop'))
  })
})
