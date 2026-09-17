import { describe, expect, it } from 'vitest'
import {
  collectReminders,
  daysUntil,
  planReminders,
  pruneNotified,
  type ReminderItem,
} from '../reminders'
import type { DocumentRecord } from '../types'

function doc(id: string, title: string, dates: { label: string; date: string | null }[]): DocumentRecord {
  return {
    id,
    title,
    category: 'labor',
    fileName: `${title}.txt`,
    mimeType: 'text/plain',
    sizeBytes: 0,
    importedAt: '2026-01-01T00:00:00.000Z',
    sourceHash: 'x',
    text: '',
    pageCount: null,
    analysis: {
      category: 'labor',
      categoryConfidence: 1,
      categoryScores: [],
      clauses: [],
      risks: [],
      keyDates: dates.map((d) => ({ label: d.label, kind: 'deadline' as const, date: d.date, source: `${d.label} 原文` })),
      engine: 'rules',
      rulesVersion: 'test',
      analyzedAt: '2026-01-01T00:00:00.000Z',
      notes: [],
    },
  }
}

const now = new Date(2026, 8, 17) // 2026-09-17

describe('关键日期提醒', () => {
  it('只收集有明确绝对日期的条目', () => {
    const items = collectReminders([doc('d1', '劳动合同', [{ label: '试用期结束', date: '2026-10-01' }, { label: '救济期限', date: null }])])
    expect(items).toHaveLength(1)
    expect(items[0].key).toBe('d1|试用期结束|2026-10-01')
  })

  it('按本地日历天计算距今天数', () => {
    expect(daysUntil('2026-09-17', now)).toBe(0)
    expect(daysUntil('2026-09-20', now)).toBe(3)
    expect(daysUntil('2026-09-10', now)).toBe(-7)
    expect(daysUntil('不是日期', now)).toBeNull()
  })

  it('分成提前 / 当天 / 逾期三种提醒，且各只提醒一次', () => {
    const items: ReminderItem[] = [
      { key: 'a', docId: 'd1', docTitle: '劳动合同', category: 'labor', label: '试用期结束', date: '2026-09-20', source: '' },
      { key: 'b', docId: 'd1', docTitle: '劳动合同', category: 'labor', label: '合同到期', date: '2026-09-17', source: '' },
      { key: 'c', docId: 'd2', docTitle: '租房合同', category: 'rent', label: '押金退还', date: '2026-09-10', source: '' },
    ]
    const planned = planReminders(items, { now, leadDays: 7 })
    expect(planned.map((p) => p.stage)).toEqual(['overdue', 'due', 'advance'])
    expect(planned.map((p) => p.noticeKey)).toEqual(['c|overdue', 'b|due', 'a|advance'])

    // 已发送过的不会再发
    const notified = Object.fromEntries(planned.map((p) => [p.noticeKey, now.toISOString()]))
    expect(planReminders(items, { now, leadDays: 7, notified })).toEqual([])
  })

  it('超出提前天数的条目不提醒', () => {
    const items: ReminderItem[] = [
      { key: 'a', docId: 'd1', docTitle: '劳动合同', category: 'labor', label: '合同到期', date: '2026-11-01', source: '' },
    ]
    expect(planReminders(items, { now, leadDays: 7 })).toEqual([])
    expect(planReminders(items, { now, leadDays: 60 })).toHaveLength(1)
  })

  it('通知正文包含文档、标签与到期信息', () => {
    const items: ReminderItem[] = [
      { key: 'a', docId: 'd1', docTitle: '劳动合同', category: 'labor', label: '合同到期', date: '2026-09-20', source: '' },
    ]
    const [notice] = planReminders(items, { now, leadDays: 7 })
    expect(notice.body).toContain('《劳动合同》')
    expect(notice.body).toContain('还有 3 天')
    expect(notice.body).toContain('2026-09-20')
  })

  it('清理过久的历史记录', () => {
    const kept = pruneNotified(
      { old: '2026-01-01T00:00:00.000Z', recent: '2026-09-01T00:00:00.000Z', broken: '不是时间' },
      now,
      180,
    )
    expect(kept.old).toBeUndefined()
    expect(kept.recent).toBeDefined()
    expect(kept.broken).toBe('不是时间')
  })
})
