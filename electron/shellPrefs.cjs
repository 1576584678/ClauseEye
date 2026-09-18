/**
 * 桌面壳的「后台行为」偏好。
 *
 * 为什么不放进加密保险箱：窗口关闭时渲染进程可能还没解锁（甚至还没加载），
 * 主进程必须能独立判断"该不该退到托盘"，因此这里单独存一份明文开关
 * （只有布尔值，没有任何文档内容与密钥）。
 *
 * 存放位置：<userData>/preferences.json
 */
const fs = require('node:fs')
const path = require('node:path')

/** 默认：关闭窗口时留在托盘（提醒才能按时弹出），但不自动开机启动 */
const DEFAULT_PREFS = {
  keepInTray: true,
  autoLaunch: false,
  /** 是否已经提示过"关闭窗口不是退出"，只提示一次 */
  trayHintShown: false,
}

const BOOLEAN_KEYS = ['keepInTray', 'autoLaunch', 'trayHintShown']

/** 只保留已知的布尔字段，其余一律丢弃（防止配置文件被手工改坏） */
function normalizePrefs(input) {
  const source = input && typeof input === 'object' ? input : {}
  const out = { ...DEFAULT_PREFS }
  for (const key of BOOLEAN_KEYS) {
    if (typeof source[key] === 'boolean') out[key] = source[key]
  }
  return out
}

function readPrefs(file) {
  try {
    return normalizePrefs(JSON.parse(fs.readFileSync(file, 'utf8')))
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

function writePrefs(file, prefs) {
  const normalized = normalizePrefs(prefs)
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(normalized, null, 2) + '\n', 'utf8')
  } catch {
    /* 写不进去时只在本次会话内生效，不影响使用 */
  }
  return normalized
}

/**
 * 开机自启的实现方式：
 * - win32 / darwin：系统登录项（app.setLoginItemSettings）
 * - linux：写 ~/.config/autostart/*.desktop（AppImage / deb 都适用）
 */
function autoLaunchMechanism(platform) {
  if (platform === 'win32' || platform === 'darwin') return 'login-item'
  if (platform === 'linux') return 'autostart-desktop'
  return null
}

/** 自启时静默启动（不弹主窗口，只留托盘） */
const HIDDEN_FLAG = '--hidden'

/** 登录项参数：Windows 支持带参数，macOS 由系统管理，不传 */
function loginItemSettings(enabled, platform) {
  const settings = { openAtLogin: Boolean(enabled) }
  if (platform === 'win32') settings.args = enabled ? [HIDDEN_FLAG] : []
  return settings
}

/** Linux 自启 .desktop 文件内容（纯函数，便于单测） */
function autostartDesktopEntry({ execPath, appImagePath }) {
  // AppImage 场景下真正可执行的是 AppImage 文件本身；deb / 解包运行时用 electron 可执行文件
  const target = appImagePath && String(appImagePath).trim() ? String(appImagePath) : String(execPath)
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=ClauseEye',
    'Comment=本地优先的合同与证明文档管家',
    `Exec="${target}" ${HIDDEN_FLAG}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n')
}

function autostartFilePath(homeDir) {
  return path.join(homeDir, '.config', 'autostart', 'clauseeye.desktop')
}

/** 是否真的退到托盘：需要用户开启 + 托盘可用 + 冒烟自检时强制关闭 */
function shouldKeepInTray(prefs, { trayAvailable, smoke } = {}) {
  if (smoke) return false
  if (!trayAvailable) return false
  return normalizePrefs(prefs).keepInTray
}

module.exports = {
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
}
