/**
 * 应用更新（主进程侧）
 *
 * 三种运行形态，能力不同：
 * - installer（NSIS 安装版）：走 electron-updater 全自动更新（检查 → 下载 → 重启安装）
 * - portable（免安装单文件）：无法自我替换，只做"发现新版本 + 打开下载页"的提示
 * - dev（未打包）：用 GitHub API 检查，便于开发时验证提示链路
 *
 * 更新检查是**唯一**会访问自有/第三方服务的网络行为，且只读取版本号与发布说明，
 * 不会上传任何本地数据。设置页可关闭"启动时自动检查"。
 */
const fs = require('node:fs')
const path = require('node:path')

const REPO = { owner: '1576584678', repo: 'ClauseEye' }
const RELEASES_PAGE = `https://github.com/${REPO.owner}/${REPO.repo}/releases/latest`

/**
 * 国内直连 GitHub Releases 常常很慢：这里列出公共加速前缀（第三方服务，可用性随时会变）。
 * 用法是把发布资产的完整直链原样拼接在前缀之后，例如
 *   https://ghproxy.net/https://github.com/<owner>/<repo>/releases/download/v0.6.1/ClauseEye-0.6.1-win-x64-setup.exe
 */
const DOWNLOAD_MIRRORS = [
  { id: 'ghproxy', label: 'ghproxy.net', prefix: 'https://ghproxy.net/' },
  { id: 'ghproxy-com', label: 'gh-proxy.com', prefix: 'https://gh-proxy.com/' },
  { id: 'ghfast', label: 'ghfast.top', prefix: 'https://ghfast.top/' },
]

/** Release 地址前缀：既用于拼直链，也用于校验渲染进程回传的地址 */
const RELEASES_PREFIX = `https://github.com/${REPO.owner}/${REPO.repo}/releases/`

/**
 * 当前平台该下载哪个文件：按优先级给出候选正则。
 * 命名与 .github/workflows/release.yml 里的产物保持一致。
 */
function assetPatterns(platform, arch) {
  if (platform === 'win32') return [/win-x64-setup\.exe$/i, /win-x64-portable\.exe$/i, /green-win-x64\.zip$/i]
  if (platform === 'darwin') {
    return arch === 'arm64'
      ? [/mac-arm64\.dmg$/i, /mac-arm64\.zip$/i]
      : [/mac-x64\.dmg$/i, /mac-x64\.zip$/i]
  }
  if (platform === 'linux') return [/-linux-x86_64\.AppImage$/i, /-linux-amd64\.deb$/i]
  return []
}

/** 从 Release 资产清单里挑出当前平台该下载的文件（纯函数，便于单测） */
function pickPlatformAsset(assets, platform = process.platform, arch = process.arch) {
  const list = Array.isArray(assets) ? assets : []
  for (const pattern of assetPatterns(platform, arch)) {
    const hit = list.find((asset) => asset && typeof asset.name === 'string' && pattern.test(asset.name))
    if (hit) {
      return { name: String(hit.name), url: String(hit.url || ''), size: Number(hit.size) || 0 }
    }
  }
  return null
}

/** 直连 + 各镜像渠道；镜像只是把直链原样拼在前缀后面，不做任何改写 */
function buildDownloadChannels(directUrl) {
  const url = String(directUrl || '')
  if (!url) return []
  return [
    { id: 'github', label: 'GitHub 直连', url },
    ...DOWNLOAD_MIRRORS.map((mirror) => ({ id: mirror.id, label: mirror.label, url: mirror.prefix + url })),
  ]
}

/** 只放行 GitHub Release 地址与白名单镜像拼出来的地址（渲染进程塞不了任意 URL） */
function isAllowedDownloadUrl(url) {
  const value = String(url || '')
  if (value.startsWith(RELEASES_PREFIX)) return true
  return DOWNLOAD_MIRRORS.some((mirror) => value.startsWith(mirror.prefix + RELEASES_PREFIX))
}

/**
 * 版本号比较（够用的 semver 子集）：
 * - 忽略 v 前缀，按数字段比较（0.10 > 0.9）
 * - 带预发布后缀（-beta.1）视为比同号正式版更旧，符合 semver 直觉
 */
function compareVersions(a, b) {
  const split = (value) => {
    const raw = String(value || '').replace(/^v/i, '').trim()
    const [core, ...rest] = raw.split('+')[0].split('-')
    const parts = core.split('.').map((part) => {
      const n = Number.parseInt(part, 10)
      return Number.isFinite(n) ? n : 0
    })
    while (parts.length < 3) parts.push(0)
    return { parts, prerelease: rest.length > 0 }
  }
  const left = split(a)
  const right = split(b)
  const length = Math.max(left.parts.length, right.parts.length)
  for (let i = 0; i < length; i++) {
    const diff = (left.parts[i] || 0) - (right.parts[i] || 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  if (left.prerelease !== right.prerelease) return left.prerelease ? -1 : 1
  return 0
}

function isPortableBuild(env = process.env) {
  return Boolean(env.PORTABLE_EXECUTABLE_DIR || env.PORTABLE_EXECUTABLE_FILE)
}

/** electron-builder 只会在安装版/便携版的 resources 目录下生成 app-update.yml */
function hasUpdateMetadata(resourcesPath) {
  if (!resourcesPath) return false
  try {
    return fs.existsSync(path.join(resourcesPath, 'app-update.yml'))
  } catch {
    return false
  }
}

/**
 * macOS 的自动更新走 Squirrel.Mac，会校验应用签名；没有 Apple Developer ID 的
 * 未签名构建即使带着 app-update.yml 也无法完成更新（会被 Gatekeeper 拒绝）。
 * 故 macOS 一律降级为「提示到发布页下载」；将来接入签名 + 公证后改成 true 即可。
 */
const DARWIN_AUTO_UPDATE_SUPPORTED = false

/** 免安装/绿色版（以及未签名的 macOS 版）无法自我替换，只能提示手动下载 */
function portableReasonMessage(platform) {
  return platform === 'darwin'
    ? '当前 macOS 版本未签名，无法自动更新，请下载新版本替换'
    : '当前是免安装/绿色版，无法自动更新，请下载新版本替换'
}

/**
 * 判定更新形态：
 * - dev：未打包，仅用于验证提示链路
 * - installer：有更新元数据的安装版，可全自动更新
 * - portable：便携版 / 绿色版 / 未签名 macOS 版，只能提示到发布页下载
 */
function detectUpdaterMode({
  isPackaged,
  env = process.env,
  hasUpdateMetadata: hasMeta = false,
  platform = process.platform,
}) {
  if (!isPackaged) return 'dev'
  if (isPortableBuild(env)) return 'portable'
  if (platform === 'darwin' && !DARWIN_AUTO_UPDATE_SUPPORTED) return 'portable'
  return hasMeta ? 'installer' : 'portable'
}

function createUpdater({ app, onEvent }) {
  const currentVersion = app.getVersion()
  const mode = detectUpdaterMode({
    isPackaged: app.isPackaged,
    env: process.env,
    // 绿色版/便携版没有 app-update.yml，只能提示手动下载
    hasUpdateMetadata: hasUpdateMetadata(process.resourcesPath),
  })

  let state = {
    mode,
    state: 'idle',
    currentVersion,
    version: null,
    percent: 0,
    message: '',
    downloadPage: RELEASES_PAGE,
    checkedAt: null,
  }

  const publish = (patch) => {
    state = { ...state, ...patch }
    try {
      onEvent(state)
    } catch {
      /* ignore */
    }
    return state
  }

  /** 便携版/开发模式：只查版本，不下载 */
  async function checkViaApi() {
    publish({ state: 'checking', message: '' })
    try {
      const response = await fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.repo}/releases/latest`, {
        headers: { 'User-Agent': `ClauseEye/${currentVersion}`, Accept: 'application/vnd.github+json' },
      })
      if (!response.ok) throw new Error(`GitHub API 返回 ${response.status}`)
      const data = await response.json()
      const latest = String(data.tag_name || '').replace(/^v/i, '')
      const page = typeof data.html_url === 'string' && data.html_url ? data.html_url : RELEASES_PAGE
      const checkedAt = new Date().toISOString()
      if (!latest) throw new Error('发布信息里没有版本号')
      if (compareVersions(latest, currentVersion) > 0) {
        return publish({
          state: 'available',
          version: latest,
          downloadPage: page,
          checkedAt,
          message: mode === 'portable' ? portableReasonMessage(process.platform) : '',
        })
      }
      return publish({ state: 'latest', version: latest, downloadPage: page, checkedAt, message: '' })
    } catch (error) {
      return publish({
        state: 'error',
        checkedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  let autoUpdater = null
  function ensureAutoUpdater() {
    if (autoUpdater) return autoUpdater
    autoUpdater = require('electron-updater').autoUpdater
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => publish({ state: 'checking', message: '' }))
    autoUpdater.on('update-available', (info) =>
      publish({
        state: 'available',
        version: String(info && info.version ? info.version : ''),
        checkedAt: new Date().toISOString(),
        message: '',
      }),
    )
    autoUpdater.on('update-not-available', () =>
      publish({ state: 'latest', checkedAt: new Date().toISOString(), message: '' }),
    )
    autoUpdater.on('download-progress', (progress) =>
      publish({
        state: 'downloading',
        percent: Math.max(0, Math.min(100, Math.round(progress && progress.percent ? progress.percent : 0))),
      }),
    )
    autoUpdater.on('update-downloaded', (info) =>
      publish({
        state: 'downloaded',
        version: String(info && info.version ? info.version : state.version || ''),
        percent: 100,
        message: '',
      }),
    )
    autoUpdater.on('error', (error) =>
      publish({ state: 'error', message: error instanceof Error ? error.message : String(error) }),
    )
    return autoUpdater
  }

  async function check() {
    if (mode === 'installer') {
      publish({ state: 'checking', message: '' })
      try {
        await ensureAutoUpdater().checkForUpdates()
        return state
      } catch (error) {
        return publish({
          state: 'error',
          checkedAt: new Date().toISOString(),
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return checkViaApi()
  }

  async function download() {
    if (mode !== 'installer') {
      return publish({ state: 'available', message: '当前为免安装版，请下载新版本替换' })
    }
    try {
      publish({ state: 'downloading', percent: 0 })
      await ensureAutoUpdater().downloadUpdate()
      return state
    } catch (error) {
      return publish({ state: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  function install() {
    if (mode !== 'installer') return false
    try {
      ensureAutoUpdater()
      setImmediate(() => autoUpdater.quitAndInstall())
      return true
    } catch {
      return false
    }
  }

  let releaseCache = { at: 0, value: null }

  /** 拉取最新 Release 的资产清单（10 分钟缓存，匿名 API 限流友好） */
  async function latestReleaseAssets() {
    const now = Date.now()
    if (releaseCache.value && now - releaseCache.at < 10 * 60 * 1000) return releaseCache.value
    const response = await fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.repo}/releases/latest`, {
      headers: { 'User-Agent': `ClauseEye/${currentVersion}`, Accept: 'application/vnd.github+json' },
    })
    if (!response.ok) throw new Error(`GitHub API 返回 ${response.status}`)
    const data = await response.json()
    const value = {
      version: String(data.tag_name || '').replace(/^v/i, ''),
      page: typeof data.html_url === 'string' && data.html_url ? data.html_url : RELEASES_PAGE,
      assets: Array.isArray(data.assets)
        ? data.assets.map((asset) => ({
            name: String(asset && asset.name ? asset.name : ''),
            url: String(asset && asset.browser_download_url ? asset.browser_download_url : ''),
            size: Number(asset && asset.size ? asset.size : 0) || 0,
          }))
        : [],
    }
    releaseCache = { at: now, value }
    return value
  }

  /**
   * 「下载加速」用：挑出当前平台该下载的文件，给出直连与镜像渠道。
   * 网络或限流失败时只返回发布页兜底，不影响更新检查本身。
   */
  async function links() {
    try {
      const release = await latestReleaseAssets()
      const asset = pickPlatformAsset(release.assets, process.platform, process.arch)
      return {
        version: release.version || state.version || null,
        page: release.page,
        asset,
        channels: buildDownloadChannels(asset ? asset.url : ''),
        message: '',
      }
    } catch (error) {
      return {
        version: state.version || null,
        page: RELEASES_PAGE,
        asset: null,
        channels: [],
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return {
    get state() {
      return state
    },
    /** 供冒烟自检使用：当前构建形态与版本 */
    meta: () => ({
      mode,
      currentVersion,
      downloadPage: RELEASES_PAGE,
      userData: path.basename(app.getPath('userData')),
    }),
    check,
    download,
    install,
    links,
    compareVersions,
  }
}

module.exports = {
  createUpdater,
  compareVersions,
  detectUpdaterMode,
  hasUpdateMetadata,
  isPortableBuild,
  portableReasonMessage,
  pickPlatformAsset,
  buildDownloadChannels,
  isAllowedDownloadUrl,
  DOWNLOAD_MIRRORS,
  RELEASES_PAGE,
}
