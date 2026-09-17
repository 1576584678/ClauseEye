import { describe, expect, it, vi } from 'vitest'
import type { PlannedReminder, ReminderItem } from '../../core/reminders'
import { runReminderPass } from '../reminderNotifier'

const items: ReminderItem[] = [
  { key: 'a', docId: 'd1', docTitle: '劳动合同', category: 'labor', label: '合同到期', date: '2026-09-20', source: '' },
]

describe('提醒投递', () => {
  it('投递成功后写回去重日志', async () => {
    const send = vi.fn(async () => true)
    const result = await runReminderPass(items, { now: new Date(2026, 8, 17), leadDays: 7, log: {}, send })
    expect(send).toHaveBeenCalledTimes(1)
    expect(result.sent).toHaveLength(1)
    expect(result.log['a|advance']).toBeTruthy()
  })

  it('投递失败时不写日志（下次还会再提醒）', async () => {
    const send = vi.fn(async () => false)
    const result = await runReminderPass(items, { now: new Date(2026, 8, 17), leadDays: 7, log: {}, send })
    expect(result.planned).toHaveLength(1)
    expect(result.sent).toHaveLength(0)
    expect(result.log).toEqual({})
  })

  it('已发送过的不再重复投递', async () => {
    const send = vi.fn(async (_notice: PlannedReminder) => true)
    const result = await runReminderPass(items, {
      now: new Date(2026, 8, 17),
      leadDays: 7,
      log: { 'a|advance': '2026-09-17T00:00:00.000Z' },
      send,
    })
    expect(send).not.toHaveBeenCalled()
    expect(result.sent).toHaveLength(0)
  })
})
