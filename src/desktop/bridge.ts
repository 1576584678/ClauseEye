/**
 * 桌面端能力桥接（Electron 预加载脚本暴露的窄接口）
 *
 * 同一份前端代码要同时跑在浏览器和桌面壳里，因此这里做统一的"能力探测 + 降级"：
 * 浏览器里所有能力都返回不可用，调用方据此给出提示文案。
 */

export interface DesktopNotice {
  /** 通知去重键，主进程只负责展示，去重由渲染进程负责 */
  noticeKey: string
  title: string
  body: string
  docId: string
}

/** 更新状态（主进程 updater 的状态机快照） */
export interface UpdateState {
  /** installer = 安装版可自动更新；portable = 免安装版只能提示下载；dev = 开发模式 */
  mode: 'installer' | 'portable' | 'dev' | 'unknown'
  state: 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'downloaded' | 'error'
  currentVersion: string
  version: string | null
  percent: number
  message: string
  downloadPage: string
  checkedAt: string | null
}

/** 下载加速渠道：直连 GitHub 或经第三方公共代理前缀转发 */
export interface DownloadChannel {
  id: string
  label: string
  url: string
}

/** 当前平台该下载的文件 + 各下载渠道（主进程按 Release 资产清单挑选） */
export interface DownloadLinks {
  version: string | null
  page: string
  asset: { name: string; url: string; size: number } | null
  channels: DownloadChannel[]
  message?: string
}

/** 桌面壳行为偏好（托盘常驻 / 开机自启），由主进程持久化 */
export interface ShellPrefs {
  /** 关闭窗口时留在托盘继续运行（提醒依赖应用常驻） */
  keepInTray: boolean
  /** 开机自动启动（静默启动到托盘） */
  autoLaunch: boolean
  /** 当前系统托盘是否可用 */
  trayAvailable: boolean
  /** 当前系统是否支持开机自启 */
  autoLaunchSupported: boolean
  platform: string
}

/** 加密单文件保险箱（主进程 node:sqlite）的状态与读写接口 */
export interface VaultStoreStatus {
  available: boolean
  driver?: 'sqlite'
  engine?: string
  /** 单文件库的绝对路径（便于备份 / 迁移） */
  file?: string
  records?: number
  bytes?: number
  reason?: string
}

export interface VaultStoreRow {
  id: string
  /** vault.ts 加密后的密文（结构由 src/storage/crypto.ts 定义） */
  sealed: unknown
  updatedAt: string
}

export interface OcrResult {
  ok: boolean
  text?: string
  confidence?: number
  error?: string
}

interface ClauseEyeBridge {
  desktop: true
  version: string
  platform: string
  reminders: {
    supported: () => Promise<boolean>
    notify: (notice: DesktopNotice) => Promise<boolean>
    test: () => Promise<boolean>
    onOpenDocument: (handler: (docId: string) => void) => () => void
  }
  keychain: {
    available: () => Promise<boolean>
    save: (value: string) => Promise<boolean>
    load: () => Promise<string | null>
    clear: () => Promise<boolean>
  }
  store: {
    status: () => Promise<VaultStoreStatus>
    putRecord: (row: VaultStoreRow) => Promise<boolean>
    getRecord: (id: string) => Promise<VaultStoreRow | undefined>
    getAllRecords: () => Promise<VaultStoreRow[]>
    deleteRecord: (id: string) => Promise<boolean>
    clearRecords: () => Promise<boolean>
    putMeta: (key: string, value: unknown) => Promise<boolean>
    getMeta: (key: string) => Promise<unknown>
    clearMeta: () => Promise<boolean>
  }
  ocr: {
    available: () => Promise<boolean>
    recognize: (dataUrl: string, langs?: string[]) => Promise<OcrResult>
  }
  shell: {
    prefs: () => Promise<ShellPrefs>
    setPrefs: (patch: Partial<ShellPrefs>) => Promise<ShellPrefs>
    showWindow: () => Promise<boolean>
    onPrefs: (handler: (prefs: ShellPrefs) => void) => () => void
  }
  updater: {
    status: () => Promise<UpdateState>
    check: () => Promise<UpdateState | null>
    download: () => Promise<UpdateState | null>
    install: () => Promise<boolean>
    openDownloadPage: (url?: string) => Promise<boolean>
    links: () => Promise<DownloadLinks | null>
    onEvent: (handler: (state: UpdateState) => void) => () => void
    onOpenSettings: (handler: () => void) => () => void
  }
}

declare global {
  interface Window {
    clauseEye?: ClauseEyeBridge
  }
}

export function getBridge(): ClauseEyeBridge | null {
  if (typeof window === 'undefined') return null
  return window.clauseEye ?? null
}

export const isDesktop = (): boolean => getBridge() !== null

/** 系统通知：桌面壳可用；浏览器里降级为页面内提示 */
export const reminderBridge = {
  async supported(): Promise<boolean> {
    const bridge = getBridge()
    if (!bridge) return false
    try {
      return await bridge.reminders.supported()
    } catch {
      return false
    }
  },
  async notify(notice: DesktopNotice): Promise<boolean> {
    const bridge = getBridge()
    if (!bridge) return false
    try {
      return await bridge.reminders.notify(notice)
    } catch {
      return false
    }
  },
  async test(): Promise<boolean> {
    const bridge = getBridge()
    if (!bridge) return false
    try {
      return await bridge.reminders.test()
    } catch {
      return false
    }
  },
  onOpenDocument(handler: (docId: string) => void): () => void {
    const bridge = getBridge()
    if (!bridge) return () => undefined
    try {
      return bridge.reminders.onOpenDocument(handler)
    } catch {
      return () => undefined
    }
  },
}

/** 系统钥匙串：用于加密保存"无口令模式"下的保险箱主密钥 */
export const keychainBridge = {
  async available(): Promise<boolean> {
    const bridge = getBridge()
    if (!bridge) return false
    try {
      return await bridge.keychain.available()
    } catch {
      return false
    }
  },
  async save(value: string): Promise<boolean> {
    const bridge = getBridge()
    if (!bridge) return false
    try {
      return await bridge.keychain.save(value)
    } catch {
      return false
    }
  },
  /**
   * 读取钥匙串中保存的主密钥。
   * 返回 `null` 只表示「桥接不可用」或「确实没有保存过密钥」；
   * 读取过程出错会抛出，避免调用方把「读失败」误判成「无密钥」而重建主密钥、导致既有保险箱永久无法解密。
   */
  async load(): Promise<string | null> {
    const bridge = getBridge()
    if (!bridge) return null
    try {
      return await bridge.keychain.load()
    } catch (error) {
      throw new Error(`读取系统钥匙串失败：${error instanceof Error ? error.message : String(error)}`)
    }
  },
  async clear(): Promise<boolean> {
    const bridge = getBridge()
    if (!bridge) return false
    try {
      return await bridge.keychain.clear()
    } catch {
      return false
    }
  },
}

/** 浏览器里没有托盘与开机自启，全部降级为不可用 */
const WEB_SHELL_PREFS: ShellPrefs = {
  keepInTray: false,
  autoLaunch: false,
  trayAvailable: false,
  autoLaunchSupported: false,
  platform: 'web',
}

/** 桌面壳行为：托盘常驻 + 开机自启（网页版一律返回不可用） */
export const shellBridge = {
  async prefs(): Promise<ShellPrefs> {
    const bridge = getBridge()
    if (!bridge) return WEB_SHELL_PREFS
    try {
      return { ...WEB_SHELL_PREFS, ...(await bridge.shell.prefs()) }
    } catch {
      return WEB_SHELL_PREFS
    }
  },
  async setPrefs(patch: Partial<ShellPrefs>): Promise<ShellPrefs> {
    const bridge = getBridge()
    if (!bridge) return WEB_SHELL_PREFS
    try {
      return { ...WEB_SHELL_PREFS, ...(await bridge.shell.setPrefs(patch)) }
    } catch {
      return WEB_SHELL_PREFS
    }
  },
  onPrefs(handler: (prefs: ShellPrefs) => void): () => void {
    const bridge = getBridge()
    if (!bridge) return () => undefined
    try {
      return bridge.shell.onPrefs((prefs) => handler({ ...WEB_SHELL_PREFS, ...prefs }))
    } catch {
      return () => undefined
    }
  },
}

/** 本地 OCR：主进程侧的 tesseract.js */
export const ocrBridge = {
  async available(): Promise<boolean> {
    const bridge = getBridge()
    if (!bridge) return false
    try {
      return await bridge.ocr.available()
    } catch {
      return false
    }
  },
  async recognize(dataUrl: string, langs?: string[]): Promise<OcrResult> {
    const bridge = getBridge()
    if (!bridge) return { ok: false, error: '当前环境没有本地 OCR 引擎（需要桌面版）' }
    try {
      return await bridge.ocr.recognize(dataUrl, langs)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
}

const IDLE_STATE: UpdateState = {
  mode: 'unknown',
  state: 'idle',
  currentVersion: __APP_VERSION__,
  version: null,
  percent: 0,
  message: '',
  downloadPage: 'https://github.com/1576584678/ClauseEye/releases/latest',
  checkedAt: null,
}

/** 应用更新：安装版可自动更新，免安装版只提示下载 */
export const updaterBridge = {
  async status(): Promise<UpdateState> {
    const bridge = getBridge()
    if (!bridge) return IDLE_STATE
    try {
      return { ...IDLE_STATE, ...(await bridge.updater.status()) }
    } catch {
      return IDLE_STATE
    }
  },
  async check(): Promise<UpdateState | null> {
    const bridge = getBridge()
    if (!bridge) return null
    try {
      const next = await bridge.updater.check()
      return next ? { ...IDLE_STATE, ...next } : null
    } catch {
      return null
    }
  },
  async download(): Promise<UpdateState | null> {
    const bridge = getBridge()
    if (!bridge) return null
    try {
      const next = await bridge.updater.download()
      return next ? { ...IDLE_STATE, ...next } : null
    } catch {
      return null
    }
  },
  async install(): Promise<boolean> {
    const bridge = getBridge()
    if (!bridge) return false
    try {
      return await bridge.updater.install()
    } catch {
      return false
    }
  },
  async openDownloadPage(url?: string): Promise<boolean> {
    const bridge = getBridge()
    if (!bridge) return false
    try {
      return await bridge.updater.openDownloadPage(url)
    } catch {
      return false
    }
  },
  /** 「下载加速」用：当前平台该下载什么、直连与各镜像渠道 */
  async links(): Promise<DownloadLinks | null> {
    const bridge = getBridge()
    if (!bridge) return null
    try {
      return await bridge.updater.links()
    } catch {
      return null
    }
  },
  onEvent(handler: (state: UpdateState) => void): () => void {
    const bridge = getBridge()
    if (!bridge) return () => undefined
    try {
      return bridge.updater.onEvent((state) => handler({ ...IDLE_STATE, ...state }))
    } catch {
      return () => undefined
    }
  },
  onOpenSettings(handler: () => void): () => void {
    const bridge = getBridge()
    if (!bridge) return () => undefined
    try {
      return bridge.updater.onOpenSettings(handler)
    } catch {
      return () => undefined
    }
  },
}

/**
 * 加密单文件保险箱（主进程 node:sqlite）。
 * 桌面端优先用它承载全部密文记录；浏览器预览拿不到桥接时由调用方退回 IndexedDB。
 */
export const vaultStoreBridge = {
  async status(): Promise<VaultStoreStatus> {
    const bridge = getBridge()
    if (!bridge || !bridge.store) return { available: false, reason: '浏览器环境没有单文件库驱动' }
    try {
      return await bridge.store.status()
    } catch (error) {
      return { available: false, reason: String((error as Error)?.message ?? error) }
    }
  },
  async putRecord(row: VaultStoreRow): Promise<void> {
    const ok = await storeApi().putRecord(row)
    if (!ok) throw new Error('单文件库写入失败')
  },
  async getRecord(id: string): Promise<VaultStoreRow | undefined> {
    return storeApi().getRecord(id)
  },
  async getAllRecords(): Promise<VaultStoreRow[]> {
    return storeApi().getAllRecords()
  },
  async deleteRecord(id: string): Promise<void> {
    await storeApi().deleteRecord(id)
  },
  async clearRecords(): Promise<void> {
    await storeApi().clearRecords()
  },
  async putMeta(key: string, value: unknown): Promise<void> {
    await storeApi().putMeta(key, value)
  },
  async getMeta<T = unknown>(key: string): Promise<T | undefined> {
    return (await storeApi().getMeta(key)) as T | undefined
  },
  async clearMeta(): Promise<void> {
    await storeApi().clearMeta()
  },
}

function storeApi(): NonNullable<ClauseEyeBridge['store']> {
  const bridge = getBridge()
  if (!bridge || !bridge.store) throw new Error('单文件库驱动不可用')
  return bridge.store
}
