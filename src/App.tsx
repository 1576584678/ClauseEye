import { useEffect } from 'react'
import { navigate } from './ui/router'
import { useNotificationNavigation, useReminderNotifications } from './desktop/reminderNotifier'
import { initUpdater, updateHeadline, updaterActions, useAutoUpdateCheck, useUpdaterState } from './desktop/updaterStore'
import { useApp } from './state/store'
import { Icon } from './ui/components/Icon'
import { Sidebar } from './ui/components/Sidebar'
import { DocumentPage } from './ui/pages/DocumentPage'
import { LockScreen } from './ui/pages/LockScreen'
import { OfferComparePage } from './ui/pages/OfferComparePage'
import { Onboarding } from './ui/pages/Onboarding'
import { RemindersPage } from './ui/pages/RemindersPage'
import { SettingsPage } from './ui/pages/SettingsPage'
import { VaultPage } from './ui/pages/VaultPage'
import { useRoute } from './ui/router'

export default function App() {
  const { ready, status, busy, busyText, documents, settings } = useApp()
  const route = useRoute()

  // 关键日期到期时弹系统通知；点击通知跳到对应文档
  useReminderNotifications(documents, settings)
  useNotificationNavigation()

  // 应用更新：订阅主进程事件 + 启动后自动检查一次（可在设置里关闭）
  const update = useUpdaterState()
  useEffect(() => initUpdater(() => navigate({ name: 'settings' })), [])
  useAutoUpdateCheck(settings.autoCheckUpdates)

  if (!ready) {
    return (
      <div className="boot">
        <div className="brand-mark">契</div>
        <p>正在打开本地保险箱…</p>
      </div>
    )
  }

  if (status === 'uninitialized') return <Onboarding />
  if (status === 'locked') return <LockScreen />

  return (
    <div className="layout">
      <Sidebar current={route} />
      <main className="main">
        <UpdateBanner update={update} />
        {busy ? (
          <div className="busy-bar">
            <span className="spinner" />
            <span>{busyText || '处理中…'}</span>
          </div>
        ) : null}
        {route.name === 'vault' ? <VaultPage /> : null}
        {route.name === 'doc' ? <DocumentPage id={route.id} /> : null}
        {route.name === 'offers' ? <OfferComparePage /> : null}
        {route.name === 'reminders' ? <RemindersPage /> : null}
        {route.name === 'settings' ? <SettingsPage /> : null}
      </main>
      <ToastView />
    </div>
  )
}

/** 有新版本时的顶部横幅：安装版可一键下载/重启安装，免安装版引导到下载页 */
function UpdateBanner({ update }: { update: ReturnType<typeof useUpdaterState> }) {
  const { state, version, percent, mode } = update
  if (state !== 'available' && state !== 'downloading' && state !== 'downloaded') return null

  const portable = mode === 'portable'
  return (
    <div className="update-banner" role="status">
      <span className="update-text">{updateHeadline(update)}</span>
      {state === 'downloaded' ? (
        <button type="button" className="btn btn-sm btn-primary" onClick={() => void updaterActions.install()}>
          立即重启安装
        </button>
      ) : state === 'downloading' ? (
        <span className="muted small">{percent}%</span>
      ) : portable ? (
        <>
          <button type="button" className="btn btn-sm" onClick={() => void updaterActions.openAcceleratedDownload()}>
            加速下载
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => void updaterActions.openDownloadPage()}>
            去下载 v{version}
          </button>
        </>
      ) : (        <button type="button" className="btn btn-sm btn-primary" onClick={() => void updaterActions.download()}>
          下载更新
        </button>
      )}
    </div>
  )
}

function ToastView() {
  const { toast, dismissToast } = useApp()

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(dismissToast, 8000)
    return () => clearTimeout(timer)
  }, [toast, dismissToast])

  if (!toast) return null
  return (
    <div className={`toast toast-${toast.kind}`} onClick={dismissToast} role="status">
      <span>{toast.text}</span>
      <span className="toast-close">
        <Icon name="x" size={14} />
      </span>
    </div>
  )
}
