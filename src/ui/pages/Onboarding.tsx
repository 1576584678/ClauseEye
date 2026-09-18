import { useState } from 'react'
import { useApp } from '../../state/store'
import { Disclaimer } from '../components/Common'

export function Onboarding() {
  const { createVault } = useApp()
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)

  const start = async (usePassphrase: boolean) => {
    if (usePassphrase) {
      if (passphrase.length < 6) {
        setError('口令至少 6 位；口令用于本地加密，忘记后数据无法恢复。')
        return
      }
      if (passphrase !== confirm) {
        setError('两次输入的口令不一致。')
        return
      }
    }
    setError('')
    setWorking(true)
    try {
      await createVault(usePassphrase ? passphrase : undefined, hint || undefined)
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="brand brand-lg">
          <div className="brand-mark">契</div>
          <div>
            <div className="brand-name">ClauseEye · 契眼</div>
            <div className="brand-sub">本地优先的个人合同 &amp; 证明文档管家</div>
          </div>
        </div>

        <ul className="feature-list">
          <li>
            <strong>零上报</strong>
            <span>文档、分析结果、密钥全部留在本机加密库（桌面端为单文件 vault.sqlite，AES-256-GCM 逐条加密），没有服务端。</span>
          </li>
          <li>
            <strong>坑点雷达</strong>
            <span>劳动合同 / 租房 / 二手房买卖 / 装修合同 / 驾培协议 / Offer / 离职证明 / 工伤鉴定等 11 类场景共 186 条规则，离线即可出结果。</span>
          </li>
          <li>
            <strong>多 Offer 对比</strong>
            <span>结构化抽取薪资、试用期、期权、违约金，并排对比并高亮差异。</span>
          </li>
          <li>
            <strong>BYOK 深度分析</strong>
            <span>填入你自己的模型 Key 才会联网，我们看不到你的任何内容。</span>
          </li>
        </ul>

        <div className="panel">
          <h3>设置保险箱口令</h3>
          <p className="muted">
            口令用于派生本地加密密钥（PBKDF2 + AES-GCM）。口令不会离开你的设备，一旦忘记，本地数据将无法解密。
          </p>
          <div className="field-grid">
            <label>
              <span>口令（≥6 位）</span>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="可选，留空则使用无口令模式"
                autoComplete="new-password"
              />
            </label>
            <label>
              <span>确认口令</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="再次输入口令"
                autoComplete="new-password"
              />
            </label>
            <label>
              <span>口令提示（可选）</span>
              <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="例如：常用密码 + 生日" />
            </label>
          </div>
          {error ? <div className="form-error">{error}</div> : null}
          <div className="row gap">
            <button type="button" className="btn btn-primary" disabled={working} onClick={() => void start(true)}>
              创建受口令保护的保险箱
            </button>
            <button type="button" className="btn" disabled={working} onClick={() => void start(false)}>
              先跳过（无口令模式）
            </button>
          </div>
          <p className="muted small">
            无口令模式下，密钥随数据库一起存储，仅能防止文件被直接读取，无法抵御能访问你电脑的人。正式版本将接入系统钥匙串。
          </p>
        </div>

        <Disclaimer />
      </div>
    </div>
  )
}
