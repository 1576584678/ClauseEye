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
  ocr: {
    available: () => Promise<boolean>
    recognize: (dataUrl: string, langs?: string[]) => Promise<OcrResult>
  }
  updater: {
    status: () => Promise<UpdateState>
    check: () => Promise<UpdateState | null>
    download: () => Promise<UpdateState | null>
    install: () => Promise<boolean>
    openDownloadPage: () => Promise<boolean>
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
  async load(): Promise<string | null> {
    const bridge = getBridge()
    if (!bridge) return null
    try {
      return await bridge.keychain.load()
    } catch {
      return null
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
  async openDownloadPage(): Promise<boolean> {
    const bridge = getBridge()
    if (!bridge) return false
    try {
      return await bridge.updater.openDownloadPage()
    } catch {
      return false
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
