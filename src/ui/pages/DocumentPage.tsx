import { useMemo, useState, type ReactNode } from 'react'
import { classifyRationale } from '../../core/analyze'
import { CATEGORIES } from '../../core/classify'
import type { CategoryCode, RiskFlag, Severity } from '../../core/types'
import { useApp } from '../../state/store'
import { CategoryTag, Disclaimer, RiskBadge } from '../components/Common'
import { dueText, formatBytes, formatDateTime } from '../format'
import { navigate } from '../router'

interface HighlightRange {
  start: number
  end: number
  severity: Severity
  flagId: string
}

export function DocumentPage({ id }: { id: string }) {
  const { documents, reanalyze, removeDocument, setFlagStatus, runByok, canRunByok, settings, setCategory } = useApp()
  const [selected, setSelected] = useState<string | null>(null)
  const [showLow, setShowLow] = useState(settings.showLowRisk)

  const doc = documents.find((d) => d.id === id)

  const ranges = useMemo<HighlightRange[]>(() => {
    if (!doc?.analysis) return []
    const list: HighlightRange[] = []
    for (const risk of doc.analysis.risks) {
      if (risk.status === 'false_positive') continue
      if (risk.quoteStart === null) continue
      list.push({ start: risk.quoteStart, end: risk.quoteStart + risk.quote.length, severity: risk.severity, flagId: risk.id })
    }
    return list.sort((a, b) => a.start - b.start)
  }, [doc])

  if (!doc) {
    return (
      <div className="page">
        <p className="muted">文档不存在或已被删除。</p>
        <button type="button" className="btn" onClick={() => navigate({ name: 'vault' })}>
          返回保险箱
        </button>
      </div>
    )
  }

  const analysis = doc.analysis
  const grouped = groupBySeverity(analysis?.risks ?? [])
  const confidence = Math.round((analysis?.categoryConfidence ?? 0) * 100)

  return (
    <div className="page doc-page">
      <header className="page-head">
        <div className="row gap">
          <button type="button" className="btn btn-sm" onClick={() => navigate({ name: 'vault' })}>
            ← 返回
          </button>
          <div>
            <h1>{doc.title}</h1>
            <p className="muted small">
              {doc.fileName} · {formatBytes(doc.sizeBytes)}
              {doc.pageCount ? ` · ${doc.pageCount} 页` : ''} · 导入于 {formatDateTime(doc.importedAt)} · 规则库{' '}
              {analysis?.rulesVersion ?? '-'} · 引擎 {analysis?.engine ?? '-'}
            </p>
          </div>
        </div>
        <div className="row gap">
          <select
            className="select"
            value={doc.category}
            onChange={(e) => void setCategory(doc.id, e.target.value as CategoryCode)}
            title="分类由本地关键词打分得出，可手动纠正（纠正后会按新场景重跑规则）"
          >
            {CATEGORIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={() => void reanalyze(doc.id)}>
            重新分析
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canRunByok}
            title={canRunByok ? '调用你自己配置的模型做深度分析' : '需在设置中开启 BYOK 并关闭离线模式'}
            onClick={() => void runByok(doc.id)}
          >
            🔮 BYOK 深度分析
          </button>
        </div>
      </header>

      <section className="doc-summary">
        <div className="summary-card">
          <div className="row gap">
            <CategoryTag code={doc.category} />
            <span className="muted small">分类置信度 {confidence}%</span>
          </div>
          <p className="small">{analysis ? classifyRationale(analysis) : '尚未分析'}</p>
          {analysis && analysis.category === 'other' ? (
            <p className="small warn-text">
              提示：未能识别具体场景。可在右上角手动选择分类，常见坑点会更准确。
            </p>
          ) : null}
        </div>
        <div className="summary-card">
          <div className="row gap-sm">
            {grouped.high.length ? <RiskBadge severity="high" count={grouped.high.length} /> : null}
            {grouped.medium.length ? <RiskBadge severity="medium" count={grouped.medium.length} /> : null}
            {grouped.low.length ? <RiskBadge severity="low" count={grouped.low.length} /> : null}
            {!analysis || analysis.risks.length === 0 ? <span className="tag tag-muted">未命中已知坑点规则</span> : null}
          </div>
          <p className="muted small">点击右侧的条目可定位到原文；对误报可标记，标记只保存在本机。</p>
        </div>
        {analysis && analysis.keyDates.length > 0 ? (
          <div className="summary-card">
            <strong className="small">关键日期</strong>
            <ul className="date-list">
              {analysis.keyDates.slice(0, 5).map((kd, i) => (
                <li key={`${kd.label}-${i}`}>
                  <span>{kd.label}</span>
                  <span className="muted small">{kd.date ? `${kd.date} · ${dueText(kd.date)}` : kd.relativeText ?? '需人工确认'}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {analysis && analysis.notes.length > 0 ? (
        <ul className="notes">
          {analysis.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      <div className="doc-body">
        <section className="pane">
          <div className="pane-head">
            <h2>原文</h2>
            <span className="muted small">共 {analysis?.clauses.length ?? 0} 个条款片段</span>
          </div>
          <div className="doc-text">{renderHighlighted(doc.text, ranges, selected)}</div>
        </section>

        <section className="pane">
          <div className="pane-head">
            <h2>坑点清单</h2>
            <label className="inline-check">
              <input type="checkbox" checked={showLow} onChange={(e) => setShowLow(e.target.checked)} />
              显示低风险
            </label>
          </div>

          <div className="risk-list">
            {(['high', 'medium', 'low'] as Severity[]).flatMap((severity) => {
              if (severity === 'low' && !showLow) return []
              const items = grouped[severity]
              if (items.length === 0) return []
              return [
                <h3 key={`h-${severity}`} className={`risk-group risk-group-${severity}`}>
                  {severity === 'high' ? '高风险（重大权益/财产损失）' : severity === 'medium' ? '中风险（明显不利，可协商）' : '低风险（表述模糊，建议澄清）'}
                  <span className="muted small"> · {items.length} 条</span>
                </h3>,
                ...items.map((risk) => (
                  <article
                    key={risk.id}
                    className={`risk-card risk-${risk.severity} ${selected === risk.id ? 'selected' : ''} ${
                      risk.status === 'false_positive' ? 'dismissed' : ''
                    }`}
                    onClick={() => setSelected(risk.id)}
                  >
                    <div className="risk-head">
                      <RiskBadge severity={risk.severity} />
                      <strong>{risk.ruleTitle}</strong>
                      {risk.byModel ? <span className="tag tag-model">模型</span> : null}
                      {risk.status === 'confirmed' ? <span className="tag tag-ok">已确认</span> : null}
                      {risk.status === 'false_positive' ? <span className="tag tag-muted">已标误报</span> : null}
                    </div>
                    <blockquote>{risk.quote}</blockquote>
                    <p>
                      <strong>为什么是坑：</strong>
                      {risk.reason}
                    </p>
                    <p>
                      <strong>建议：</strong>
                      {risk.suggestion}
                    </p>
                    {risk.legalBasis ? <p className="muted small">依据：{risk.legalBasis}</p> : null}
                    <div className="risk-actions">
                      <button
                        type="button"
                        className="link-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          void setFlagStatus(doc.id, risk.id, risk.status === 'confirmed' ? 'open' : 'confirmed')
                        }}
                      >
                        {risk.status === 'confirmed' ? '取消确认' : '确认属实'}
                      </button>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          void setFlagStatus(doc.id, risk.id, risk.status === 'false_positive' ? 'open' : 'false_positive')
                        }}
                      >
                        {risk.status === 'false_positive' ? '恢复' : '标记误报'}
                      </button>
                    </div>
                  </article>
                )),
              ]
            })}

            {analysis && analysis.risks.length === 0 ? (
              <div className="empty small">
                <div className="empty-icon">✅</div>
                <h3>本地规则库未发现明显坑点</h3>
                <p className="muted small">可开启 BYOK 用你自己的模型做一次语义级复核（需联网，数据只发往你指定的接口）。</p>
              </div>
            ) : null}
          </div>

          <Disclaimer compact />
        </section>
      </div>

      <footer className="page-foot row gap">
        <button
          type="button"
          className="btn btn-danger"
          onClick={async () => {
            await removeDocument(doc.id)
            navigate({ name: 'vault' })
          }}
        >
          删除该文档
        </button>

      </footer>
    </div>
  )
}

function groupBySeverity(risks: RiskFlag[]): Record<Severity, RiskFlag[]> {
  const active = risks.filter((r) => r.status !== 'false_positive')
  return {
    high: active.filter((r) => r.severity === 'high'),
    medium: active.filter((r) => r.severity === 'medium'),
    low: active.filter((r) => r.severity === 'low'),
  }
}

function renderHighlighted(text: string, ranges: HighlightRange[], selected: string | null): ReactNode[] {
  const clean = text.replace(/\f/g, '\n')
  if (ranges.length === 0) return [clean]

  const nodes: ReactNode[] = []
  let cursor = 0
  ranges.forEach((range, i) => {
    const start = Math.max(cursor, range.start)
    const end = Math.min(clean.length, range.end)
    if (end <= start) return
    if (start > cursor) nodes.push(clean.slice(cursor, start))
    nodes.push(
      <mark key={`${range.flagId}-${i}`} className={`mark mark-${range.severity} ${selected === range.flagId ? 'mark-active' : ''}`}>
        {clean.slice(start, end)}
      </mark>,
    )
    cursor = end
  })
  if (cursor < clean.length) nodes.push(clean.slice(cursor))
  return nodes
}


