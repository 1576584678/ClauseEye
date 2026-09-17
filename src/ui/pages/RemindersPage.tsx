import { useEffect, useMemo, useState } from 'react'
import type { CategoryCode, KeyDate } from '../../core/types'
import type { PlannedReminder } from '../../core/reminders'
import { isDesktop, reminderBridge } from '../../desktop/bridge'
import {
  clearNotifiedLog,
  loadNotifiedLog,
  previewReminders,
  remindersFromDocuments,
} from '../../desktop/reminderNotifier'
import { useApp } from '../../state/store'
import { CategoryTag, Disclaimer, EmptyState } from '../components/Common'
import { dueText } from '../format'
import { navigate } from '../router'

interface ReminderItem {
  docId: string
  docTitle: string
  category: CategoryCode
  date: KeyDate
}

const LEAD_OPTIONS = [1, 3, 7, 14, 30]

const STAGE_LABEL: Record<PlannedReminder['stage'], string> = {
  overdue: '已逾期',
  due: '今天到期',
  advance: '临近',
}

export function RemindersPage() {
  const { documents, settings, updateSettings, notify } = useApp()
  const [supported, setSupported] = useState(false)
  const [logVersion, setLogVersion] = useState(0)

  const desktop = isDesktop()

  useEffect(() => {
    let cancelled = false
    void reminderBridge.supported().then((ok) => {
      if (!cancelled) setSupported(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const { dated, relative } = useMemo(() => {
    const all: ReminderItem[] = []
    for (const doc of documents) {
      for (const kd of doc.analysis?.keyDates ?? []) {
        all.push({ docId: doc.id, docTitle: doc.title, category: doc.category, date: kd })
      }
    }
    const withDate = all
      .filter((item) => item.date.date)
      .sort((a, b) => (a.date.date ?? '').localeCompare(b.date.date ?? ''))
    const withoutDate = all.filter((item) => !item.date.date)
    return { dated: withDate, relative: withoutDate }
  }, [documents])

  const upcoming = useMemo(() => {
    void logVersion
    const items = remindersFromDocuments(documents)
    return previewReminders(items, loadNotifiedLog(), settings.reminderLeadDays)
  }, [documents, settings.reminderLeadDays, logVersion])

  if (documents.length === 0) {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <h1>提醒</h1>
            <p className="muted">从合同中自动抽取的关键日期（到期、续约、试用期结束、救济期限）。</p>
          </div>
        </header>
        <EmptyState
          icon="clock"
          title="暂无可提醒的日期"
          description="导入劳动合同、租房合同或鉴定文书后，这里会自动整理出关键时间点。"
          action={
            <button type="button" className="btn btn-primary" onClick={() => navigate({ name: 'vault' })}>
              去导入文档
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>提醒</h1>
          <p className="muted">
            全部由本地规则从原文中抽取，不联网、不上报。桌面版会在关键日期临近时弹出系统通知。
          </p>
        </div>
      </header>

      <section className="panel">
        <h2>系统通知</h2>
        {!desktop ? (
          <p className="muted small">
            当前是网页版：浏览器内提醒仅在页面打开时按下面的时间点提示你。安装桌面版（ClauseEye.exe）后可在系统托盘弹出通知。
          </p>
        ) : !supported ? (
          <p className="muted small">当前系统不支持通知，或通知权限被关闭（Windows：设置 → 系统 → 通知）。</p>
        ) : null}

        <label className="switch-row">
          <input
            type="checkbox"
            checked={settings.systemNotifications}
            disabled={!desktop}
            onChange={(e) => void updateSettings({ systemNotifications: e.target.checked })}
          />
          <span>
            <strong>到期时弹出系统通知</strong>
            <span className="muted small">
              同一件事最多打扰三次：提前提醒一次、到期当天一次、逾期一次。通知内容只包含文档标题与日期。
            </span>
          </span>
        </label>

        <label className="switch-row">
          <span>
            <strong>提前提醒天数</strong>
            <span className="muted small">到期前多少天开始提醒你留出处理时间。</span>
          </span>
          <select
            value={settings.reminderLeadDays}
            onChange={(e) => void updateSettings({ reminderLeadDays: Number(e.target.value) })}
          >
            {LEAD_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {days} 天
              </option>
            ))}
          </select>
        </label>

        <div className="row gap">
          <button
            type="button"
            className="btn"
            disabled={!desktop}
            onClick={async () => {
              const ok = await reminderBridge.test()
              notify(ok ? '已发送一条测试通知。' : '当前环境无法发送系统通知。', ok ? 'success' : 'warn')
            }}
          >
            发送测试通知
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              clearNotifiedLog()
              setLogVersion((v) => v + 1)
              notify('已重置提醒记录，下次检查会重新提醒。', 'success')
            }}
          >
            重置提醒记录
          </button>
        </div>

        {settings.systemNotifications && upcoming.length > 0 ? (
          <div className="stack">
            <p className="muted small">接下来会提醒（共 {upcoming.length} 条）：</p>
            <ul className="plain-list">
              {upcoming.map((item) => (
                <li key={item.noticeKey}>
                  <div>
                    <strong>{STAGE_LABEL[item.stage]} · {item.label}</strong>
                    <div className="muted small">{item.body}</div>
                  </div>
                  <span className="muted small">{item.date}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="timeline">
        {dated.length === 0 ? (
          <p className="muted">未抽取到明确的绝对日期。</p>
        ) : (
          dated.map((item, i) => (
            <article key={`${item.docId}-${i}`} className="timeline-item" onClick={() => navigate({ name: 'doc', id: item.docId })}>
              <div className="timeline-date">
                <strong>{item.date.date}</strong>
                <span className="muted small">{dueText(item.date.date ?? '')}</span>
              </div>
              <div className="timeline-body">
                <div className="row gap-sm">
                  <CategoryTag code={item.category} muted />
                  <strong>{item.date.label}</strong>
                </div>
                <p className="muted small">来自《{item.docTitle}》</p>
                <blockquote>{item.date.source}</blockquote>
              </div>
            </article>
          ))
        )}
      </section>

      {relative.length > 0 ? (
        <section className="panel">
          <h2>需人工换算的期限</h2>
          <p className="muted small">以下期限以"自某事件起 N 日"表述，需要结合你的实际收件/起始日期推算。</p>
          <ul className="plain-list">
            {relative.map((item, i) => (
              <li key={`${item.docId}-rel-${i}`}>
                <div>
                  <strong>{item.date.label}</strong>
                  <span className="muted small"> · 来自《{item.docTitle}》</span>
                  <div className="small">{item.date.relativeText ?? '需人工确认'}</div>
                </div>
                <span className="muted small">{item.date.source.slice(0, 40)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Disclaimer />
    </div>
  )
}
