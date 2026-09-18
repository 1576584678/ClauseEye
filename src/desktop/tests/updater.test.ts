import { createRequire } from 'node:module'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const requireCjs = createRequire(import.meta.url)
const updaterPath = fileURLToPath(new URL('../../../electron/updater.cjs', import.meta.url))
const {
  compareVersions,
  detectUpdaterMode,
  hasUpdateMetadata,
  portableReasonMessage,
  pickPlatformAsset,
  buildDownloadChannels,
  isAllowedDownloadUrl,
} = requireCjs(updaterPath) as {
  compareVersions: (a: string, b: string) => number
  hasUpdateMetadata: (resourcesPath?: string) => boolean
  detectUpdaterMode: (input: {
    isPackaged: boolean
    env?: Record<string, string | undefined>
    hasUpdateMetadata?: boolean
    platform?: string
  }) => string
  portableReasonMessage: (platform?: string) => string
  pickPlatformAsset: (
    assets: { name: string; url: string; size: number }[],
    platform?: string,
    arch?: string,
  ) => { name: string; url: string; size: number } | null
  buildDownloadChannels: (directUrl?: string) => { id: string; label: string; url: string }[]
  isAllowedDownloadUrl: (url?: string) => boolean
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
    expect(detectUpdaterMode({ isPackaged: false, env: {}, platform: 'win32' })).toBe('dev')
    expect(detectUpdaterMode({ isPackaged: false, env: { PORTABLE_EXECUTABLE_DIR: 'C:\\tmp' }, platform: 'win32' })).toBe('dev')
  })

  it('只有带更新元数据的安装版才走自动更新', () => {
    expect(detectUpdaterMode({ isPackaged: true, env: {}, hasUpdateMetadata: true, platform: 'win32' })).toBe('installer')
  })

  it('绿色版没有更新元数据，降级为手动更新', () => {
    expect(detectUpdaterMode({ isPackaged: true, env: {}, hasUpdateMetadata: false, platform: 'win32' })).toBe('portable')
    expect(detectUpdaterMode({ isPackaged: true, env: {}, platform: 'win32' })).toBe('portable')
  })

  it('electron-builder 注入便携版环境变量后判定为便携版', () => {
    expect(detectUpdaterMode({ isPackaged: true, env: { PORTABLE_EXECUTABLE_DIR: 'C:\\Users\\a\\Temp\\x' }, platform: 'win32' })).toBe(
      'portable',
    )
    expect(detectUpdaterMode({ isPackaged: true, env: { PORTABLE_EXECUTABLE_FILE: 'C:\\x\\a.exe' }, platform: 'win32' })).toBe('portable')
  })

  it('macOS 未签名构建降级为手动更新（Squirrel.Mac 要求签名）', () => {
    expect(
      detectUpdaterMode({ isPackaged: true, env: {}, hasUpdateMetadata: true, platform: 'darwin' }),
    ).toBe('portable')
  })

  it('Windows / Linux 有更新元数据时仍走自动更新', () => {
    expect(detectUpdaterMode({ isPackaged: true, env: {}, hasUpdateMetadata: true, platform: 'win32' })).toBe(
      'installer',
    )
    expect(detectUpdaterMode({ isPackaged: true, env: {}, hasUpdateMetadata: true, platform: 'linux' })).toBe(
      'installer',
    )
  })

  it('免安装提示语需区分 macOS 与 Windows', () => {
    expect(portableReasonMessage('darwin')).toContain('macOS')
    expect(portableReasonMessage('win32')).toContain('免安装')
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
describe('下载加速（国内镜像渠道）', () => {
  const direct = 'https://github.com/1576584678/ClauseEye/releases/download/v0.6.1/ClauseEye-0.6.1-win-x64-setup.exe'
  const assets = [
    { name: 'ClauseEye-0.6.1-win-x64-portable.exe', url: 'https://example.com/portable', size: 10 },
    { name: 'ClauseEye-0.6.1-win-x64-setup.exe', url: direct, size: 20 },
    { name: 'ClauseEye-green-win-x64.zip', url: 'https://example.com/green', size: 30 },
  ]

  it('Windows 优先挑安装版，其次便携版，最后绿色版', () => {
    expect(pickPlatformAsset(assets, 'win32', 'x64')?.name).toBe('ClauseEye-0.6.1-win-x64-setup.exe')
    expect(pickPlatformAsset(assets.slice(0, 1).concat(assets[2]), 'win32', 'x64')?.name).toBe(
      'ClauseEye-0.6.1-win-x64-portable.exe',
    )
    expect(pickPlatformAsset([assets[2]], 'win32', 'x64')?.name).toBe('ClauseEye-green-win-x64.zip')
  })

  it('macOS 按芯片架构分别挑 dmg', () => {
    const mac = [
      { name: 'ClauseEye-0.6.1-mac-arm64.dmg', url: 'https://example.com/arm', size: 1 },
      { name: 'ClauseEye-0.6.1-mac-x64.dmg', url: 'https://example.com/x64', size: 1 },
    ]
    expect(pickPlatformAsset(mac, 'darwin', 'arm64')?.name).toBe('ClauseEye-0.6.1-mac-arm64.dmg')
    expect(pickPlatformAsset(mac, 'darwin', 'x64')?.name).toBe('ClauseEye-0.6.1-mac-x64.dmg')
  })

  it('Linux 优先 AppImage，其次 deb；没有匹配时返回 null', () => {
    const linux = [
      { name: 'ClauseEye-0.6.1-linux-amd64.deb', url: 'https://example.com/deb', size: 1 },
      { name: 'ClauseEye-0.6.1-linux-x86_64.AppImage', url: 'https://example.com/appimage', size: 1 },
    ]
    expect(pickPlatformAsset(linux, 'linux', 'x64')?.name).toBe('ClauseEye-0.6.1-linux-x86_64.AppImage')
    expect(pickPlatformAsset([linux[0]], 'linux', 'x64')?.name).toBe('ClauseEye-0.6.1-linux-amd64.deb')
    expect(pickPlatformAsset([], 'linux', 'x64')).toBe(null)
  })

  it('渠道 = 直连 + 三个镜像前缀，且镜像只是原样拼接直链', () => {
    const channels = buildDownloadChannels(direct)
    expect(channels[0]).toEqual({ id: 'github', label: 'GitHub 直连', url: direct })
    expect(channels.map((channel) => channel.id)).toEqual(['github', 'ghproxy', 'ghproxy-com', 'ghfast'])
    expect(channels[1].url).toBe('https://ghproxy.net/' + direct)
    expect(channels[3].url).toBe('https://ghfast.top/' + direct)
    expect(buildDownloadChannels('')).toEqual([])
  })

  it('只放行 Release 直链与白名单镜像，其它一律拒绝', () => {
    expect(isAllowedDownloadUrl(direct)).toBe(true)
    expect(isAllowedDownloadUrl('https://github.com/1576584678/ClauseEye/releases/latest')).toBe(true)
    expect(isAllowedDownloadUrl('https://ghproxy.net/' + direct)).toBe(true)
    expect(isAllowedDownloadUrl('https://ghfast.top/' + direct)).toBe(true)
    expect(isAllowedDownloadUrl('https://evil.example.com/' + direct)).toBe(false)
    expect(isAllowedDownloadUrl('https://ghproxy.net/https://evil.example.com/x.exe')).toBe(false)
    expect(isAllowedDownloadUrl('file:///C:/Windows/System32/calc.exe')).toBe(false)
    expect(isAllowedDownloadUrl('')).toBe(false)
  })
})
