/**
 * 应用更新状态（渲染进程侧的轻量 store）
 *
 * 用 useSyncExternalStore 而不是 Context：更新状态来自主进程事件，
 * 与业务状态（保险箱、文档）无关，放在模块级单例里最省事，也不会引起整棵树重渲染。
 */

import { useEffect, useSyncExternalStore } from 'react'
import { updaterBridge, type UpdateState } from './bridge'

const FALLBACK: UpdateState = {
  mode: 'unknown',
  state: 'idle',
  currentVersion: __APP_VERSION__,
  version: null,
  percent: 0,
  message: '',
  downloadPage: 'https://github.com/1576584678/ClauseEye/releases/latest',
  checkedAt: null,
}

let state: UpdateState = FALLBACK
const listeners = new Set<() => void>()
let started = false
let autoCheckTimer: number | null = null

function emit(next: UpdateState): void {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): UpdateState {
  return state
}

/** 只初始化一次：订阅主进程事件 + 拉取当前状态 */
export function initUpdater(onOpenSettings?: () => void): void {
  if (started) return
  started = true
  updaterBridge.onEvent((next) => emit(next))
  if (onOpenSettings) updaterBridge.onOpenSettings(onOpenSettings)
  void updaterBridge.status().then((next) => emit(next))
}

export function useUpdaterState(): UpdateState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export const updaterActions = {
  async check(): Promise<UpdateState | null> {
    const next = await updaterBridge.check()
    if (next) emit(next)
    return next
  },
  async download(): Promise<UpdateState | null> {
    const next = await updaterBridge.download()
    if (next) emit(next)
    return next
  },
  async install(): Promise<boolean> {
    return updaterBridge.install()
  },
  async openDownloadPage(): Promise<boolean> {
    return updaterBridge.openDownloadPage()
  },
}

/**
 * 启动后延迟自动检查一次（默认 20 秒，避开启动时的解密/渲染高峰）。
 * 关闭"自动检查"或网页版时不动作；主进程不可用也不影响使用。
 */
export function useAutoUpdateCheck(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    if (autoCheckTimer !== null) return
    autoCheckTimer = window.setTimeout(() => {
      autoCheckTimer = null
      void updaterActions.check()
    }, 20_000)
    return () => {
      if (autoCheckTimer !== null) {
        window.clearTimeout(autoCheckTimer)
        autoCheckTimer = null
      }
    }
  }, [enabled])
}

/** 状态文案（供设置页与横幅共用） */
export function updateHeadline(next: UpdateState): string {
  switch (next.state) {
    case 'checking':
      return '正在检查更新…'
    case 'latest':
      return `已是最新版本（${next.currentVersion}）`
    case 'available':
      return next.version ? `发现新版本 ${next.version}` : '发现新版本'
    case 'downloading':
      return `正在下载更新… ${next.percent}%`
    case 'downloaded':
      return next.version ? `新版本 ${next.version} 已下载，重启后生效` : '更新已下载，重启后生效'
    case 'error':
      return `检查更新失败：${next.message || '网络不可用'}`
    default:
      return `当前版本 ${next.currentVersion}`
  }
}
