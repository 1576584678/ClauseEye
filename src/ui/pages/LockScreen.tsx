import { useState } from 'react'
import { useApp } from '../../state/store'

export function LockScreen() {
  const { unlockVault, hasPassphrase } = useApp()
  const [passphrase, setPassphrase] = useState('')
  const [working, setWorking] = useState(false)

  const submit = async () => {
    setWorking(true)
    try {
      await unlockVault(hasPassphrase ? passphrase : undefined)
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="onboarding">
      <div className="onboarding-card narrow">
        <div className="brand brand-lg">
          <div className="brand-mark">🔒</div>
          <div>
            <div className="brand-name">保险箱已锁定</div>
            <div className="brand-sub">{hasPassphrase ? '输入口令以解密本地数据' : '本机加密数据已就绪'}</div>
          </div>
        </div>
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          {hasPassphrase ? (
            <label>
              <span>口令</span>
              <input
                type="password"
                value={passphrase}
                autoFocus
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="请输入保险箱口令"
                autoComplete="current-password"
              />
            </label>
          ) : (
            <p className="muted small">
              该保险箱为无口令模式，点击下方按钮即可打开；如需口令保护，可在「设置 → 安全」中开启。
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={working}>
            {working ? '解密中…' : hasPassphrase ? '解锁' : '打开保险箱'}
          </button>
        </form>
      </div>
    </div>
  )
}
