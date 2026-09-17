/**
 * 关键日期 → 到期提醒（纯函数，便于单测）
 *
 * V1 的系统级提醒建立在两条不变式上：
 * 1. 提醒内容全部来自本地规则抽取的关键日期，不联网、不上报；
 * 2. 同一件事最多打扰三次：提前若干天一次、到期当天一次、逾期一次（每次都只发一遍）。
 */

import type { CategoryCode, DocumentRecord } from './types'

export interface ReminderItem {
  /** 稳定标识：文档 + 标签 + 日期 */
  key: string
  docId: string
  docTitle: string
  category: CategoryCode
  label: string
  /** ISO 日期（YYYY-MM-DD） */
  date: string
  source: string
}

/** 从文档集合中挑出"有明确绝对日期"的关键日期 */
export function collectReminders(documents: DocumentRecord[]): ReminderItem[] {
  const items: ReminderItem[] = []
  for (const doc of documents) {
    for (const kd of doc.analysis?.keyDates ?? []) {
      if (!kd.date) continue
      items.push({
        key: `${doc.id}|${kd.label}|${kd.date}`,
        docId: doc.id,
        docTitle: doc.title,
        category: doc.category,
        label: kd.label,
        date: kd.date,
        source: kd.source,
      })
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date))
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** 目标日期距今天的天数（按本地日历天计算，今天 = 0） */
export function daysUntil(date: string, now: Date = new Date()): number | null {
  if (!DATE_ONLY.test(date)) return null
  const [y, m, d] = date.split('-').map(Number)
  const target = new Date(y, m - 1, d).getTime()
  if (Number.isNaN(target)) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((target - today) / 86_400_000)
}

export type ReminderStage = 'advance' | 'due' | 'overdue'

export interface PlannedReminder extends ReminderItem {
  stage: ReminderStage
  /** 距今天的天数，负数表示已逾期 */
  days: number
  /** 通知去重键 */
  noticeKey: string
  title: string
  body: string
}

export interface PlanOptions {
  now?: Date
  /** 提前几天提醒 */
  leadDays?: number
  /** 已发送过的通知键 → 发送时间（ISO） */
  notified?: Record<string, string>
}

export const DEFAULT_LEAD_DAYS = 7

/**
 * 计算"此刻应当弹出的通知"。
 * 同一 key 的 advance / due / overdue 各只会出现一次，因此不会反复打扰。
 */
export function planReminders(items: ReminderItem[], options: PlanOptions = {}): PlannedReminder[] {
  const now = options.now ?? new Date()
  const leadDays = Math.max(0, Math.min(60, options.leadDays ?? DEFAULT_LEAD_DAYS))
  const notified = options.notified ?? {}
  const planned: PlannedReminder[] = []

  for (const item of items) {
    const days = daysUntil(item.date, now)
    if (days === null) continue

    let stage: ReminderStage
    if (days < 0) stage = 'overdue'
    else if (days === 0) stage = 'due'
    else if (days <= leadDays) stage = 'advance'
    else continue

    const noticeKey = `${item.key}|${stage}`
    if (notified[noticeKey]) continue

    const when =
      stage === 'overdue'
        ? `已于 ${item.date} 逾期 ${Math.abs(days)} 天`
        : stage === 'due'
          ? `就是今天（${item.date}）`
          : `还有 ${days} 天（${item.date}）`

    planned.push({
      ...item,
      stage,
      days,
      noticeKey,
      title: stage === 'overdue' ? '已逾期的关键日期' : stage === 'due' ? '今天到期' : '关键日期临近',
      body: `《${item.docTitle}》·${item.label}：${when}`,
    })
  }

  // 先提醒逾期，再提醒当天，最后是临近，避免同时弹出多条时顺序混乱
  const order: Record<ReminderStage, number> = { overdue: 0, due: 1, advance: 2 }
  return planned.sort((a, b) => order[a.stage] - order[b.stage] || a.days - b.days)
}

/** 清理过期太久的历史记录，避免本地通知日志无限增长 */
export function pruneNotified(
  notified: Record<string, string>,
  now: Date = new Date(),
  keepDays = 180,
): Record<string, string> {
  const cutoff = now.getTime() - keepDays * 86_400_000
  const kept: Record<string, string> = {}
  for (const [key, at] of Object.entries(notified)) {
    const time = Date.parse(at)
    if (Number.isNaN(time) || time >= cutoff) kept[key] = at
  }
  return kept
}
