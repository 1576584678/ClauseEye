/**
 * 到期提醒调度（渲染进程侧）
 *
 * 为什么放在渲染进程：关键日期来自本地规则引擎，渲染进程本来就持有解密后的分析结果；
 * 主进程只负责"弹通知"这一件事，避免在两端各写一份日期逻辑。
 *
 * 去重日志存在 localStorage（明文也无妨：里面只有文档标题与日期，没有正文）。
 */

import { useEffect } from 'react'
import { collectReminders, planReminders, pruneNotified, type PlannedReminder, type ReminderItem } from '../core/reminders'
import type { AppSettings, DocumentRecord } from '../core/types'
import { navigate } from '../ui/router'
import { reminderBridge } from './bridge'

const LOG_KEY = 'clauseeye.reminders.log.v1'
const TICK_MS = 10 * 60 * 1000

export type NotifiedLog = Record<string, string>

export function loadNotifiedLog(): NotifiedLog {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return pruneNotified(parsed as NotifiedLog)
  } catch {
    return {}
  }
}

export function saveNotifiedLog(log: NotifiedLog): void {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(pruneNotified(log)))
  } catch {
    /* 存储不可用时静默忽略：最多重复提醒一次 */
  }
}

export function clearNotifiedLog(): void {
  try {
    localStorage.removeItem(LOG_KEY)
  } catch {
    /* ignore */
  }
}

export interface ReminderPassOptions {
  now?: Date
  leadDays: number
  /** 已发送记录，传入即代表"只计算尚未发送的" */
  log: NotifiedLog
  /** 实际投递方式，默认走系统通知 */
  send: (notice: PlannedReminder) => Promise<boolean>
}

export interface ReminderPassResult {
  planned: PlannedReminder[]
  sent: PlannedReminder[]
  log: NotifiedLog
}

/** 跑一轮提醒：算出该发的通知、投递、并回写去重日志（纯逻辑 + 注入投递函数，便于单测） */
export async function runReminderPass(items: ReminderItem[], options: ReminderPassOptions): Promise<ReminderPassResult> {
  const planned = planReminders(items, { now: options.now, leadDays: options.leadDays, notified: options.log })
  const log: NotifiedLog = { ...options.log }
  const sent: PlannedReminder[] = []

  for (const notice of planned) {
    const ok = await options.send(notice)
    if (!ok) continue
    log[notice.noticeKey] = (options.now ?? new Date()).toISOString()
    sent.push(notice)
  }

  return { planned, sent, log: pruneNotified(log) }
}

/** 只计算、不投递：用于提醒页展示"接下来会提醒什么" */
export function previewReminders(items: ReminderItem[], log: NotifiedLog, leadDays: number, now = new Date()): PlannedReminder[] {
  return planReminders(items, { now, leadDays, notified: log })
}

export function remindersFromDocuments(documents: DocumentRecord[]): ReminderItem[] {
  return collectReminders(documents)
}

/**
 * 挂载级调度：文档/设置变化时立刻检查一次，之后每 10 分钟检查一次
 *（应用常驻时也能在跨天后自动提醒）。
 */
export function useReminderNotifications(documents: DocumentRecord[], settings: AppSettings): void {
  // 用稳定的键值做依赖：父组件每次渲染重建的数组/对象引用不应触发重跑，否则会重复通知
  const documentsKey = documents.map((doc) => `${doc.id}:${doc.importedAt}`).join('|')
  const { systemNotifications, reminderLeadDays } = settings

  useEffect(() => {
    if (!systemNotifications) return

    let cancelled = false

    const run = async () => {
      try {
        const supported = await reminderBridge.supported()
        if (cancelled || !supported) return
        const items = collectReminders(documents)
        const result = await runReminderPass(items, {
          leadDays: reminderLeadDays,
          log: loadNotifiedLog(),
          send: (notice) =>
            reminderBridge.notify({
              noticeKey: notice.noticeKey,
              title: notice.title,
              body: notice.body,
              docId: notice.docId,
            }),
        })
        // 已投递的记录必须落盘，与组件是否卸载无关，否则同一项会被重复提醒
        if (result.sent.length > 0) saveNotifiedLog(result.log)
      } catch (error) {
        console.warn('[reminders] 提醒调度失败', error)
      }
    }

    void run()
    const timer = window.setInterval(() => void run(), TICK_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [documentsKey, systemNotifications, reminderLeadDays])
}

/** 点击系统通知 → 跳到对应文档详情页 */
export function useNotificationNavigation(): void {
  useEffect(() => reminderBridge.onOpenDocument((docId) => navigate({ name: 'doc', id: docId })), [])
}
