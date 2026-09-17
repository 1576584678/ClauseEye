import { useMemo } from 'react'
import { summarizeRisks } from '../../core/rules'
import { useApp } from '../../state/store'
import { navigate, type Route } from '../router'

const NAV: { route: Route; label: string; icon: string; hint: string }[] = [
  { route: { name: 'vault' }, label: '保险箱', icon: '🗄', hint: '全部合同与证明' },
  { route: { name: 'offers' }, label: 'Offer 对比', icon: '⚖️', hint: '多份录用通知横向比较' },
  { route: { name: 'reminders' }, label: '提醒', icon: '⏰', hint: '到期 / 续约 / 试用期' },
  { route: { name: 'settings' }, label: '设置', icon: '⚙️', hint: 'BYOK / 离线模式 / 备份' },
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
              onClick={() => navigate(item.route)}
            >
              <span className="nav-icon">{item.icon}</span>
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
          {settings.offlineMode ? '🔒 离线模式：已开启' : '🌐 离线模式：已关闭'}
        </div>
      </div>
    </aside>
  )
}
