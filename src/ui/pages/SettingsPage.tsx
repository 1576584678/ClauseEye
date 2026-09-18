import { useEffect, useState } from 'react'
import { RULES_VERSION } from '../../core/rules'
import { isDesktop, keychainBridge, ocrBridge } from '../../desktop/bridge'
import { updateHeadline, updaterActions, useUpdaterState } from '../../desktop/updaterStore'
import { testByokConnection } from '../../llm/byok'
import { useApp } from '../../state/store'
import { storeInfo } from '../../storage/db'
import { vault } from '../../storage/vault'
import { Disclaimer } from '../components/Common'
import { Icon } from '../components/Icon'
import { formatDateTime } from '../format'

export function SettingsPage() {
  const { settings, updateSettings, lockVault, hasPassphrase, exportBackup, wipeAll, notify } = useApp()
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string>('')
  const [testOk, setTestOk] = useState(true)
  const [newPass, setNewPass] = useState('')
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [keychainReady, setKeychainReady] = useState<boolean | null>(null)
  const [ocrReady, setOcrReady] = useState<boolean | null>(null)
  const [store, setStore] = useState<{ driver: string; file?: string } | null>(null)
  const update = useUpdaterState()
  const [checkingUpdate, setCheckingUpdate] = useState(false)

  useEffect(() => {
    let cancelled = false
    void keychainBridge.available().then((ok) => {
      if (!cancelled) setKeychainReady(ok)
    })
    void ocrBridge.available().then((ok) => {
      if (!cancelled) setOcrReady(ok)
    })
    void storeInfo().then((info) => {
      if (!cancelled) setStore(info)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const byok = settings.byok

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>设置</h1>
          <p className="muted">隐私、模型与数据都由你掌控。所有开关与密钥只保存在本机加密库中。</p>
        </div>
      </header>

      <section className="panel">
        <h2>隐私模式</h2>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={settings.offlineMode}
            onChange={(e) => void updateSettings({ offlineMode: e.target.checked })}
          />
          <span>
            <strong>离线模式</strong>
            <span className="muted small">
              开启后，ClauseEye 不会发出任何网络请求（包括 BYOK）；这是默认状态，也是"零上报"的可验证承诺。
            </span>
          </span>
        </label>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={settings.showLowRisk}
            onChange={(e) => void updateSettings({ showLowRisk: e.target.checked })}
          />
          <span>
            <strong>默认显示低风险提示</strong>
            <span className="muted small">低风险条目多为"表述模糊、建议澄清"，关闭后可以让清单更聚焦。</span>
          </span>
        </label>
        <p className="muted small row gap-sm">
          <Icon name={settings.offlineMode ? 'lock' : 'globe'} size={14} />
          <span>当前状态：{settings.offlineMode ? '完全离线，可断网使用' : '允许向"你指定的接口"发起 BYOK 请求'}</span>
        </p>
        <p className="muted small row gap-sm">
          <Icon name={ocrReady === null ? 'clock' : ocrReady ? 'circle-check' : 'alert-triangle'} size={14} />
          <span>本地 OCR（扫描件/图片识别）：
          {ocrReady === null ? '检测中…' : ocrReady ? '已内置离线引擎（tesseract.js + 中文语言包）' : '当前环境不可用，可改用「粘贴文本」'}</span>
        </p>
      </section>

      <section className="panel">
        <h2>BYOK 深度分析（自带大模型密钥）</h2>
        <p className="muted small">
          ClauseEye 不提供也不代理模型服务。开启后，只有你填写的接口会收到"待分析的条款文本"，我们不做任何中转、不留存任何副本。
        </p>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={byok.enabled}
            onChange={(e) => void updateSettings({ byok: { ...byok, enabled: e.target.checked } })}
          />
          <span>
            <strong>启用 BYOK</strong>
            <span className="muted small">推荐使用 OpenAI 兼容接口（DeepSeek / 通义 / OpenAI / 本地 Ollama 等）。</span>
          </span>
        </label>

        <div className="field-grid">
          <label>
            <span>接口地址（Base URL）</span>
            <input
              value={byok.baseUrl}
              onChange={(e) => void updateSettings({ byok: { ...byok, baseUrl: e.target.value } })}
              placeholder="https://api.deepseek.com/v1"
            />
          </label>
          <label>
            <span>模型名</span>
            <input
              value={byok.model}
              onChange={(e) => void updateSettings({ byok: { ...byok, model: e.target.value } })}
              placeholder="deepseek-chat"
            />
          </label>
          <label>
            <span>API Key（仅存在本机加密库）</span>
            <div className="row gap-sm">
              <input
                type={showKey ? 'text' : 'password'}
                value={byok.apiKey}
                onChange={(e) => void updateSettings({ byok: { ...byok, apiKey: e.target.value } })}
                placeholder="sk-…"
                autoComplete="off"
              />
              <button type="button" className="btn btn-sm" onClick={() => setShowKey((v) => !v)}>
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
          </label>
        </div>

        <div className="row gap">
          <button
            type="button"
            className="btn"
            disabled={testing || settings.offlineMode || !byok.apiKey.trim()}
            onClick={async () => {
              setTesting(true)
              setTestResult('正在测试…')
              const result = await testByokConnection(settings)
              setTestResult(`${result.message}（${result.latencyMs}ms）`)
              setTestOk(result.ok)
              setTesting(false)
            }}
          >
            {testing ? '测试中…' : '测试连通性'}
          </button>
          {settings.offlineMode ? <span className="muted small">离线模式开启时无法测试。</span> : null}
        </div>
        {testResult ? (
          <p className="small row gap-sm">
            <Icon name={testOk ? 'circle-check' : 'alert-triangle'} size={14} />
            <span>{testResult}</span>
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h2>安全</h2>
        <p className="muted small row gap-sm">
          <Icon name={hasPassphrase ? 'shield-check' : keychainReady ? 'key' : 'alert-triangle'} size={14} />
          <span>当前保险箱：
          {hasPassphrase
            ? '已启用口令保护（PBKDF2 + AES-GCM）'
            : keychainReady
              ? '无口令模式 · 主密钥由系统钥匙串保管'
              : '无口令模式（密钥随库存储）'}</span>
        </p>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={settings.useKeychain}
            disabled={!isDesktop() || keychainReady === false}
            onChange={(e) => void updateSettings({ useKeychain: e.target.checked })}
          />
          <span>
            <strong>用系统钥匙串保护主密钥</strong>
            <span className="muted small">
              {!isDesktop()
                ? '浏览器环境没有系统钥匙串，无法开启。'
                : keychainReady === false
                  ? '当前系统未提供可用的加密能力（safeStorage 不可用）。'
                  : '无口令模式下，主密钥用 Windows DPAPI / macOS 钥匙串加密后再落盘；即使库文件被拷走也解不开。'}
            </span>
          </span>
        </label>

        <div className="field-grid">
          <label>
            <span>{hasPassphrase ? '设置新口令（至少 6 位）' : '为保险箱设置口令'}</span>
            <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="至少 6 位" autoComplete="new-password" />
          </label>
        </div>
        <div className="row gap">
          <button
            type="button"
            className="btn"
            disabled={newPass.length < 6}
            onClick={async () => {
              await vault.setPassphrase(newPass)
              setNewPass('')
              notify('已更新保险箱口令，下次打开需要输入新口令。', 'success')
            }}
          >
            更新口令
          </button>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await vault.setPassphrase(null)
              notify('已切换为无口令模式（仍为本地加密存储）。', 'warn')
            }}
          >
            移除口令
          </button>
          <button type="button" className="btn" onClick={lockVault}>
            立即锁定保险箱
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>数据</h2>
        <div className="row gap">
          <button type="button" className="btn" onClick={() => void exportBackup()}>
            导出备份（明文 JSON，不含密钥）
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setConfirmWipe(true)}>
            清空本地全部数据
          </button>
        </div>
        <p className="muted small">
          {store?.driver === 'sqlite'
            ? `数据位置：单文件加密库 ${store.file ?? ''}（AES-256-GCM 逐条加密，可直接整体备份 / 迁移）。点击上方按钮会造成不可恢复的删除，请定期导出备份。`
            : '数据位置：浏览器 IndexedDB（本机）。清除浏览器站点数据或点击上方按钮都会造成不可恢复的删除，请定期导出备份。'}
        </p>
      </section>

      <section className="panel">
        <h2>软件更新</h2>
        <p className="muted small">
          {update.mode === 'installer'
            ? '安装版支持自动更新：发现新版本后可一键下载，重启应用即完成升级。'
            : update.mode === 'portable'
              ? '当前是免安装版（便携 exe），无法自我替换；发现新版本时会提示你到 Releases 下载。'
              : '当前为开发模式：更新检查仅用于验证提示链路。'}
        </p>
        <ul className="plain-list">
          <li>
            <span>当前版本</span>
            <span className="muted small">{update.currentVersion}</span>
          </li>
          <li>
            <span>更新状态</span>
            <span className="muted small">{updateHeadline(update)}</span>
          </li>
        </ul>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={settings.autoCheckUpdates}
            onChange={(e) => void updateSettings({ autoCheckUpdates: e.target.checked })}
          />
          <span>
            <strong>启动后自动检查更新</strong>
            <span className="muted small">
              这是本应用唯一会联网的行为（只读取 GitHub 上的版本号与发布说明，不上传任何本地数据）。离线环境下关闭即可。
            </span>
          </span>
        </label>
        <div className="row gap">
          <button
            type="button"
            className="btn"
            disabled={checkingUpdate}
            onClick={async () => {
              setCheckingUpdate(true)
              await updaterActions.check()
              setCheckingUpdate(false)
            }}
          >
            {checkingUpdate ? '检查中…' : '检查更新'}
          </button>
          {update.state === 'available' && update.mode === 'installer' ? (
            <button type="button" className="btn btn-primary" onClick={() => void updaterActions.download()}>
              下载更新
            </button>
          ) : null}
          {update.state === 'downloaded' ? (
            <button type="button" className="btn btn-primary" onClick={() => void updaterActions.install()}>
              重启并安装
            </button>
          ) : null}
          <button type="button" className="btn" onClick={() => void updaterActions.openDownloadPage()}>
            打开发布页
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>关于</h2>
        <ul className="plain-list">
          <li>
            <span>应用版本</span>
            <span className="muted small">V1 {__APP_VERSION__}</span>
          </li>
          <li>
            <span>本地规则库版本</span>
            <span className="muted small">{RULES_VERSION}</span>
          </li>
          <li>
            <span>当前时间</span>
            <span className="muted small">{formatDateTime(new Date().toISOString())}</span>
          </li>
          <li>
            <span>更新方式</span>
            <span className="muted small">
              {update.mode === 'installer' ? '安装版自动更新（electron-updater）' : '手动下载替换'}
            </span>
          </li>
          <li>
            <span>路线图</span>
            <span className="muted small">v2：多人协作复核 + 条款库云端增量更新 + 私有同步</span>
          </li>
        </ul>
        <Disclaimer />
      </section>

      {confirmWipe ? (
        <div className="modal-backdrop" onClick={() => setConfirmWipe(false)} role="presentation">
          <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>清空所有本地数据？</h2>
            </div>
            <div className="modal-body">
              <p>该操作会删除本机上的全部文档、分析结果与 BYOK 密钥，且无法撤销。建议先导出备份。</p>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn" onClick={() => setConfirmWipe(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  setConfirmWipe(false)
                  await wipeAll()
                }}
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

