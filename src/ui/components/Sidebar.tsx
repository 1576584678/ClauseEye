import { useMemo } from 'react'
import { summarizeRisks } from '../../core/rules'
import { useApp } from '../../state/store'
import { navigate, type Route } from '../router'
import { Icon, type IconName } from './Icon'

const NAV: { route: Route; label: string; icon: IconName; hint: string }[] = [
  { route: { name: 'vault' }, label: '保险箱', icon: 'archive', hint: '全部合同与证明' },
  { route: { name: 'offers' }, label: 'Offer 对比', icon: 'scale', hint: '多份录用通知横向比较' },
  { route: { name: 'reminders' }, label: '提醒', icon: 'clock', hint: '到期 / 续约 / 试用期' },
  { route: { name: 'settings' }, label: '设置', icon: 'settings', hint: 'BYOK / 离线模式 / 备份' },
]

export function Sidebar({ current }: { current: Route }) {
  const { documents, settings } = useApp()

  const counts = useMemo(() => {
    const all = documents.flatMap((doc) => doc.analysis?.risks ?? [])
    return summarizeRisks(all)
  }, [documents])

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">契</div>
        <div>
          <div className="brand-name">ClauseEye</div>
          <div className="brand-sub">你的合同只属于你</div>
        </div>
      </div>

      <nav className="nav">
        {NAV.map((item) => {
          const active = item.route.name === current.name
          return (
            <button
              key={item.route.name}
              type="button"
              className={`nav-item ${active ? 'active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => navigate(item.route)}
            >
              <span className="nav-icon">
                <Icon name={item.icon} size={18} />
              </span>
              <span className="nav-text">
                <span className="nav-label">{item.label}</span>
                <span className="nav-hint">{item.hint}</span>
              </span>
            </button>
          )
        })}
      </nav>

      <div className="sidebar-foot">
        <div className="mini-stat">
          <span>文档</span>
          <strong>{documents.length}</strong>
        </div>
        <div className="mini-stat">
          <span className="sev-dot sev-high" />
          <span>高风险</span>
          <strong>{counts.high}</strong>
        </div>
        <div className={`privacy-chip ${settings.offlineMode ? 'on' : 'off'}`}>
          <Icon name={settings.offlineMode ? 'shield-check' : 'globe'} size={14} />
          {settings.offlineMode ? '离线模式：已开启' : '离线模式：已关闭'}
        </div>
      </div>
    </aside>
  )
}
